# Sulala CLI reference

How the CLI is structured and how to extend it.

## Entry and dispatch

- **Binary:** `package.json` → `"bin": { "sulala": "dist/cli.js" }` so `sulala` runs the built CLI.
- **Source:** `src/cli.ts` (Bun); build: `bun build src/cli.ts --outdir=dist --target=bun`.
- **Entry:** `main()` at the bottom of `src/cli.ts`:
  - Requires Bun (`process.versions.bun`); exits with a message otherwise.
  - `argv = process.argv.slice(2)`, `command = argv[0]?.toLowerCase()`, `rest = argv.slice(1)`.
  - Single `switch (command)` → one `cmd*` function per command; no subcommand parsing.

## Commands

| Command        | Handler       | Notes |
|----------------|---------------|--------|
| `version`, `-v`, `--version` | `cmdVersion()`  | Reads version from `package.json` next to CLI (e.g. `import.meta.dir/../package.json`). |
| `start`        | `cmdStart(rest)` | No args: runs server in foreground via `import("./server.js")` → `startServer()`. With `--daemon`: spawns `bun run dist/index.js` (or `src/index.ts` if no dist) from **package root** (`import.meta.dir/..`), writes PID to `~/.agent-os/sulala.pid`. |
| `stop`         | `cmdStop()`   | Reads PID from `~/.agent-os/sulala.pid`, sends SIGTERM, deletes PID file. |
| `onboard`      | `cmdOnboard()` | Creates `~/.agent-os`, DB dir, `config.json` if missing; sets up `MemoryStore`, runs `seedAgentsIfEmpty()` + `installSystemAgents()` (no system skills); starts server daemon if needed, opens dashboard in browser. |
| `update`       | `cmdUpdate()` | Runs `bun install -g @sulala-ai/agent-os@latest`; then if DB exists, runs `installSystemAgents()` and `installSystemSkills()`. |
| `run`          | `cmdRun(rest)` | `rest[0]` = agent id, `rest.slice(1).join(" ")` = task; uses same DB as server; loads agent, runs `runAgent()`, prints result. |
| `help`, `-h`, `--help`, or no command | `printHelp()` | Prints usage and exits. |
| Anything else   | Error + `printHelp()` + `process.exit(1)`. |

## Paths and environment

- **Package root:** Resolved as `join(import.meta.dir, "..")` (when running `dist/cli.js`, `import.meta.dir` is `dist/`).
- **Config / home:** `getAgentOsHome()` from `./core/config.js` → `AGENT_OS_HOME` or `~/.agent-os`.
- **PID file:** `join(getAgentOsHome(), "sulala.pid")`.
- **Server entry for daemon:** Prefer `dist/index.js` if present, else `src/index.ts`; process is started with `cwd: projectRoot` (package root).
- **Port:** `process.env.PORT ?? 3010` (e.g. for `openDashboard()`).

## Adding a new command

1. Implement `async function cmdMycommand(args: string[]): Promise<void>` in `src/cli.ts`.
2. In `main()`, add a `case "mycommand": await cmdMycommand(rest); break;`.
3. Update `printHelp()` with the new command and an example.
4. Rebuild: `npm run build` (or `bun build src/cli.ts --outdir=dist --target=bun`).

## Dependencies

- **Config:** `getAgentOsHome()`, `getMemoryDbPath()` from `./core/config.js`.
- **Agents:** `setAgentStore`, `seedAgentsIfEmpty`, `installSystemAgents`, `getAgent` from `./core/agent-registry.js`.
- **Skills:** `installSystemSkills` from `./skills/loader.js`.
- **Runtime:** `runAgent` from `./core/runtime.js`.
- **Server:** Dynamic `import("./server.js")` only for `start` (foreground).

No framework or CLI parser; everything is a single switch on the first argument.
