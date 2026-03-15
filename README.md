# Agent OS

Lightweight **Bun-based Agent Operating System** — micro-agents, installable skills, workflows.

## Quick start

```bash
# Install deps
bun install

# For dev, agents are loaded from ./data/agents (pre-configured).
# For production, copy to ~/.agent-os/agents/ or set AGENT_OS_AGENTS_DIR.

# Set LLM API key (OpenAI or OpenRouter)
export OPENAI_API_KEY=sk-...
# or: export OPENROUTER_API_KEY=sk-or-...

# Start server
bun run dev
```

Then:

```bash
# List agents
curl http://127.0.0.1:3010/api/agents

# Run agent (HTTP)
curl -X POST http://127.0.0.1:3010/api/agents/run \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"echo_agent","task":"Hello, what can you do?"}'

# Or run from CLI
AGENT_OS_AGENTS_DIR=./data/agents bun run cli echo_agent "What is 2+2?"
```

## Configuration

| Env | Description |
|-----|-------------|
| `PORT` | Server port (default: 3010) |
| `HOST` | Server host (default: 127.0.0.1) |
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENROUTER_API_KEY` | OpenRouter API key (alternative) |
| `AGENT_OS_AGENTS_DIR` | Override agents directory (default: ~/.agent-os/agents/) |

## Project structure

```
tinyagent/
  src/
    core/         # Agent registry, runtime, LLM, tools
    types/        # Agent config schema
    server.ts     # HTTP API
    index.ts      # Entry point
  examples/       # Example agent configs
  skills/         # Example skills (weather, etc.)
  docs/           # Specs (AGENT_SPEC, SKILL_SPEC, etc.)
```

## Built-in tools (Phase 2)

| Tool   | Description               |
|--------|---------------------------|
| `echo` | Echo back text            |
| `time` | Get current date/time     |

Agents get all tools by default. Restrict via `tools: ["echo"]` in agent config.

## Skills (Phase 3)

Skills live under `~/.agent-os/skills/<name>/` (or `AGENT_OS_SKILLS_DIR`). Example:

```
~/.agent-os/skills/weather/
  skill.yaml
  tools.yaml
```

Agents declare skills:

```json
{
  "id": "weather_agent",
  "name": "Weather Assistant",
  "model": "gpt-4o-mini",
  "skills": ["weather"],
  "tools": ["weather_current"]
}
```

At runtime, the skill loader reads `tools.yaml` and registers HTTP tools into the tool registry.

## Channels (Telegram)

You can talk to your agent from Telegram. Create a bot with [@BotFather](https://t.me/BotFather), add the token and default agent in **Dashboard → Settings → Telegram**, expose your server over HTTPS (e.g. ngrok), and set the webhook. Full steps: [doc/TELEGRAM_SETUP.md](doc/TELEGRAM_SETUP.md).

## Roadmap

See [roadmap.md](./roadmap.md) for phases. Phases 1–3 (Core Runtime, Tool System, Skill System) are implemented at a minimal level.

# sulala
