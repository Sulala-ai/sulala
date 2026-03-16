import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface McpServerInfo {
  id: string;
  name?: string;
}

export interface McpToolSchema {
  type?: string;
  properties?: Record<string, { type?: string; description?: string }>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: McpToolSchema;
}

export class McpStdioClient {
  readonly server: McpServerInfo;
  private client: Client;
  private transport: StdioClientTransport | null = null;

  constructor(server: McpServerInfo) {
    this.server = server;
    this.client = new Client({
      name: "@sulala/agent-os",
      version: "0.1.0",
    });
  }

  isRunning(): boolean {
    return this.transport !== null;
  }

  async start(command: string, args: string[] = [], env?: Record<string, string>): Promise<void> {
    if (this.transport) return;
    this.transport = new StdioClientTransport({
      command,
      args,
      env,
    });
    await this.client.connect(this.transport);
  }

  async stop(): Promise<void> {
    if (this.transport) {
      await this.client.close();
      this.transport = null;
    }
  }

  async request(method: string, params?: unknown, options?: { timeoutMs?: number }): Promise<unknown> {
    // For compatibility with existing code; delegate to specific methods where needed.
    if (method === "tools/list") {
      return this.listTools();
    }
    if (method === "tools/call" && params && typeof params === "object" && "name" in (params as any)) {
      const { name, arguments: args } = params as { name: string; arguments?: Record<string, unknown> };
      return this.callTool(name, args ?? {});
    }
    throw new Error(`Unsupported MCP request method: ${method}`);
  }

  async notify(method: string, params?: unknown): Promise<void> {
    // No-op for now; SDK handles notifications internally.
    void method;
    void params;
  }

  async initialize(): Promise<void> {
    // SDK connect() already performs initialize handshake; nothing to do here.
    return;
  }

  async listTools(): Promise<McpTool[]> {
    const res = await this.client.listTools();
    const tools = Array.isArray(res.tools) ? res.tools : [];
    return tools
      .map((t) => ({
        name: String(t.name ?? ""),
        description: typeof t.description === "string" ? t.description : undefined,
        inputSchema: (t as any).inputSchema as McpToolSchema | undefined,
      }))
      .filter((t) => t.name.trim().length > 0);
  }

  async callTool(name: string, arguments_: Record<string, unknown>): Promise<unknown> {
    const res = await this.client.callTool({
      name,
      arguments: arguments_,
    });
    return res;
  }
}

