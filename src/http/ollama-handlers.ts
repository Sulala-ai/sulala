/**
 * Ollama status, install, and model pull — server-side helpers for the dashboard.
 */

import { spawn } from "node:child_process";
import { jsonResponse, errorMessage, parseJsonBody, CORS_HEADERS } from "./utils.js";
import { readConfig } from "../core/config.js";
import {
  normalizeOllamaOpenAiBase,
  openAiBaseToOllamaOrigin,
  probeOllamaDaemon,
  isOllamaCliOnPath,
} from "../core/ollama.js";

function runSpawn(
  command: string,
  args: string[],
  options: { timeoutMs?: number } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  const timeoutMs = options.timeoutMs ?? 900_000;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    const t = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

export async function handleOllamaStatus(): Promise<Response> {
  const config = await readConfig();
  const baseRaw =
    process.env.OLLAMA_BASE_URL?.trim() || config.ollama_base_url?.trim() || "http://127.0.0.1:11434/v1";
  const base = normalizeOllamaOpenAiBase(baseRaw);
  const cli = isOllamaCliOnPath();
  const probe = await probeOllamaDaemon(base);
  return jsonResponse({
    cli_installed: cli,
    reachable: probe.reachable,
    version: probe.version ?? null,
    openai_base: base,
  });
}

export async function handleOllamaInstall(): Promise<Response> {
  const platform = process.platform;
  if (platform === "win32") {
    return jsonResponse(
      {
        ok: false,
        message:
          "Automatic install is not available on Windows from the server. Download and install Ollama from https://ollama.com/download then enable it in Settings.",
      },
      200
    );
  }
  try {
    if (platform === "darwin") {
      const { code, stderr } = await runSpawn("brew", ["install", "ollama"]);
      if (code !== 0) {
        return jsonResponse(
          {
            ok: false,
            message:
              stderr.trim() ||
              "Homebrew install failed. Install Homebrew from https://brew.sh or install Ollama from https://ollama.com/download",
          },
          200
        );
      }
      return jsonResponse({
        ok: true,
        message: "Ollama installed via Homebrew. Start the app or run `ollama serve`, then pull a model from Settings.",
      });
    }
    if (platform === "linux") {
      const { code, stderr } = await runSpawn(
        "sh",
        ["-c", "curl -fsSL https://ollama.com/install.sh | sh"],
        { timeoutMs: 900_000 }
      );
      if (code !== 0) {
        return jsonResponse(
          {
            ok: false,
            message: stderr.trim() || "Install script failed. See https://ollama.com/download",
          },
          200
        );
      }
      return jsonResponse({
        ok: true,
        message: "Ollama installed. Ensure the service is running, then pull a model from Settings.",
      });
    }
    return jsonResponse({ ok: false, message: "Unsupported platform." }, 200);
  } catch (err) {
    return jsonResponse({ ok: false, message: errorMessage(err) }, 200);
  }
}

/**
 * Stream model pull from the local Ollama daemon (NDJSON). Proxies Ollama POST /api/pull
 * so the dashboard can show per-layer download progress (total/completed).
 */
export async function handleOllamaPull(req: Request): Promise<Response> {
  const parsed = await parseJsonBody<{ model?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const model = typeof parsed.body.model === "string" ? parsed.body.model.trim() : "";
  if (!model) return jsonResponse({ error: "Missing model" }, 400);

  const config = await readConfig();
  const baseRaw =
    process.env.OLLAMA_BASE_URL?.trim() || config.ollama_base_url?.trim() || "http://127.0.0.1:11434/v1";
  const origin = openAiBaseToOllamaOrigin(normalizeOllamaOpenAiBase(baseRaw));
  const pullUrl = `${origin}/api/pull`;

  let ollamaRes: Response;
  try {
    ollamaRes = await fetch(pullUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model, stream: true }),
      signal: AbortSignal.timeout(900_000),
    });
  } catch (err) {
    return jsonResponse(
      {
        error: `Cannot reach Ollama at ${origin}. Start the Ollama app or \`ollama serve\`, and check Settings → base URL.`,
      },
      502
    );
  }

  if (!ollamaRes.ok) {
    const text = await ollamaRes.text().catch(() => "");
    return jsonResponse(
      { error: text.slice(0, 500) || `Ollama pull failed (${ollamaRes.status})` },
      ollamaRes.status >= 400 && ollamaRes.status < 600 ? ollamaRes.status : 502
    );
  }

  if (!ollamaRes.body) {
    return jsonResponse({ error: "Empty response from Ollama" }, 502);
  }

  const headers = new Headers(CORS_HEADERS as Headers);
  headers.set("Content-Type", "application/x-ndjson; charset=utf-8");
  headers.set("Cache-Control", "no-cache");
  return new Response(ollamaRes.body, { status: 200, headers });
}
