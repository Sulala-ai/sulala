/**
 * Slack channel — Events API webhook. Receives events (e.g. message),
 * runs the default agent with conversation history per channel+user, and
 * sends the reply via chat.postMessage.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { readConfig } from "../core/config.js";
import type { MemoryStore } from "../db/memory-store.js";
import { jsonResponse, errorMessage } from "./utils.js";
import { runAgentWithConversation, getDefaultAgent } from "./channel-run.js";

function verifySlackSignature(
  signingSecret: string,
  signature: string,
  body: string,
  timestamp: string
): boolean {
  if (!signature.startsWith("v0=")) return false;
  const base = `v0:${timestamp}:${body}`;
  const hmac = createHmac("sha256", signingSecret);
  hmac.update(base);
  const expected = "v0=" + hmac.digest("hex");
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export interface SlackEventPayload {
  type?: string;
  token?: string;
  challenge?: string;
  event?: {
    type?: string;
    channel?: string;
    user?: string;
    text?: string;
    ts?: string;
    bot_id?: string;
    subtype?: string;
  };
}

async function sendSlackMessage(
  botToken: string,
  channel: string,
  text: string,
  threadTs?: string
): Promise<void> {
  const url = "https://slack.com/api/chat.postMessage";
  const body: { channel: string; text: string; thread_ts?: string } = {
    channel,
    text: text.slice(0, 4000),
  };
  if (threadTs) body.thread_ts = threadTs;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[slack] chat.postMessage failed:", res.status, err);
  }
}

/** Process one Slack event (message). Runs agent and sends reply. */
export async function processSlackEvent(
  memoryStore: MemoryStore,
  payload: SlackEventPayload
): Promise<void> {
  const event = payload.event;
  if (!event?.channel || event.type !== "message") return;
  if (event.bot_id) return;
  if (event.subtype === "bot_message") return;

  const text = typeof event.text === "string" ? event.text.trim() : "";
  if (!text) return;

  const config = await readConfig();
  const botToken = config.slack_bot_token?.trim();
  if (!botToken) return;

  const agent = await getDefaultAgent(config, "slack_default_agent_id");
  if (!agent) {
    await sendSlackMessage(botToken, event.channel, "No agent configured. Set default agent in Settings.");
    return;
  }

  const userId = event.user ?? "unknown";
  const conversationId = `slack:${event.channel}:${userId}`;
  await runAgentWithConversation(memoryStore, agent, conversationId, userId, text, (output) =>
    sendSlackMessage(botToken, event.channel, output, event.ts)
  );
}

/** GET /api/channels/slack/status — returns whether Slack is configured (no secrets). */
export async function handleSlackStatus(): Promise<Response> {
  const config = await readConfig();
  const configured = Boolean(config.slack_bot_token?.trim());
  return jsonResponse({
    configured,
  });
}

/** POST /api/channels/slack/webhook — Slack Events API endpoint. */
export async function handleSlackWebhook(
  req: Request,
  memoryStore: MemoryStore
): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-slack-signature") ?? "";
  const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";

  const config = await readConfig();
  const signingSecret = config.slack_signing_secret?.trim();
  if (signingSecret && signature && timestamp) {
    const ok = verifySlackSignature(signingSecret, signature, rawBody, timestamp);
    if (!ok) {
      console.warn("[slack] Invalid request signature");
      return jsonResponse({ error: "Invalid signature" }, 401);
    }
  }

  let payload: SlackEventPayload;
  try {
    payload = JSON.parse(rawBody) as SlackEventPayload;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (payload.type === "url_verification" && typeof payload.challenge === "string") {
    return jsonResponse({ challenge: payload.challenge });
  }

  if (payload.type === "event_callback" && payload.event?.channel) {
    if (!config.slack_bot_token?.trim()) {
      console.warn("[slack] Event received but slack_bot_token not configured");
      return jsonResponse({ ok: true });
    }
    setImmediate(() => {
      processSlackEvent(memoryStore, payload).catch((err) => {
        const msg = errorMessage(err);
        console.error("[slack] process error:", msg);
      });
    });
  }

  return jsonResponse({ ok: true });
}
