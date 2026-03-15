/**
 * Viber channel — webhook handler. Receives Viber callbacks (message, webhook verification),
 * runs the default agent with conversation history per user, and sends the reply via send_message API.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { readConfig } from "../core/config.js";
import type { MemoryStore } from "../db/memory-store.js";
import { jsonResponse, errorMessage, parseJsonBody } from "./utils.js";
import { runAgentWithConversation, getDefaultAgent } from "./channel-run.js";

const VIBER_API = "https://chatapi.viber.com/pa";
const SENDER_NAME_MAX = 28;

function verifyViberSignature(authToken: string, signature: string, body: string): boolean {
  if (!signature || !body) return false;
  const hmac = createHmac("sha256", authToken);
  hmac.update(body);
  const expected = hmac.digest("hex");
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** POST /api/channels/viber/set-webhook — set Viber webhook URL. Body: { base_url: string } (HTTPS). */
export async function handleViberSetWebhook(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  const parsed = await parseJsonBody<{ base_url?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const baseUrl = typeof parsed.body.base_url === "string" ? parsed.body.base_url.trim() : "";
  if (!baseUrl) {
    return jsonResponse({ error: "base_url is required" }, 400);
  }
  const webhookPath = "/api/channels/viber/webhook";
  const webhookUrl = baseUrl.replace(/\/+$/, "") + webhookPath;
  if (!webhookUrl.startsWith("https://")) {
    return jsonResponse({ error: "base_url must be HTTPS (Viber requirement)" }, 400);
  }
  const config = await readConfig();
  const authToken = config.viber_auth_token?.trim();
  if (!authToken) {
    return jsonResponse({ error: "Auth token not configured. Save your token in Settings first." }, 400);
  }
  try {
    const res = await fetch(`${VIBER_API}/set_webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Viber-Auth-Token": authToken,
      },
      body: JSON.stringify({
        url: webhookUrl,
        event_types: ["delivered", "seen", "failed", "subscribed", "unsubscribed", "conversation_started", "message"],
      }),
    });
    const data = (await res.json()) as { status?: number; status_message?: string };
    if (data.status !== 0) {
      return jsonResponse({ ok: false, error: data.status_message ?? "Viber API error" }, 400);
    }
    return jsonResponse({ ok: true, webhook_url: webhookUrl });
  } catch (err) {
    const msg = errorMessage(err);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
}

/** GET /api/channels/viber/status — returns whether auth token is set and webhook (no token exposed). */
export async function handleViberStatus(): Promise<Response> {
  const config = await readConfig();
  const authToken = config.viber_auth_token?.trim();
  if (!authToken) {
    return jsonResponse({ configured: false, webhook_set: false, webhook_url: null });
  }
  try {
    const res = await fetch(`${VIBER_API}/get_account_info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Viber-Auth-Token": authToken,
      },
      body: "{}",
    });
    const data = (await res.json()) as { status?: number; webhook?: string };
    if (data.status !== 0) {
      return jsonResponse({ configured: true, webhook_set: false, webhook_url: null, error: "Invalid token or API error" });
    }
    const url = data.webhook ?? null;
    return jsonResponse({
      configured: true,
      webhook_set: Boolean(url && url.length > 0),
      webhook_url: url || null,
    });
  } catch (err) {
    const msg = errorMessage(err);
    return jsonResponse({ configured: true, webhook_set: false, webhook_url: null, error: msg });
  }
}

export interface ViberCallbackPayload {
  event?: string;
  timestamp?: number;
  message_token?: number;
  sender?: { id?: string; name?: string };
  message?: { type?: string; text?: string };
  user?: { id?: string };
}

async function sendViberMessage(authToken: string, receiver: string, text: string): Promise<void> {
  const name = "Agent".slice(0, SENDER_NAME_MAX);
  const res = await fetch(`${VIBER_API}/send_message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Viber-Auth-Token": authToken,
    },
    body: JSON.stringify({
      receiver,
      type: "text",
      text: text.slice(0, 7000),
      sender: { name },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[viber] send_message failed:", res.status, err);
  }
}

/** Process one Viber message callback. Runs agent and sends reply. */
export async function processViberCallback(
  memoryStore: MemoryStore,
  payload: ViberCallbackPayload
): Promise<void> {
  if (payload.event !== "message") return;
  const senderId = payload.sender?.id;
  if (!senderId) return;

  const message = payload.message;
  const type = message?.type;
  const text = type === "text" && typeof message?.text === "string" ? message.text.trim() : "";
  if (!text) return;

  const config = await readConfig();
  const authToken = config.viber_auth_token?.trim();
  if (!authToken) return;

  const agent = await getDefaultAgent(config, "viber_default_agent_id");
  if (!agent) {
    await sendViberMessage(authToken, senderId, "No agent configured. Set default agent in Settings.");
    return;
  }

  const conversationId = `viber:${senderId}`;
  await runAgentWithConversation(memoryStore, agent, conversationId, senderId, text, (output) =>
    sendViberMessage(authToken, senderId, output)
  );
}

/** POST /api/channels/viber/webhook — Viber callbacks (webhook verification + message). */
export async function handleViberWebhook(
  req: Request,
  memoryStore: MemoryStore
): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-viber-content-signature") ?? "";

  let payload: ViberCallbackPayload;
  try {
    payload = JSON.parse(rawBody) as ViberCallbackPayload;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const config = await readConfig();
  const authToken = config.viber_auth_token?.trim();

  if (authToken && signature) {
    const ok = verifyViberSignature(authToken, signature, rawBody);
    if (!ok) {
      console.warn("[viber] Invalid request signature");
      return jsonResponse({ error: "Invalid signature" }, 401);
    }
  }

  if (payload.event === "webhook") {
    return jsonResponse({ status: 0 });
  }

  if (payload.event === "message" && payload.sender?.id) {
    if (!authToken) {
      console.warn("[viber] Message received but viber_auth_token not configured");
      return jsonResponse({ status: 0 });
    }
    setImmediate(() => {
      processViberCallback(memoryStore, payload).catch((err) => {
        const msg = errorMessage(err);
        console.error("[viber] process error:", msg);
      });
    });
  }

  return jsonResponse({ status: 0 });
}
