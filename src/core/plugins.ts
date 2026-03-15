/**
 * Plugin system — load plugins from ~/.agent-os/plugins (or AGENT_OS_PLUGINS_DIR).
 * Each plugin can export register(api) to receive the PluginAPI and register hooks.
 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { EventType, EventHandler } from "./events.js";
import { registerEventHooks } from "./events.js";
import { getAgentOsHome } from "./config.js";

export interface PluginAPI {
  /** Register one or more event handlers (e.g. task.completed, agent.started). */
  registerEventHooks(hooks: Partial<Record<EventType, EventHandler>>): void;
  /** Path to Agent OS home (~/.agent-os). */
  getAgentOsHome(): string;
}

const DEFAULT_PLUGINS_DIR = join(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".agent-os",
  "plugins"
);

export function getPluginsDir(): string {
  return process.env.AGENT_OS_PLUGINS_DIR || DEFAULT_PLUGINS_DIR;
}

function createAPI(): PluginAPI {
  return {
    registerEventHooks,
    getAgentOsHome,
  };
}

/**
 * Load all plugins from the plugins directory. Each plugin module can export
 * register(api: PluginAPI). Errors loading a plugin are logged and skipped.
 */
export async function loadPlugins(): Promise<void> {
  const dir = getPluginsDir();
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return;
    console.error("[plugins] Failed to read plugins dir:", err);
    return;
  }

  const api = createAPI();

  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const pluginPath = join(dir, name);
    let modulePath: string;
    try {
      const st = await stat(pluginPath);
      if (st.isDirectory()) {
        modulePath = join(pluginPath, "index.js");
      } else if (name.endsWith(".js") || name.endsWith(".ts")) {
        modulePath = pluginPath;
      } else {
        continue;
      }
    } catch {
      continue;
    }

    try {
      const mod = await import(modulePath);
      if (typeof mod.register === "function") {
        mod.register(api);
      }
    } catch (err) {
      console.error("[plugins] Failed to load plugin:", name, err);
    }
  }
}
