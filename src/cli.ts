#!/usr/bin/env bun
/**
 * Sulala CLI — manage and run the Agent OS.
 * Usage: sulala <command> [options]
 *   sulala version
 *   sulala start [--daemon]
 *   sulala stop
 *   sulala onboard
 *   sulala update
 *   sulala run <agent_id> <task...>
 */

import { join, dirname } from "node:path";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { getAgentOsHome } from "./core/config.js";
import { MemoryStore } from "./db/memory-store.js";
import { setAgentStore, seedAgentsIfEmpty, installSystemAgents } from "./core/agent-registry.js";
import { installSystemSkills } from "./skills/loader.js";
import { getAgent } from "./core/agent-registry.js";
import { runAgent } from "./core/runtime.js";

const PID_FILE = join(getAgentOsHome(), "sulala.pid");
const DEFAULT_PORT = 3010;

function openDashboard(): void {
  const port = parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);
  const url = `http://127.0.0.1:${port}`;
  const cmd =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  Bun.spawn(cmd, { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
}

function getVersion(): string {
  try {
    const path = join(import.meta.dir, "..", "package.json");
    const raw = readFileSync(path, "utf-8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function getVersionAsync(): Promise<string> {
  const path = join(import.meta.dir, "..", "package.json");
  const raw = await readFile(path, "utf-8");
  const pkg = JSON.parse(raw) as { version?: string };
  return pkg.version ?? "0.0.0";
}

function printHelp(): void {
  const v = getVersion();
  console.log(`
sulala v${v} — Agent OS CLI

Usage: sulala <command> [options]

Commands:
  version              Show version
  start [--daemon]     Start the server (default: foreground)
  stop                 Stop the server (when started with --daemon)
  onboard              First-time setup: create config, seed agents & skills, open dashboard
  update               Update package from npm and system agents/skills
  run <agent_id> <task>  Run an agent with a one-off task

Examples:
  sulala version
  sulala start
  sulala start --daemon
  sulala stop
  sulala onboard
  sulala update
  sulala run echo_agent What is 2+2?
`);
}

async function cmdVersion(): Promise<void> {
  const v = await getVersionAsync();
  console.log(v);
}

async function cmdStart(args: string[]): Promise<void> {
  const daemon = args.includes("--daemon");
  if (daemon) {
    await mkdir(getAgentOsHome(), { recursive: true });
    const projectRoot = join(import.meta.dir, "..");
    const distEntry = join(projectRoot, "dist", "index.js");
    const serverEntry = existsSync(distEntry) ? "dist/index.js" : "src/index.ts";
    const child = Bun.spawn(["bun", "run", serverEntry], {
      cwd: projectRoot,
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore",
      detached: true,
    });
    child.unref();
    await writeFile(PID_FILE, String(child.pid), "utf-8");
    console.log(`Sulala server started in background (PID ${child.pid}). Use 'sulala stop' to stop.`);
    return;
  }
  // Foreground: delegate to main server entry
  const { startServer } = await import("./server.js");
  await startServer();
}

async function cmdStop(): Promise<void> {
  if (!existsSync(PID_FILE)) {
    console.error("No PID file found. Is the server running with 'sulala start --daemon'?");
    process.exit(1);
  }
  const pidStr = await readFile(PID_FILE, "utf-8");
  const pid = parseInt(pidStr.trim(), 10);
  if (Number.isNaN(pid)) {
    console.error("Invalid PID in", PID_FILE);
    process.exit(1);
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === "ESRCH") {
      console.log("Process already stopped.");
    } else {
      console.error("Failed to stop process:", err?.message ?? e);
      process.exit(1);
    }
  }
  await unlink(PID_FILE).catch(() => {});
  console.log("Sulala server stopped.");
}

function getMemoryDbPath(): string {
  return process.env.AGENT_MEMORY_DB_PATH ?? join(getAgentOsHome(), "database.db");
}

/** Start the server in the background if not already running. Returns true if started, false if already running. */
async function startServerDaemonIfNeeded(): Promise<boolean> {
  if (existsSync(PID_FILE)) {
    try {
      const pidStr = await readFile(PID_FILE, "utf-8");
      const pid = parseInt(pidStr.trim(), 10);
      if (!Number.isNaN(pid)) {
        process.kill(pid, 0);
        return false; // already running
      }
    } catch {
      // process dead or invalid, continue to start
    }
  }
  await mkdir(getAgentOsHome(), { recursive: true });
  const projectRoot = join(import.meta.dir, "..");
  const distEntry = join(projectRoot, "dist", "index.js");
  const serverEntry = existsSync(distEntry) ? "dist/index.js" : "src/index.ts";
  const child = Bun.spawn(["bun", "run", serverEntry], {
    cwd: projectRoot,
    stdout: "ignore",
    stderr: "ignore",
    stdin: "ignore",
    detached: true,
  });
  child.unref();
  await writeFile(PID_FILE, String(child.pid), "utf-8");
  return true;
}

async function cmdOnboard(): Promise<void> {
  const home = getAgentOsHome();
  await mkdir(home, { recursive: true });
  await mkdir(dirname(getMemoryDbPath()), { recursive: true });

  const configPath = join(home, "config.json");
  if (!existsSync(configPath)) {
    await writeFile(
      configPath,
      JSON.stringify(
        {
          provider: null,
          api_key: null,
          openai_api_key: null,
          anthropic_api_key: null,
          google_api_key: null,
          openrouter_api_key: null,
          telegram_bot_token: null,
          telegram_default_agent_id: null,
          slack_bot_token: null,
          slack_signing_secret: null,
          slack_default_agent_id: null,
          discord_bot_token: null,
          discord_public_key: null,
          discord_default_agent_id: null,
          signal_bridge_url: null,
          signal_default_agent_id: null,
          viber_auth_token: null,
          viber_default_agent_id: null,
        },
        null,
        2
      ),
      "utf-8"
    );
    console.log("Created", configPath);
  }

  const memoryStore = new MemoryStore(getMemoryDbPath());
  setAgentStore(memoryStore);
  await seedAgentsIfEmpty();
  const { installed: agentsInstalled } = await installSystemAgents();
  const { installed: skillsInstalled } = await installSystemSkills();
  console.log("Onboard complete. Agents:", agentsInstalled, "Skills:", skillsInstalled);

  const started = await startServerDaemonIfNeeded();
  if (started) {
    console.log("Server starting in background. Use 'sulala stop' to stop.");
    // Give the server a moment to bind before opening the browser
    await new Promise((r) => setTimeout(r, 1500));
  }
  openDashboard();
}

const NPM_PACKAGE = "@sulala/agent-os";

async function cmdUpdate(): Promise<void> {
  // 1. Update package to latest from npm (global install)
  console.log(`Checking npm for latest ${NPM_PACKAGE}...`);
  const proc = Bun.spawn(["bun", "install", "-g", `${NPM_PACKAGE}@latest`], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const exit = await proc.exited;
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  if (exit === 0) {
    console.log("Package updated to latest from npm.");
    if (out.trim()) console.log(out.trim());
  } else {
    console.warn("Could not update package from npm (run 'bun install -g @sulala/agent-os@latest' manually):", err.trim() || out.trim());
  }

  // 2. Update system agents and skills (if DB exists)
  const dbPath = getMemoryDbPath();
  if (!existsSync(dbPath)) {
    console.log("No database found. Run 'sulala onboard' to set up agents and skills.");
    return;
  }
  const memoryStore = new MemoryStore(dbPath);
  setAgentStore(memoryStore);
  const { installed: agentsInstalled } = await installSystemAgents();
  const { installed: skillsInstalled } = await installSystemSkills();
  console.log("Update complete. New agents:", agentsInstalled, "New skills:", skillsInstalled);
}

async function cmdRun(args: string[]): Promise<void> {
  const agentId = args[0];
  const task = args.slice(1).join(" ").trim();
  if (!agentId || !task) {
    console.error("Usage: sulala run <agent_id> <task>");
    console.error("Example: sulala run echo_agent What is 2+2?");
    process.exit(1);
  }
  // Use same DB as server when present so dashboard agents are available
  const dbPath = getMemoryDbPath();
  if (existsSync(dbPath)) {
    setAgentStore(new MemoryStore(dbPath));
  }
  const agent = await getAgent(agentId);
  if (!agent) {
    console.error(`Agent not found: ${agentId}`);
    process.exit(1);
  }
  console.log(`Running ${agent.name}...`);
  const result = await runAgent({ agent, task });
  if (result.success) {
    console.log(result.output);
  } else {
    console.error("Error:", result.error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  if (!process.versions.bun) {
    console.error("Sulala CLI requires Bun. Use: bun run src/cli.ts");
    process.exit(1);
  }

  const argv = process.argv.slice(2);
  const command = argv[0]?.toLowerCase();
  const rest = argv.slice(1);

  switch (command) {
    case "version":
    case "-v":
    case "--version":
      await cmdVersion();
      break;
    case "start":
      await cmdStart(rest);
      break;
    case "stop":
      await cmdStop();
      break;
    case "onboard":
      await cmdOnboard();
      break;
    case "update":
      await cmdUpdate();
      break;
    case "run":
      await cmdRun(rest);
      break;
    case "help":
    case "-h":
    case "--help":
    case undefined:
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
