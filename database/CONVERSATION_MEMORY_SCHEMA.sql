-- Conversation & Memory schema for tinyagent-related assistants.
-- Suitable for SQLite or Postgres with minor tweaks.

-- 1) Conversations: one row per chat thread
CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,              -- conversation_id (UUID or custom string)
  agent_id   TEXT NOT NULL,
  user_id    TEXT,                          -- nullable if anonymous
  title      TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversations_user
  ON conversations (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_agent
  ON conversations (agent_id, created_at DESC);


-- 2) Messages: individual turns (user / assistant / tool)
CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  agent_id        TEXT NOT NULL,
  user_id         TEXT,                                   -- optional
  role            TEXT NOT NULL,                          -- 'system' | 'user' | 'assistant' | 'tool'
  content         TEXT NOT NULL,                          -- JSON string with text + tool metadata
  token_count     INTEGER,                                -- optional, for budgeting / summarization
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_time
  ON messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_messages_agent_time
  ON messages (agent_id, created_at DESC);


-- 3) Long-term Memory: persistent user/agent facts
CREATE TABLE IF NOT EXISTS memories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT,                         -- who this memory is about
  agent_id   TEXT,                         -- which agent it belongs to (optional)
  scope      TEXT DEFAULT 'personal',      -- 'personal' | 'global' | etc.
  text       TEXT NOT NULL,                -- the memory content
  tags       TEXT,                         -- JSON array or comma-separated tags
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_memories_user_agent
  ON memories (user_id, agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memories_scope
  ON memories (scope, created_at DESC);

