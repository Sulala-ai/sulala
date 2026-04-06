import Database from "bun:sqlite";

export interface MemoryInsert {
  user_id: string | null;
  agent_id: string;
  text: string;
  tags?: unknown;
  /** Optional embedding vector for semantic search (stored as JSON). */
  embedding?: number[] | null;
}

export interface MemorySearch {
  user_id?: string | null;
  agent_id?: string | null;
  q: string;
  limit: number;
}

export interface ConversationMessageInsert {
  conversation_id: string;
  agent_id: string;
  user_id: string | null;
  role: string;
  contentJson: string;
}

export interface ConversationMessagesQuery {
  conversation_id: string;
  limit: number;
}

export interface ConversationListQuery {
  agent_id?: string;
  graph_id?: string;
  limit: number;
}

export class MemoryStore {
  private db: Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        user_id TEXT,
        title TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        user_id TEXT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        agent_id TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'personal',
        text TEXT NOT NULL,
        tags TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id);
      CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        model TEXT NOT NULL,
        description TEXT,
        personality TEXT,
        skills TEXT,
        tools TEXT,
        schedule TEXT,
        schedule_input TEXT,
        avatar TEXT,
        user_created INTEGER NOT NULL DEFAULT 0,
        limits TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
    this.migrateMemoriesEmbedding();
    this.migrateAgentsScheduleEnabled();
    this.migrateConversationsGraphId();
    this.migrateAgentsScheduleReportTargets();
    this.migrateAgentsAutoMemory();
  }

  private migrateMemoriesEmbedding(): void {
    try {
      this.db.exec("ALTER TABLE memories ADD COLUMN embedding TEXT");
    } catch {
      // Column already exists
    }
  }

  private migrateAgentsScheduleEnabled(): void {
    try {
      this.db.exec("ALTER TABLE agents ADD COLUMN schedule_enabled INTEGER NOT NULL DEFAULT 1");
    } catch {
      // Column already exists
    }
  }

  private migrateConversationsGraphId(): void {
    try {
      this.db.exec("ALTER TABLE conversations ADD COLUMN graph_id TEXT");
    } catch {
      // Column already exists
    }
  }

  private migrateAgentsScheduleReportTargets(): void {
    try {
      this.db.exec("ALTER TABLE agents ADD COLUMN schedule_report_targets TEXT");
    } catch {
      // Column already exists
    }
  }

  private migrateAgentsAutoMemory(): void {
    try {
      this.db.exec("ALTER TABLE agents ADD COLUMN auto_memory INTEGER NOT NULL DEFAULT 0");
    } catch {
      // Column already exists
    }
  }

  insertMemory(args: MemoryInsert): number | null {
    const embeddingJson =
      args.embedding && args.embedding.length > 0
        ? JSON.stringify(args.embedding)
        : null;
    const stmt = this.db.prepare(
      "INSERT INTO memories (user_id, agent_id, scope, text, tags, embedding) VALUES (?, ?, 'personal', ?, ?, ?)"
    );
    const info = stmt.run(
      args.user_id,
      args.agent_id,
      args.text,
      this.serializeTags(args.tags),
      embeddingJson
    );
    return Number(info.lastInsertRowid ?? 0) || null;
  }

  deleteMemory(id: number): boolean {
    const stmt = this.db.prepare("DELETE FROM memories WHERE id = ?");
    const info = stmt.run(id);
    return (info.changes ?? 0) > 0;
  }

  searchMemories(args: MemorySearch): unknown[] {
    const like = `%${args.q}%`;
    const stmt = this.db.prepare(
      `
      SELECT id, user_id, agent_id, scope, text, tags, created_at
      FROM memories
      WHERE (? IS NULL OR user_id = ?)
        AND (? IS NULL OR agent_id = ?)
        AND text LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `
    );
    return stmt.all(
      args.user_id ?? null,
      args.user_id ?? null,
      args.agent_id ?? null,
      args.agent_id ?? null,
      like,
      args.limit
    );
  }

  /**
   * Fetch memories that have embeddings, for semantic search. Returns rows with id, user_id, agent_id, scope, text, tags, created_at, embedding (JSON string).
   */
  getMemoriesWithEmbeddings(args: {
    user_id?: string | null;
    agent_id?: string | null;
    limit: number;
  }): Array<{
    id: number;
    user_id: string | null;
    agent_id: string;
    scope: string;
    text: string;
    tags: string | null;
    created_at: string;
    embedding: string | null;
  }> {
    const stmt = this.db.prepare(
      `
      SELECT id, user_id, agent_id, scope, text, tags, created_at, embedding
      FROM memories
      WHERE (? IS NULL OR user_id = ?)
        AND (? IS NULL OR agent_id = ?)
        AND embedding IS NOT NULL AND embedding != ''
      ORDER BY created_at DESC
      LIMIT ?
    `
    );
    return stmt.all(
      args.user_id ?? null,
      args.user_id ?? null,
      args.agent_id ?? null,
      args.agent_id ?? null,
      args.limit
    ) as Array<{
      id: number;
      user_id: string | null;
      agent_id: string;
      scope: string;
      text: string;
      tags: string | null;
      created_at: string;
      embedding: string | null;
    }>;
  }

  ensureConversation(
    id: string,
    agent_id: string,
    user_id: string | null,
    graph_id?: string | null
  ): void {
    const stmt = this.db.prepare(
      "INSERT OR IGNORE INTO conversations (id, agent_id, user_id, graph_id) VALUES (?, ?, ?, ?)"
    );
    stmt.run(id, agent_id, user_id, graph_id ?? null);
  }

  insertConversationMessage(args: ConversationMessageInsert): number | null {
    const stmt = this.db.prepare(
      "INSERT INTO messages (conversation_id, agent_id, user_id, role, content) VALUES (?, ?, ?, ?, ?)"
    );
    const info = stmt.run(
      args.conversation_id,
      args.agent_id,
      args.user_id,
      args.role,
      args.contentJson
    );
    return Number(info.lastInsertRowid ?? 0) || null;
  }

  updateConversationTitleOnce(id: string, title: string): void {
    this.db
      .prepare(
        "UPDATE conversations SET title = ? WHERE id = ? AND (title IS NULL OR title = '')"
      )
      .run(title, id);
  }

  updateConversationTitle(id: string, title: string | null): void {
    this.db
      .prepare("UPDATE conversations SET title = ? WHERE id = ?")
      .run(title, id);
  }

  getConversationMessages(args: ConversationMessagesQuery): Array<{
    id: number;
    conversation_id: string;
    agent_id: string;
    user_id: string | null;
    role: string;
    content: string;
    created_at: string;
  }> {
    const stmt = this.db.prepare(
      `
      SELECT id, conversation_id, agent_id, user_id, role, content, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
      LIMIT ?
    `
    );
    return stmt.all(args.conversation_id, args.limit) as any;
  }

  listConversations(args: ConversationListQuery): Array<{
    id: string;
    agent_id: string;
    user_id: string | null;
    title: string | null;
    created_at: string;
    graph_id?: string | null;
  }> {
    if (args.graph_id != null && args.graph_id !== "") {
      const stmt = this.db.prepare(
        `
        SELECT id, agent_id, user_id, title, created_at, graph_id
        FROM conversations
        WHERE graph_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `
      );
      return stmt.all(args.graph_id, args.limit) as any;
    }
    const agentId = args.agent_id ?? "";
    const stmt = this.db.prepare(
      `
      SELECT id, agent_id, user_id, title, created_at, graph_id
      FROM conversations
      WHERE agent_id = ? AND (graph_id IS NULL OR graph_id = '')
      ORDER BY created_at DESC
      LIMIT ?
    `
    );
    return stmt.all(agentId, args.limit) as any;
  }

  getConversationTranscript(conversation_id: string): Array<{ role: string; content: string }> {
    const stmt = this.db.prepare(
      `
      SELECT role, content
      FROM messages
      WHERE conversation_id = ?
        AND role IN ('user', 'assistant')
      ORDER BY created_at ASC
    `
    );
    return stmt.all(conversation_id) as any;
  }

  getHistoryForConversation(conversation_id: string, limit: number): Array<{
    role: string;
    content: string;
  }> {
    const stmt = this.db.prepare(
      `
      SELECT role, content
      FROM messages
      WHERE conversation_id = ?
        AND role IN ('user', 'assistant')
      ORDER BY created_at ASC
      LIMIT ?
    `
    );
    return stmt.all(conversation_id, limit) as any;
  }

  private serializeTags(tags: unknown): string | null {
    if (Array.isArray(tags) || typeof tags === "string") {
      return JSON.stringify(tags);
    }
    return null;
  }

  /** Agent row from DB (raw). */
  private agentFromRow(row: Record<string, unknown>): Record<string, unknown> {
    return {
      id: row.id,
      name: row.name,
      model: row.model,
      description: row.description ?? undefined,
      personality: row.personality ?? undefined,
      skills: row.skills ? JSON.parse(String(row.skills)) : undefined,
      tools: row.tools ? JSON.parse(String(row.tools)) : undefined,
      schedule: row.schedule ?? undefined,
      schedule_input: row.schedule_input ?? undefined,
      schedule_enabled: row.schedule_enabled !== undefined ? Number(row.schedule_enabled) === 1 : true,
      schedule_report_targets: row.schedule_report_targets ? JSON.parse(String(row.schedule_report_targets)) : undefined,
      avatar: row.avatar ?? undefined,
      user_created: Number(row.user_created) === 1,
      limits: row.limits ? JSON.parse(String(row.limits)) : undefined,
      auto_memory: Number(row.auto_memory) === 1 ? true : undefined,
    };
  }

  /** Get all agents from SQLite. Returns plain objects suitable for parseAgentConfig. */
  getAllAgents(): Record<string, unknown>[] {
    const stmt = this.db.prepare("SELECT * FROM agents ORDER BY id");
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map((r) => this.agentFromRow(r));
  }

  /** Get one agent by id, or null. */
  getAgentById(id: string): Record<string, unknown> | null {
    const stmt = this.db.prepare("SELECT * FROM agents WHERE id = ?");
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this.agentFromRow(row) : null;
  }

  /** Insert an agent. Config must have id, name, model; other fields optional. */
  insertAgent(config: Record<string, unknown>): void {
    const id = String(config.id);
    const name = String(config.name);
    const model = String(config.model);
    const description = config.description != null ? String(config.description) : null;
    const personality = config.personality != null ? String(config.personality) : null;
    const skills = config.skills != null ? JSON.stringify(config.skills) : null;
    const tools = config.tools != null ? JSON.stringify(config.tools) : null;
    const schedule = config.schedule != null ? String(config.schedule) : null;
    const schedule_input = config.schedule_input != null ? String(config.schedule_input) : null;
    const schedule_enabled = config.schedule_enabled === false ? 0 : 1;
    const schedule_report_targets = config.schedule_report_targets != null ? JSON.stringify(config.schedule_report_targets) : null;
    const avatar = config.avatar != null ? String(config.avatar) : null;
    const user_created = config.user_created === true ? 1 : 0;
    const limits = config.limits != null ? JSON.stringify(config.limits) : null;
    const auto_memory = config.auto_memory === true ? 1 : 0;
    const stmt = this.db.prepare(
      `INSERT INTO agents (id, name, model, description, personality, skills, tools, schedule, schedule_input, schedule_enabled, schedule_report_targets, avatar, user_created, limits, auto_memory)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(id, name, model, description, personality, skills, tools, schedule, schedule_input, schedule_enabled, schedule_report_targets, avatar, user_created, limits, auto_memory);
  }

  /** Update an existing agent. Only provided fields are updated. */
  updateAgent(
    id: string,
    updates: {
      name?: string | null;
      description?: string | null;
      model?: string | null;
      personality?: string | null;
      skills?: string[] | null;
      tools?: string[] | null;
      limits?: unknown;
      schedule?: string | null;
      schedule_input?: string | null;
      avatar?: string | null;
      schedule_enabled?: boolean | null;
      schedule_report_targets?: Array<{ channel: string; address: string }> | null;
      auto_memory?: boolean | null;
    }
  ): void {
    const agent = this.getAgentById(id);
    if (!agent) throw new Error(`Agent not found: ${id}`);
    const name = updates.name !== undefined ? (updates.name && String(updates.name).trim() ? String(updates.name).trim() : null) : (agent.name as string);
    const model = updates.model !== undefined ? (updates.model && String(updates.model).trim() ? String(updates.model).trim() : null) : (agent.model as string);
    const description = updates.description !== undefined ? (updates.description && String(updates.description).trim() ? String(updates.description).trim() : null) : (agent.description as string | null);
    const personality = updates.personality !== undefined ? (updates.personality && String(updates.personality).trim() ? String(updates.personality).trim() : null) : (agent.personality as string | null);
    const skills = updates.skills !== undefined ? (updates.skills?.length ? JSON.stringify(updates.skills) : null) : (agent.skills != null ? (typeof agent.skills === "string" ? agent.skills : JSON.stringify(agent.skills)) : null);
    const tools = updates.tools !== undefined ? (updates.tools?.length ? JSON.stringify(updates.tools) : null) : (agent.tools != null ? (typeof agent.tools === "string" ? agent.tools : JSON.stringify(agent.tools)) : null);
    const limits = updates.limits !== undefined ? (updates.limits ? JSON.stringify(updates.limits) : null) : (agent.limits != null ? (typeof agent.limits === "string" ? agent.limits : JSON.stringify(agent.limits)) : null);
    const schedule = updates.schedule !== undefined ? (updates.schedule && String(updates.schedule).trim() ? String(updates.schedule).trim() : null) : (agent.schedule as string | null);
    const schedule_input = updates.schedule_input !== undefined ? (updates.schedule_input && String(updates.schedule_input).trim() ? String(updates.schedule_input).trim() : null) : (agent.schedule_input as string | null);
    const avatar = updates.avatar !== undefined ? (updates.avatar && String(updates.avatar).trim() ? String(updates.avatar).trim() : null) : (agent.avatar as string | null);
    const schedule_enabled =
      updates.schedule_enabled !== undefined && updates.schedule_enabled !== null
        ? (updates.schedule_enabled ? 1 : 0)
        : (agent.schedule_enabled === true || agent.schedule_enabled === 1 ? 1 : 0);
    const schedule_report_targets =
      updates.schedule_report_targets !== undefined
        ? (updates.schedule_report_targets?.length ? JSON.stringify(updates.schedule_report_targets) : null)
        : (agent.schedule_report_targets != null ? (typeof agent.schedule_report_targets === "string" ? agent.schedule_report_targets : JSON.stringify(agent.schedule_report_targets)) : null);
    const auto_memory =
      updates.auto_memory !== undefined && updates.auto_memory !== null
        ? (updates.auto_memory ? 1 : 0)
        : (agent.auto_memory === true ? 1 : 0);
    const stmt = this.db.prepare(
      "UPDATE agents SET name = ?, model = ?, description = ?, personality = ?, skills = ?, tools = ?, limits = ?, schedule = ?, schedule_input = ?, avatar = ?, schedule_enabled = ?, schedule_report_targets = ?, auto_memory = ?, updated_at = datetime('now') WHERE id = ?"
    );
    stmt.run(name, model, description, personality, skills, tools, limits, schedule, schedule_input, avatar, schedule_enabled, schedule_report_targets, auto_memory, id);
  }

  /** Delete an agent by id. */
  deleteAgent(id: string): void {
    const agent = this.getAgentById(id);
    if (!agent) throw new Error(`Agent not found: ${id}`);
    const stmt = this.db.prepare("DELETE FROM agents WHERE id = ?");
    stmt.run(id);
  }

  /** Return true if the agents table has no rows (for one-time seed). */
  isAgentsTableEmpty(): boolean {
    const row = this.db.prepare("SELECT 1 FROM agents LIMIT 1").get();
    return row == null;
  }
}

