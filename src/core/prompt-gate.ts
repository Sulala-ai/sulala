export type PromptGateMode =
  | { kind: "agent_run"; agent_id: string }
  | { kind: "graph_run"; graph_id: string };

export type PromptGateDecision =
  | { decision: "allow"; normalized_input?: string }
  | {
    decision: "needs_clarification";
    reason: string;
    /** A structured template the UI can show (user fills + resubmits). */
    template: string;
    /** Suggested safe prompts the user can click. */
    suggestions?: Array<{ id: string; title: string; prompt: string }>;
    /** Optional short questions for lightweight UIs. */
    questions?: Array<{ id: string; prompt: string; example?: string }>;
  };

function looksLikeOnlyUrl(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // If it's basically just a URL (or a URL with trivial words), treat as unstructured.
  const urlRegex = /https?:\/\/\S+/g;
  const urls = t.match(urlRegex) ?? [];
  if (urls.length !== 1) return false;
  const withoutUrl = t.replace(urlRegex, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return withoutUrl.length <= 12;
}

function hasAny(text: string, needles: string[]): boolean {
  const t = text.toLowerCase();
  return needles.some((n) => t.includes(n));
}

function genericTemplate(mode: PromptGateMode): string {
  const scope = mode.kind === "graph_run" ? `Graph: ${mode.graph_id}` : `Agent: ${mode.agent_id}`;
  return `Goal (${scope}):

Constraints (optional but recommended):
- How many results? (e.g. 1)
- Allowed sources: [general knowledge only] [web allowed]
- If web allowed: max pages/sources (e.g. 1) + what to do if blocked (stop/skip)
- Output format: (e.g. JSON) + required keys
- Length limit: (e.g. <= 120 words)

If this involves actions (CRM / posting / updating):
- Which system?
- Exact fields to write
- Failure policy (return payload only / retry / stop)`;
}

function genericSuggestions(text: string): Array<{ id: string; title: string; prompt: string }> {
  const wantsCrm = hasAny(text, ["crm", "hubspot", "salesforce", "pipeline", "deal", "contact", "sync", "update", "create"]);
  const wantsWeb = hasAny(text, ["http://", "https://", "browse", "web", "site", "link", "scrape", "crawl", "research"]);
  return [
    {
      id: "fast_no_tools",
      title: "Fast (no tools)",
      prompt:
        "Do NOT browse the web or call any tools.\nUse general knowledge only.\nReturn strict JSON only.\nKeep it under 120 words.",
    },
    {
      id: "balanced_bounded_web",
      title: "Balanced (bounded web)",
      prompt:
        'If you browse the web, browse at most ONE page total. If blocked/slow, reply exactly: "BLOCKED".\nReturn strict JSON only.\nKeep it under 160 words.',
    },
    ...(wantsWeb
      ? [
        {
          id: "thorough_bounded",
          title: "Thorough (bounded)",
          prompt:
            "Use up to 3 sources/pages max.\nStop once you have enough for ONE high-confidence answer.\nReturn strict JSON only.\nIf any source is blocked, skip it.",
        },
      ]
      : []),
    ...(wantsCrm
      ? [
        {
          id: "action_only_no_research",
          title: "Action-only (no research)",
          prompt:
            "Do NOT browse the web.\nIf required info is missing, ask for it first.\nThen perform the action.\nIf the action fails, return the JSON payload you would write.",
        },
      ]
      : []),
  ];
}

function detectRiskScore(text: string): number {
  let score = 0;
  if (hasAny(text, ["find", "research", "scrape", "crawl", "lookup", "look up", "analyze", "compare", "summarize"])) score += 2;
  if (hasAny(text, ["lead", "prospect", "enterprise", "companies", "list", "enrich"])) score += 2;
  if (hasAny(text, ["http://", "https://", "website", "link", "url"])) score += 2;
  if (hasAny(text, ["crm", "hubspot", "salesforce", "pipeline", "deal", "contact", "sync", "update", "create"])) score += 3;
  if (text.length > 400) score += 1;
  return score;
}

function detectBoundsScore(text: string): number {
  let score = 0;
  const t = text.toLowerCase();
  if (/\bjson\b/.test(t) || hasAny(t, ["output json", "return json", "keys:"])) score += 2;
  if (/\b(one|1|exactly\s+\d+)\b/.test(t)) score += 2;
  if (hasAny(t, ["do not browse", "don't browse", "no tools", "do not call any tools", "web allowed"])) score += 2;
  if (hasAny(t, ["max", "at most", "no more than", "one page", "one source", "sources", "limit"])) score += 1;
  if (hasAny(t, ["under", "<=", "words", "characters"])) score += 1;
  if (hasAny(t, ["if blocked", "if slow", "timeout", "skip", "stop"])) score += 1;
  return score;
}

function shouldGate(mode: PromptGateMode, text: string): boolean {
  const risk = detectRiskScore(text);
  const bounds = detectBoundsScore(text);
  const graphBias = mode.kind === "graph_run" ? 1 : 0;
  return risk + graphBias >= 4 && bounds <= 2;
}

/**
 * Very lightweight guardrail to prevent costly/slow runs when the prompt is too vague.
 * This is intentionally heuristic (no extra LLM call) so it's fast and reliable.
 */
export function promptGate(mode: PromptGateMode, input: string): PromptGateDecision {
  const text = (input ?? "").trim();
  if (!text) {
    return {
      decision: "needs_clarification",
      reason: "Empty prompt",
      template: genericTemplate(mode),
      suggestions: genericSuggestions(text),
      questions: [{ id: "goal", prompt: "What is the goal?", example: "Find one lead and draft an intro message" }],
    };
  }

  // Generic “bad shapes”
  if (looksLikeOnlyUrl(text)) {
    return {
      decision: "needs_clarification",
      reason: "Prompt is mostly a URL; missing goal/constraints",
      template: genericTemplate(mode),
      suggestions: genericSuggestions(text),
      questions: [
        { id: "task", prompt: "What should I do with this link?", example: "Extract 1 company lead and summarize why it's a fit" },
        { id: "constraints", prompt: "Any constraints (geo/ICP/format)?" },
      ],
    };
  }

  if (shouldGate(mode, text)) {
    const riskBits: string[] = [];
    if (hasAny(text, ["lead", "prospect", "companies"])) riskBits.push("lead finding");
    if (hasAny(text, ["http://", "https://", "link", "url", "website"])) riskBits.push("web access");
    if (hasAny(text, ["crm", "hubspot", "salesforce", "sync", "update", "create"])) riskBits.push("actions/CRM");
    const reason =
      riskBits.length > 0
        ? `This request may trigger ${riskBits.join(" + ")} without clear limits. Choose a safe mode or add bounds (format, limits, tool policy).`
        : "This request is high-cost without clear limits. Add bounds or choose a safe mode.";
    return {
      decision: "needs_clarification",
      reason,
      template: genericTemplate(mode),
      suggestions: genericSuggestions(text),
      questions: [
        { id: "count", prompt: "How many results do you want?", example: "1" },
        { id: "tools", prompt: "Should I use the web/tools or general knowledge only?", example: "General knowledge only (fast)" },
        { id: "format", prompt: "What output format do you want?", example: "JSON with keys: company, reason, next_step" },
      ],
    };
  }

  return { decision: "allow" };
}

