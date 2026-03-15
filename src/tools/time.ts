import { registerTool } from "../core/tool-registry.js";

registerTool({
  id: "time",
  name: "Current Time",
  description: "Get the current date and time. Use when the user asks what time it is, the date, or similar.",
  input_schema: {
    type: "object",
    properties: {},
  },
  async execute() {
    const now = new Date();
    return {
      iso: now.toISOString(),
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  },
});
