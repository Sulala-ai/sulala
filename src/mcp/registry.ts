import type { Tool, ToolInputSchema } from "../core/tool-registry.js";
import { registerTool, unregisterTool, getAllTools } from "../core/tool-registry.js";
import type { McpServerConfig } from "../core/config.js";
import { McpStdioClient } from "./stdio.js";

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return Boolean(x) && typeof x === "object" && !Array.isArray(x);
}

function safeToolId(serverId: string, toolName: string): string {
  const s = serverId.replace(/[^a-z0-9_-]/gi, "_");
  const t = toolName.replace(/[^a-z0-9_-]/gi, "_");
  return `mcp_${s}_${t}`;
}

function coerceInputSchema(schema: unknown): ToolInputSchema {
  if (!isPlainObject(schema)) return { type: "object", properties: {} };
  const properties = isPlainObject(schema.properties) ? (schema.properties as Record<string, unknown>) : undefined;
  const required = Array.isArray(schema.required) ? (schema.required as unknown[]).filter((r): r is string => typeof r === "string") : undefined;
  const propsOut: Record<string, { type: string; description?: string }> = {};
  if (properties) {
    for (const [k, v] of Object.entries(properties)) {
      if (!k) continue;
      if (isPlainObject(v)) {
        const type = typeof v.type === "string" ? v.type : "string";
        const description = typeof v.description === "string" ? v.description : undefined;
        propsOut[k] = { type, ...(description ? { description } : {}) };
      }
    }
  }
  return { type: "object", properties: propsOut, required };
}

const clients = new Map<string, McpStdioClient>();
const loadedServerIds = new Set<string>();

export function unregisterMcpTools(): void {
  for (const t of getAllTools()) {
    if (t.id.startsWith("mcp_")) unregisterTool(t.id);
  }
  loadedServerIds.clear();
}

export async function loadMcpServers(servers: McpServerConfig[]): Promise<void> {
  // Clear previous MCP tools (but keep built-ins + skills).
  unregisterMcpTools();

  for (const s of servers) {
    if (s.enabled === false) continue;
    const serverId = s.id.trim();
    if (!serverId) continue;
    if (s.transport && s.transport !== "stdio") continue;
    const cmd = s.command?.trim();
    if (!cmd) continue;

    let client = clients.get(serverId);
    if (!client) {
      client = new McpStdioClient({ id: serverId, name: s.name });
      clients.set(serverId, client);
    }

    if (!client.isRunning()) {
      await client.start(cmd, s.args ?? [], s.env ?? undefined);
      await client.initialize();
    }

    const tools = await client.listTools();
    for (const mt of tools) {
      const id = safeToolId(serverId, mt.name);
      const tool: Tool = {
        id,
        name: id,
        description: mt.description?.trim() || `MCP tool "${mt.name}" from server "${serverId}".`,
        input_schema: coerceInputSchema(mt.inputSchema),
        execute: async (input: Record<string, unknown>) => {
          const c = clients.get(serverId);
          if (!c) throw new Error(`MCP client not available: ${serverId}`);
          const res = await c.callTool(mt.name, input ?? {});
          return res;
        },
      };
      registerTool(tool);
    }
    loadedServerIds.add(serverId);
  }
}

export async function testMcpServer(server: McpServerConfig): Promise<{ tools: Array<{ name: string; description?: string }>; error?: string }> {
  const serverId = server.id.trim() || "mcp";
  const client = new McpStdioClient({ id: serverId, name: server.name });
  try {
    await client.start(server.command.trim(), server.args ?? [], server.env ?? undefined);
    await client.initialize();
    const tools = await client.listTools();
    await client.stop();
    return { tools: tools.map((t) => ({ name: t.name, description: t.description })) };
  } catch (err) {
    try {
      await client.stop();
    } catch {
      // ignore
    }
    return { tools: [], error: err instanceof Error ? err.message : String(err) };
  }
}

