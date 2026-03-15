import { registerTool } from "../core/tool-registry.js";

registerTool({
  id: "echo",
  name: "Echo",
  description: "Echo back the given text. Use when you need to repeat or confirm what the user said.",
  input_schema: {
    type: "object",
    properties: {
      text: { type: "string", description: "The text to echo back" },
    },
    required: ["text"],
  },
  async execute(input) {
    const text = (input.text as string) ?? "";
    return { echoed: text };
  },
});
