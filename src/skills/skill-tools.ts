/**
 * Skill HTTP tool creation — build Tool descriptors from skill doc (tools array, doc-only request, token request).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SkillFile } from "./skill-doc.js";
import type { Tool } from "../core/tool-registry.js";
import { errorMessage } from "../core/error.js";
import { getSkillsDir } from "../core/config.js";

const DEBUG_SKILLS =
  (process.env.AGENT_OS_DEBUG ?? "").trim() === "1" ||
  (process.env.AGENT_OS_DEBUG_SKILLS ?? "").trim() === "1";

function skillDebug(msg: string): void {
  if (!DEBUG_SKILLS) return;
  console.log(msg);
}

export function getSkillBaseUrl(): string {
  const env = process.env.AGENT_OS_SKILL_BASE_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const host = process.env.HOST || "127.0.0.1";
  const port = process.env.PORT || "3010";
  return `http://${host}:${port}`;
}

async function getAuthToken(skillId: string, credentials: string[] | undefined): Promise<string | null> {
  if (!credentials?.length) return null;
  const { readSkillConfig } = await import("../core/config.js");
  const stored = await readSkillConfig(skillId);
  for (const envVar of credentials) {
    const v = stored[envVar]?.trim() ?? process.env[envVar]?.trim();
    if (v) return v;
  }
  return null;
}

export function httpToolFromDescriptor(
  skill: string,
  _dir: string,
  desc: NonNullable<SkillFile["tools"]>[number]
): Tool {
  const id = desc.id;
  const method = (desc.method || "GET").toUpperCase();
  const path = desc.path || "/";
  const base = getSkillBaseUrl();
  return {
    id,
    name: `${skill}:${id}`,
    description: desc.description || `${method} ${path}`,
    input_schema: {
      type: "object",
      properties: {
        query: { type: "object", description: "Optional query parameters" },
        body: { type: "object", description: "Optional JSON request body (or pass agent_id, text, etc. at top level for memory_write)" },
      },
    },
    async execute(input) {
      const url = `${base}${path}`;
      const query = (input.query ?? {}) as Record<string, unknown>;
      let body = input.body as unknown;
      if ((body === undefined || body === null) && method !== "GET" && method !== "HEAD" && input && typeof input === "object") {
        const rest = { ...input } as Record<string, unknown>;
        delete rest.query;
        delete rest.body;
        if (Object.keys(rest).length > 0) body = rest;
      }
      const urlObj = new URL(url);
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) urlObj.searchParams.set(k, String(v));
      }
      const res = await fetch(urlObj.toString(), {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(body ?? {}),
      });
      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
      return { status: res.status, ok: res.ok, data: json };
    },
  };
}

export function createDocOnlyRequestTool(
  skillId: string,
  apiBase: string,
  credentials: string[] | undefined,
  authScheme: "Bearer" | "Apikey",
  authLocation?: "header" | "query",
  authParam?: string,
  skillDescription?: string
): Tool {
  const base = apiBase.replace(/\/$/, "");
  const desc = skillDescription?.trim()
    ? `${skillDescription.trim()} Use this tool with method, path, and optional query and body. See skill doc for paths and examples.`
    : `Call the API for the "${skillId}" skill. Provide method (GET, POST, etc.), path, and optional query (object) and body (object). Use the skill documentation in your context to know which paths and params to use.`;
  return {
    id: `${skillId}_request`,
    name: `${skillId}_request`,
    description: desc,
    input_schema: {
      type: "object",
      properties: {
        method: { type: "string", description: "HTTP method: GET, POST, PUT, PATCH, DELETE" },
        path: { type: "string", description: "Path (e.g. /upload_videos). Do not include base URL." },
        query: { type: "object", description: "Optional query parameters as key-value object" },
        body: { type: "object", description: "Optional JSON body for POST/PUT/PATCH" },
      },
      required: ["method", "path"],
    },
    async execute(input: Record<string, unknown>) {
      const method = String(input.method || "GET").toUpperCase();
      const path = String(input.path || "").replace(/^\//, "");
      const url = `${base}/${path}`;
      const query = input.query as Record<string, unknown> | undefined;
      const body = input.body;
      const urlObj = new URL(url);
      if (query && typeof query === "object") {
        for (const [k, v] of Object.entries(query)) {
          if (v !== undefined && v !== null) urlObj.searchParams.set(k, String(v));
        }
      }
      const token = await getAuthToken(skillId, credentials);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        const location = authLocation ?? "header";
        const param = (authParam ?? "Authorization").trim();
        if (location === "query") {
          urlObj.searchParams.set(param || "apiKey", token);
        } else {
          if (!param || param === "Authorization") {
            headers.Authorization = authScheme === "Apikey" ? `Apikey ${token}` : `Bearer ${token}`;
          } else {
            headers[param] = token;
          }
        }
      }
      const finalUrl = urlObj.toString();
      skillDebug(`[skill:${skillId}] ${method} ${finalUrl} (auth: ${token ? "yes" : "no"})`);
      try {
        const res = await fetch(finalUrl, {
          method,
          headers,
          body: method !== "GET" && method !== "HEAD" && body != null ? JSON.stringify(body) : undefined,
        });
        skillDebug(`[skill:${skillId}] ${method} ${finalUrl} -> ${res.status}`);
        const text = await res.text();
        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
        return { ok: res.ok, status: res.status, data };
      } catch (err) {
        const msg = errorMessage(err);
        console.error(`[skill:${skillId}] HTTP error`, msg);
        throw err;
      }
    },
  };
}

export function createTokenRequestTool(
  skillId: string,
  toolId: string,
  baseUrl: string,
  description?: string
): Tool {
  const base = baseUrl.replace(/\/$/, "");
  const desc =
    description?.trim() ||
    `Call the API with an access token. Get the token from the skill doc (e.g. Portal), then pass accessToken, method, path (relative to base URL), and optional body. Do NOT use the Portal request tool for this API's paths.`;
  return {
    id: toolId,
    name: toolId,
    description: desc,
    input_schema: {
      type: "object",
      properties: {
        accessToken: { type: "string", description: "Bearer token (from Portal or other source per skill doc)" },
        method: { type: "string", description: "HTTP method: GET, POST, PUT, PATCH, DELETE" },
        path: { type: "string", description: "Path relative to API base (e.g. gmail/v1/users/me/messages/send). Do not include base URL." },
        body: { type: "object", description: "Optional JSON body for POST/PUT/PATCH" },
      },
      required: ["accessToken", "method", "path"],
    },
    async execute(input: Record<string, unknown>) {
      const token = String(input.accessToken ?? "").trim();
      if (!token) {
        return { ok: false, status: 0, data: { error: "accessToken is required" } };
      }
      const method = String(input.method || "GET").toUpperCase();
      const path = String(input.path || "").replace(/^\//, "");
      const url = `${base}/${path}`;
      const body = input.body;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };
      skillDebug(`[skill:${skillId}] ${method} ${url} (token: yes)`);
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: method !== "GET" && method !== "HEAD" && body != null ? JSON.stringify(body) : undefined,
        });
        skillDebug(`[skill:${skillId}] ${method} ${url} -> ${res.status}`);
        const text = await res.text();
        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
        return { ok: res.ok, status: res.status, data };
      } catch (err) {
        const msg = errorMessage(err);
        console.error(`[skill:${skillId}] HTTP error`, msg);
        throw err;
      }
    },
  };
}
