/**
 * Telegram channel — webhook handler. Receives Telegram updates, runs the default
 * agent with conversation history per chat, and sends the reply back via Bot API.
 */

import { readConfig } from "../core/config.js";
import type { MemoryStore } from "../db/memory-store.js";
import { jsonResponse, errorMessage, parseJsonBody } from "./utils.js";
import { runAgentWithConversation, getDefaultAgent } from "./channel-run.js";

/** POST /api/channels/telegram/set-webhook — set Telegram webhook URL. Body: { base_url: string } (e.g. https://abc.ngrok.io). */
export async function handleTelegramSetWebhook(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  const parsed = await parseJsonBody<{ base_url?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const baseUrl = typeof parsed.body.base_url === "string" ? parsed.body.base_url.trim() : "";
  if (!baseUrl) {
    return jsonResponse({ error: "base_url is required" }, 400);
  }
  const webhookPath = "/api/channels/telegram/webhook";
  const webhookUrl = baseUrl.replace(/\/+$/, "") + webhookPath;
  if (!webhookUrl.startsWith("https://")) {
    return jsonResponse({ error: "base_url must be HTTPS (Telegram requirement)" }, 400);
  }
  const config = await readConfig();
  const botToken = config.telegram_bot_token?.trim();
  if (!botToken) {
    return jsonResponse({ error: "Bot token not configured. Save your token in Settings first." }, 400);
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!data.ok) {
      return jsonResponse({ ok: false, error: data.description ?? "Telegram API error" }, 400);
    }
    return jsonResponse({ ok: true, webhook_url: webhookUrl });
  } catch (err) {
    const msg = errorMessage(err);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
}

/** GET /api/channels/telegram/status — returns whether bot token is set and webhook is registered (no token exposed). */
export async function handleTelegramStatus(): Promise<Response> {
  const config = await readConfig();
  const botToken = config.telegram_bot_token?.trim();
  if (!botToken) {
    return jsonResponse({ configured: false, webhook_set: false, webhook_url: null });
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    if (!res.ok) {
      return jsonResponse({ configured: true, webhook_set: false, webhook_url: null, error: "Invalid token or Telegram API error" });
    }
    const data = (await res.json()) as { ok?: boolean; result?: { url?: string } };
    const url = data?.result?.url ?? null;
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

export interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id?: number;
    from?: { id: number; username?: string; first_name?: string };
    chat: { id: number; type: string };
    date?: number;
    text?: string;
  };
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4096),
      parse_mode: undefined,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[telegram] sendMessage failed:", res.status, err);
  }
}

/** Process one Telegram update (from webhook or polling). Runs agent and sends reply. */
export async function processTelegramUpdate(
  memoryStore: MemoryStore,
  body: TelegramUpdate
): Promise<void> {
  const message = body.message;
  if (!message?.chat?.id) return;

  const chatId = message.chat.id;
  const text = typeof message.text === "string" ? message.text.trim() : "";
  const fromId = message.from?.id != null ? String(message.from.id) : null;

  const config = await readConfig();
  const botToken = config.telegram_bot_token?.trim();
  if (!botToken) return;

  const agent = await getDefaultAgent(config, "telegram_default_agent_id");
  if (!agent) {
    await sendTelegramMessage(botToken, chatId, "No agent configured. Set default agent in Settings.");
    return;
  }

  if (!text) {
    await sendTelegramMessage(botToken, chatId, "Send a text message to talk to the agent.");
    return;
  }

  const conversationId = `telegram:${chatId}`;
  await runAgentWithConversation(memoryStore, agent, conversationId, fromId, text, (output) =>
    sendTelegramMessage(botToken, chatId, output)
  );
}

export async function handleTelegramWebhook(
  req: Request,
  memoryStore: MemoryStore
): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const parsed = await parseJsonBody<TelegramUpdate>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const message = body.message;
  if (!message?.chat?.id) {
    return jsonResponse({ ok: true });
  }

  const config = await readConfig();
  if (!config.telegram_bot_token?.trim()) {
    console.warn("[telegram] Webhook received but telegram_bot_token not configured");
    return jsonResponse({ ok: true });
  }

  setImmediate(() => {
    processTelegramUpdate(memoryStore, body).catch((err) => {
      const msg = errorMessage(err);
      console.error("[telegram] process error:", msg);
    });
  });

  return jsonResponse({ ok: true });
}

const POLLING_INTERVAL_MS = 1000;
const GET_UPDATES_TIMEOUT = 30;

/** Start long-polling when bot token is set and no webhook is registered (no HTTPS needed).
 * Poll loop runs always so that if the token is added later (e.g. after onboard in Settings), polling starts without restart. */
export function startTelegramPolling(memoryStore: MemoryStore): void {
  let offset = 0;
  let webhookDeletedForToken: string | null = null;
  let loggedPollingStarted = false;

  async function poll() {
    const config = await readConfig();
    const botToken = config.telegram_bot_token?.trim();
    if (!botToken) {
      webhookDeletedForToken = null;
      loggedPollingStarted = false;
      setTimeout(poll, POLLING_INTERVAL_MS);
      return;
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
      if (!res.ok) {
        setTimeout(poll, POLLING_INTERVAL_MS);
        return;
      }
      const data = (await res.json()) as { ok?: boolean; result?: { url?: string } };
      const webhookUrl = data?.result?.url?.trim();
      if (webhookUrl) {
        setTimeout(poll, POLLING_INTERVAL_MS);
        return;
      }
      if (webhookDeletedForToken !== botToken) {
        await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`).catch(() => {});
        webhookDeletedForToken = botToken;
      }
      if (!loggedPollingStarted) {
        console.info("[telegram] polling started (no webhook set; no HTTPS required).");
        loggedPollingStarted = true;
      }
      const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&timeout=${GET_UPDATES_TIMEOUT}`;
      const getRes = await fetch(url);
      if (!getRes.ok) {
        setTimeout(poll, POLLING_INTERVAL_MS);
        return;
      }
      const updateData = (await getRes.json()) as { ok?: boolean; result?: TelegramUpdate[] };
      const updates = Array.isArray(updateData?.result) ? updateData.result : [];
      for (const update of updates) {
        if (update.update_id != null && update.update_id >= offset) {
          offset = update.update_id + 1;
        }
        processTelegramUpdate(memoryStore, update).catch((err) => {
          console.error("[telegram] polling process error:", err);
        });
      }
    } catch (err) {
      console.error("[telegram] polling fetch error:", err);
    }
    setTimeout(poll, 0);
  }

  poll();
}
