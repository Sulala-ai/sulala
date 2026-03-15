/**
 * Event bus — in-process pub/sub for observability and plugins.
 */

import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";

export type EventType =
  | "task.created"
  | "task.started"
  | "task.completed"
  | "task.failed"
  | "agent.started"
  | "agent.completed"
  | "tool.called"
  | "tool.completed";

export interface Event<T = unknown> {
  type: EventType;
  timestamp: string;
  data: T;
}

export type EventHandler = (event: Event) => void | Promise<void>;

const subscribers = new Map<EventType, Set<EventHandler>>();

/**
 * Register observability hooks for one or more event types (plugin-friendly API).
 * Use this to react to task/agent/tool events without modifying core code.
 */
export function registerEventHooks(hooks: Partial<Record<EventType, EventHandler>>): void {
  for (const [type, handler] of Object.entries(hooks)) {
    if (type && handler && typeof handler === "function") {
      subscribe(type as EventType, handler as EventHandler);
    }
  }
}

export function subscribe(type: EventType, handler: EventHandler): void {
  let set = subscribers.get(type);
  if (!set) {
    set = new Set();
    subscribers.set(type, set);
  }
  set.add(handler);
}

export function unsubscribe(type: EventType, handler: EventHandler): void {
  subscribers.get(type)?.delete(handler);
}

export function publish<T>(type: EventType, data: T): void {
  const event: Event<T> = {
    type,
    timestamp: new Date().toISOString(),
    data,
  };
  const handlers = subscribers.get(type);
  if (!handlers || handlers.size === 0) return;

  for (const handler of handlers) {
    try {
      const result = handler(event);
      if (result && typeof (result as Promise<void>).then === "function") {
        (result as Promise<void>).catch((err) => {
          console.error("[events] handler error:", err);
        });
      }
    } catch (err) {
      console.error("[events] handler error:", err);
    }
  }
}

// Simple in-memory buffer of recent events for /api/logs or debugging.
const recent: Event[] = [];
const MAX_RECENT = 200;

function bufferEvent(e: Event): void {
  recent.push(e);
  if (recent.length > MAX_RECENT) {
    recent.splice(0, recent.length - MAX_RECENT);
  }
}

export function publishWithBuffer<T>(type: EventType, data: T): void {
  const event: Event<T> = {
    type,
    timestamp: new Date().toISOString(),
    data,
  };
  bufferEvent(event);
  const handlers = subscribers.get(type);
  if (!handlers || handlers.size === 0) return;
  for (const handler of handlers) {
    try {
      const result = handler(event);
      if (result && typeof (result as Promise<void>).then === "function") {
        (result as Promise<void>).catch((err) => {
          console.error("[events] handler error:", err);
        });
      }
    } catch (err) {
      console.error("[events] handler error:", err);
    }
  }
}

export function getRecentEvents(): Event[] {
  return [...recent];
}

// File logging (structured NDJSON) to ~/.agent-os/logs/agent-os.log
const LOG_DIR =
  process.env.AGENT_OS_LOGS_DIR ||
  join(process.env.HOME || process.env.USERPROFILE || "~", ".agent-os", "logs");
const LOG_FILE = join(LOG_DIR, "agent-os.log");

let logInitPromise: Promise<void> | null = null;

async function ensureLogDir(): Promise<void> {
  if (!logInitPromise) {
    logInitPromise = (async () => {
      try {
        await mkdir(LOG_DIR, { recursive: true });
      } catch (err) {
        console.error("[events] Failed to create log dir:", err);
      }
    })();
  }
  await logInitPromise;
}

async function appendEventToFile(e: Event): Promise<void> {
  try {
    await ensureLogDir();
    const line = JSON.stringify(e) + "\n";
    await appendFile(LOG_FILE, line, "utf-8");
  } catch (err) {
    console.error("[events] Failed to write log event:", err);
  }
}

// Subscribe file logger to all event types
for (const type of [
  "task.created",
  "task.started",
  "task.completed",
  "task.failed",
  "agent.started",
  "agent.completed",
  "tool.called",
  "tool.completed",
] as EventType[]) {
  subscribe(type, appendEventToFile);
}


