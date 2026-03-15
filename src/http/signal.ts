/**
 * Signal channel — webhook from a Signal bridge (e.g. signal-cli or signal-cli-api).
 * Bridge receives Signal messages and POSTs to our webhook; we run the agent and
 * reply by POSTing to the bridge's send endpoint.
 */

import { readConfig } from "../core/config.js";
import type { MemoryStore } from "../db/memory-store.js";
import { jsonResponse, errorMessage, parseJsonBody } from "./utils.js";
import { runAgentWithConversation, getDefaultAgent } from "./channel-run.js";

export interface SignalWebhookPayload {
  /** Sender identifier (phone number or group id). */
  from: string;
  /** Message text. */
  text: string;
  /** Optional conversation id; if omitted we use signal:{from}. */
  conversation_id?: string;
}

async function sendSignalMessage(bridgeUrl: string, to: string, text: string): Promise<void> {
  const base = bridgeUrl.replace(/\/+$/, "");
  const url = `${base}/send`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, text: text.slice(0, 4096) }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[signal] send failed:", res.status, err);
  }
}

/** Process one Signal webhook payload. Runs agent and sends reply via bridge. */
export async function processSignalWebhook(
  memoryStore: MemoryStore,
  body: SignalWebhookPayload
): Promise<void> {
  const from = typeof body.from === "string" ? body.from.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!from) return;

  const config = await readConfig();
  const bridgeUrl = config.signal_bridge_url?.trim();
  if (!bridgeUrl) return;

  const agent = await getDefaultAgent(config, "signal_default_agent_id");
  if (!agent) {
    await sendSignalMessage(bridgeUrl, from, "No agent configured. Set default agent in Settings.");
    return;
  }

  if (!text) {
    await sendSignalMessage(bridgeUrl, from, "Send a text message to talk to the agent.");
    return;
  }

  const conversationId = body.conversation_id?.trim() || `signal:${from}`;
  await runAgentWithConversation(memoryStore, agent, conversationId, from, text, (output) =>
    sendSignalMessage(bridgeUrl, from, output)
  );
}

/** GET /api/channels/signal/status — returns whether Signal bridge URL is configured. */
export async function handleSignalStatus(): Promise<Response> {
  const config = await readConfig();
  const configured = Boolean(config.signal_bridge_url?.trim());
  return jsonResponse({ configured });
}

/** POST /api/channels/signal/webhook — receives messages from the Signal bridge. Body: { from, text, conversation_id? }. */
export async function handleSignalWebhook(
  req: Request,
  memoryStore: MemoryStore
): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const parsed = await parseJsonBody<SignalWebhookPayload>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const config = await readConfig();
  if (!config.signal_bridge_url?.trim()) {
    console.warn("[signal] Webhook received but signal_bridge_url not configured");
    return jsonResponse({ ok: true });
  }

  setImmediate(() => {
    processSignalWebhook(memoryStore, body).catch((err) => {
      const msg = errorMessage(err);
      console.error("[signal] process error:", msg);
    });
  });

  return jsonResponse({ ok: true });
}
