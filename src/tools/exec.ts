/**
 * Exec tool — run a shell command in the agent workspace or a skill directory (for skill scripts).
 */
import { spawn } from "node:child_process";
import { basename, join, resolve } from "node:path";
import { getSkillsDir, getWorkspaceDir, readSkillConfig } from "../core/config.js";
import { registerTool } from "../core/tool-registry.js";
import { errorMessage } from "../core/error.js";
import type { RunContext } from "../core/tool-registry.js";

const EXEC_TIMEOUT_MS = 60_000;

function sanitizeSkillId(skillId: string): string {
  return skillId.replace(/[^a-z0-9_-]/gi, "_");
}

registerTool({
  id: "exec",
  name: "exec",
  description:
    "Run a shell command. ALWAYS set 'skill_id' when using a skill that runs scripts (e.g. 'youtube', 'bluesky', 'gmail') so the command runs in that skill's directory with its config. Without 'skill_id', the command runs in the agent workspace and will NOT see skill scripts under ~/.agent-os/skills. Use 'command' (full string). Returns stdout, stderr, exitCode, cwd, and outputFile when command writes a file (e.g. -o out.png). Recommended commands: doc/EXEC_TOOL_REFERENCE.md.",
  input_schema: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to run (e.g. 'python3 scripts/send_email.py --token ... --to ... --subject ... --body ...' or 'ls -la')." },
      skill_id: { type: "string", description: "Optional. If set, cwd is this skill's directory (e.g. 'gmail')." },
    },
    required: ["command"],
  },
  async execute(input: Record<string, unknown>, context?: RunContext): Promise<unknown> {
    const commandStr = String(input.command ?? "").trim();
    if (!commandStr) return { ok: false, stdout: "", stderr: "command is required", exitCode: -1 };

    let cwd: string;
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) env[k] = v;
    }
    if (input.skill_id != null && String(input.skill_id).trim()) {
      const skillId = sanitizeSkillId(String(input.skill_id).trim());
      if (!skillId) return { ok: false, stdout: "", stderr: "skill_id must be non-empty", exitCode: -1 };
      cwd = join(getSkillsDir(), skillId);
      const skillConfig = await readSkillConfig(skillId);
      for (const [k, v] of Object.entries(skillConfig)) {
        if (typeof v === "string") env[k] = v;
      }
    } else {
      const agentId = context?.agentId;
      if (!agentId) return { ok: false, stdout: "", stderr: "exec needs agent context or skill_id", exitCode: -1 };
      cwd = getWorkspaceDir(agentId);
    }

    return new Promise<unknown>((resolvePromise) => {
      const child = spawn(commandStr, { shell: true, cwd: resolve(cwd), env, timeout: EXEC_TIMEOUT_MS });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
      child.on("error", (err) => {
        resolvePromise({ ok: false, stdout, stderr: stderr || errorMessage(err), exitCode: -1 });
      });
      child.on("close", (code, signal) => {
        const exitCode = code ?? (signal ? -1 : 0);
        const ok = exitCode === 0;
        const result: Record<string, unknown> = { ok, stdout: stdout.trimEnd(), stderr: stderr.trimEnd(), exitCode, cwd };
        if (ok && !input.skill_id) {
          const m = commandStr.match(/-o\s+(\S+)/g);
          const lastOut = m ? m[m.length - 1] : null;
          const outFile = lastOut ? lastOut.replace(/^-o\s+/, "").trim().replace(/^["']|["']$/g, "") : "";
          if (outFile) result.outputFile = basename(outFile);
        }
        resolvePromise(result);
      });
    });
  },
});
