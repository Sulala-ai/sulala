#!/usr/bin/env bun
/**
 * Agent OS — local-first AI agent platform.
 * Phase 1: Core runtime.
 */

// Require Bun (recommended check: process.versions.bun)
if (!process.versions.bun) {
  console.error("This app must be run with Bun. Use: bun run src/index.ts");
  process.exit(1);
}

import { startServer } from "./server.js";

startServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
