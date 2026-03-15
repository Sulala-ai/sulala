/**
 * Discord channel — Interactions API webhook. Receives slash-command interactions
 * (e.g. /chat message), runs the default agent, and replies via followup message.
 */

import nacl from "tweetnacl";
import { readConfig } from "../core/config.js";
import type { MemoryStore } from "../db/memory-store.js";
import { jsonResponse, errorMessage } from "./utils.js";
import { runAgentWithConversation, getDefaultAgent } from "./channel-run.js";

function hexToUint8Array(hex: string): Uint8Array {
  const buf = Buffer.from(hex.replace(/^0x/, ""), "hex");
  return new Uint8Array(buf);
}

function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string
): boolean {
  try {
    const publicKey = hexToUint8Array(publicKeyHex);
    const signature = hexToUint8Array(signatureHex);
    const message = new TextEncoder().encode(timestamp + body);
    return nacl.sign.detached.verify(message, signature, publicKey);
  } catch {
    return false;
  }
}

export interface DiscordInteraction {
  type?: number;
  data?: {
    id?: string;
    name?: string;
    options?: Array<{ name?: string; value?: string; type?: number }>;
  };
  channel_id?: string;
  user?: { id?: string; username?: string };
  application_id?: string;
  token?: string;
}

/** Type 1 = PING, Type 2 = APPLICATION_COMMAND, Type 5 = DEFERRED_CHANNEL_MESSAGE */
const INTERACTION_TYPE_PING = 1;
const INTERACTION_TYPE_APPLICATION_COMMAND = 2;
const INTERACTION_RESPONSE_DEFERRED = 5;

async function sendDiscordFollowup(
  applicationId: string,
  interactionToken: string,
  botToken: string,
  content: string
): Promise<void> {
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify({
      content: content.slice(0, 2000),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[discord] followup failed:", res.status, err);
  }
}

/** Process APPLICATION_COMMAND interaction: run agent and send followup. */
export async function processDiscordInteraction(
  memoryStore: MemoryStore,
  interaction: DiscordInteraction
): Promise<void> {
  if (interaction.type !== INTERACTION_TYPE_APPLICATION_COMMAND || !interaction.data?.options) {
    return;
  }

  const appId = interaction.application_id;
  const token = interaction.token;
  const channelId = interaction.channel_id;
  const userId = interaction.user?.id ?? "unknown";
  if (!appId || !token || !channelId) return;

  const messageOption = interaction.data.options.find(
    (o) => (o.name === "message" || o.name === "prompt" || o.name === "text") && typeof o.value === "string"
  );
  const text = messageOption?.value?.trim() ?? interaction.data.options[0]?.value?.trim() ?? "";
  if (!text) {
    await sendDiscordFollowup(appId, token, (await readConfig()).discord_bot_token ?? "", "Please provide a message (e.g. /chat message:hello).");
    return;
  }

  const config = await readConfig();
  const botToken = config.discord_bot_token?.trim();
  if (!botToken) return;

  const agent = await getDefaultAgent(config, "discord_default_agent_id");
  if (!agent) {
    await sendDiscordFollowup(appId, token, botToken, "No agent configured. Set default agent in Settings.");
    return;
  }

  const conversationId = `discord:${channelId}:${userId}`;
  await runAgentWithConversation(memoryStore, agent, conversationId, userId, text, (output) =>
    sendDiscordFollowup(appId, token, botToken, output)
  );
}

/** GET /api/channels/discord/status — returns whether Discord is configured (no secrets). */
export async function handleDiscordStatus(): Promise<Response> {
  const config = await readConfig();
  const configured = Boolean(config.discord_bot_token?.trim());
  return jsonResponse({
    configured,
  });
}

/** POST /api/channels/discord/webhook — Discord Interactions endpoint. */
export async function handleDiscordWebhook(
  req: Request,
  memoryStore: MemoryStore
): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-signature-ed25519") ?? "";
  const timestamp = req.headers.get("x-signature-timestamp") ?? "";

  const config = await readConfig();
  const publicKeyHex = config.discord_public_key?.trim();
  if (publicKeyHex && signature && timestamp) {
    const ok = verifyDiscordSignature(publicKeyHex, signature, timestamp, rawBody);
    if (!ok) {
      console.warn("[discord] Invalid request signature");
      return jsonResponse({ error: "Invalid signature" }, 401);
    }
  }

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(rawBody) as DiscordInteraction;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (interaction.type === INTERACTION_TYPE_PING) {
    return jsonResponse({ type: 1 });
  }

  if (interaction.type === INTERACTION_TYPE_APPLICATION_COMMAND) {
    if (!config.discord_bot_token?.trim()) {
      console.warn("[discord] Interaction received but discord_bot_token not configured");
      return jsonResponse({ type: 5, data: { content: "Bot not configured." } });
    }
    // Respond immediately with deferred (type 5) so we have time to run the agent
    const deferred = jsonResponse({
      type: INTERACTION_RESPONSE_DEFERRED,
      data: { content: "Thinking…" },
    });
    setImmediate(() => {
      processDiscordInteraction(memoryStore, interaction).catch((err) => {
        const msg = errorMessage(err);
        console.error("[discord] process error:", msg);
      });
    });
    return deferred;
  }

  return jsonResponse({ ok: true });
}
