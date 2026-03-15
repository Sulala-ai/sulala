/**
 * Built-in tool: run another agent with a task. Used by the manager agent to delegate.
 */
import { registerTool } from "../core/tool-registry.js";
import { getAgent } from "../core/agent-registry.js";
import { runAgent } from "../core/runtime.js";
import { errorMessage } from "../core/error.js";

registerTool({
  id: "run_agent",
  name: "Run agent",
  description:
    "Run another agent with a task and get their response. Use when the user asks for something that another agent can do (e.g. post to Bluesky/social → social_media_agent, search the web → research_agent, send email → writer_agent). Pass the target agent_id and the task you want them to do.",
  input_schema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Id of the agent to run (e.g. social_media_agent, research_agent, writer_agent, personal_agent, briefing_agent, dev_agent, media_agent)",
      },
      task: {
        type: "string",
        description: "The task or request to send to that agent (e.g. 'Post \"Hello world\" to Bluesky', 'Search for latest news about X')",
      },
    },
    required: ["agent_id", "task"],
  },
  async execute(input, context) {
    const agentId = typeof input.agent_id === "string" ? input.agent_id.trim() : "";
    const task = typeof input.task === "string" ? input.task.trim() : "";
    if (!agentId || !task) {
      return { success: false, error: "agent_id and task are required" };
    }
    const agent = await getAgent(agentId);
    if (!agent) {
      return { success: false, error: `Agent not found: ${agentId}. Check the list of available agents in your instructions.` };
    }
    try {
      const result = await runAgent({ agent, task });
      return {
        success: result.success,
        output: result.output,
        error: result.error,
        turns: result.turns,
      };
    } catch (err) {
      return { success: false, error: errorMessage(err), output: "" };
    }
  },
});
