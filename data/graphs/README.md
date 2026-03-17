# Seed graphs

**Tip:** Use at least different AI providers for different agents in a graph for better performance and to avoid API rate limits, since graphs make many calls.

Graphs in this folder are copied into the user graphs directory (`~/.agent-os/graphs/` or `AGENT_OS_GRAPHS_DIR`) when that directory is empty (e.g. on first `sulala onboard` after agents are installed), or installed on first load by id.

## news-to-bluesky

Linear pipeline: **Research → Verify → Writer → Social Media**.

- **node_1** (Research Assistant): finds trending news; output only, no posting.
- **node_2** (Source Verify Agent): verifies the story; output only, no posting.
- **node_3** (Writer Assistant): rewrites for a short social post; output only, no posting.
- **node_4** (Social Media Assistant): posts the final text to Bluesky.

**Recommended prompt:** `Search for one latest trending news` (avoid “and post it” in the initial prompt so only the last node posts).

If you already have a graph with the same nodes but multiple posts, fix the **edges**: use a single chain `node_1 → node_2 → node_3 → node_4` with no direct edges from node_1 or node_2 to node_4. Ensure Research, Verify, and Writer agents do not have the `run_agent` tool so they cannot delegate posting.

## sale-pipeline

Linear pipeline: **Research → Writer → CRM**.

- **node_1** (Research Assistant): researches the lead (company, contact, fit); output only.
- **node_2** (Writer Assistant): same agent as in news-to-bluesky (Gmail, translate). Here it is used only to **draft** the outreach or proposal text from the research—it takes the research output as input and produces copy; it does not send email in this pipeline. Output only.
- **node_3** (HubSpot CRM Agent): updates HubSpot (contacts, deals) from the pipeline output.

**Recommended prompt:** `Research one lead, draft outreach, and update HubSpot`. Configure the crm-hubspot skill (e.g. HUBSPOT_ACCESS_TOKEN) for the CRM node to sync.

