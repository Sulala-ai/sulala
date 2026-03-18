/**
 * Schedule report delivery — on task.completed / task.failed for scheduled runs,
 * send a report to configured targets (e.g. Telegram).
 */

import { subscribe } from "./events.js";
import { readConfig } from "./config.js";
import { getAgent } from "./agent-registry.js";
import { loadGraph } from "./graphs.js";
import type { Task } from "./tasks.js";

const MAX_REPORT_LENGTH = 4000;

function buildReportMessage(task: Task, label: string): string {
  const status = task.status === "completed" ? "✅ Completed" : "❌ Failed";
  const output = task.result?.output?.trim() ?? "";
  const error = task.result?.error?.trim() ?? "";
  const body = task.status === "completed" ? output : (error || output);
  const truncated = body.length > MAX_REPORT_LENGTH ? body.slice(0, MAX_REPORT_LENGTH) + "…" : body;
  return [
    `[Schedule report] ${label}`,
    `Status: ${status}`,
    truncated ? `\n${truncated}` : "",
  ].join("\n").trim();
}

async function sendTelegramReport(botToken: string, chatId: string, text: string): Promise<void> {
  console.log("[schedule-reports] Sending to Telegram chat_id:", chatId, "message length:", text.length);
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4096),
    }),
  });
  if (res.ok) {
    console.log("[schedule-reports] Telegram sendMessage OK for chat_id:", chatId);
  } else {
    const err = await res.text();
    console.error("[schedule-reports] Telegram sendMessage failed:", res.status, "chat_id:", chatId, "error:", err);
  }
}

async function handleTaskFinished(event: { type: string; data: { task: Task } }): Promise<void> {
  const task = event.data.task;
  console.log("[schedule-reports] handleTaskFinished task_id:", task.id, "status:", task.status, "scheduled_run:", task.scheduled_run, "agent_id:", task.agent_id, "graph_id:", task.graph_id);

  const targets: Array<{ channel: "telegram"; address: string }> = [];
  let label: string;

  if (task.agent_id) {
    const agent = await getAgent(task.agent_id);
    if (!agent?.schedule_report_targets?.length) {
      console.log("[schedule-reports] Agent", task.agent_id, "has no schedule_report_targets; skipping.");
      return;
    }
    targets.push(...agent.schedule_report_targets.filter((t) => t.channel === "telegram"));
    label = `Agent "${agent.name}" (${task.agent_id})`;
  } else if (task.graph_id) {
    const graph = await loadGraph(task.graph_id);
    if (!graph?.schedule_report_targets?.length) {
      console.log("[schedule-reports] Graph", task.graph_id, "has no schedule_report_targets; skipping.");
      return;
    }
    targets.push(...graph.schedule_report_targets.filter((t) => t.channel === "telegram"));
    label = `Graph "${task.graph_id}"`;
  } else {
    return;
  }

  if (targets.length === 0) return;

  const config = await readConfig();
  const botToken = config.telegram_bot_token?.trim();
  if (!botToken) {
    console.warn("[schedule-reports] Telegram bot token not configured; skipping report.");
    return;
  }

  const defaultChatId = config.telegram_report_chat_id?.trim();
  console.log("[schedule-reports] Sending report for", label, "targets:", targets.length, "defaultChatId from config:", defaultChatId ?? "(not set)");
  const message = buildReportMessage(task, label);
  for (const t of targets) {
    const address = t.address.trim();
    if (!address) continue;
    const chatId = address === "__default__" ? defaultChatId : address;
    if (!chatId) {
      if (address === "__default__") {
        console.warn("[schedule-reports] Schedule report target is 'from Settings' but no Telegram report chat is set. Send /set_report_chat to your bot in Telegram, then set it in Settings > Telegram.");
      }
      continue;
    }
    await sendTelegramReport(botToken, chatId, message);
  }
}

/**
 * Register handlers for task.completed and task.failed to send reports to
 * configured Telegram (and future) targets. Call once at server startup.
 */
export function initScheduleReports(): void {
  subscribe("task.completed", (event) => handleTaskFinished(event as { type: string; data: { task: Task } }));
  subscribe("task.failed", (event) => handleTaskFinished(event as { type: string; data: { task: Task } }));
}
