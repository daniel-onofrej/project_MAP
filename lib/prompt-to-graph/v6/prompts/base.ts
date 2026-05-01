// ─────────────────────────────────────────────────────────────────────────────
// Prompt-to-Graph V6 — Base Prompt Definitions
// Shared type codes and rules used by all 4 specialized system prompts.
// ─────────────────────────────────────────────────────────────────────────────

export const TYPE_CODES = [
  'st=start', 'e=end', 'i=input', 'd=decision', 'a=action', 't=tool', 'ru=rule',
  's=step', 'lg=logging', 'r=resolution', 'h=handoff', 'p=persona',
  'g=guard', 'tr=trigger', 'cf=config', 'ref=reference', 'm=memory', 'gr=group',
  'ag=agent',
  // V6 additions:
  'sk=skill',   // Skill invocation/composition
  'lp=loop',    // Loop construct entry node (back-edges allowed within loop boundary)
  'wp=warning', // Anti-pattern / "do NOT do X" documentation node
].join(', ');

export const SHARED_LABELING_RULES = `LABELING RULES (critical for readable graphs):
- d=decision: specific condition as a yes/no question.
  GOOD: "Order found?", "Placed > 90 days ago?", "Is item defective?"
  BAD:  "Order status?", "Check order", "Decision"
- t=tool: short descriptive label, e.g. "Python Execution", "Web Search"
  ALSO set the "tool" field to the EXACT API name
- a=action: verb + object: "Ask for Order ID", "Respond: No Order Found"
- r=resolution: outcome name: "Approve Full Cash Refund", "Issue Store Credit"
- e=end: termination reason: "Terminate: Invalid Input", "End Session"
- h=handoff: target: "Escalate to Supervisor", "Transfer to Billing"
- sk=skill: skill name: "Brand Voice Skill", "Brainstorming Skill"
- lp=loop: loop name: "Refine Until Converged", "Iteration Loop"
- wp=warning: negative form: "Never batch completions", "Don't skip TDD"
- Keep labels 3-8 words, specific to the paragraph content
- ONE node = ONE concern. Do NOT merge unrelated bullets into one node.`;

export const SHARED_OUTPUT_SHAPE = `{
  "meta": {
    "agent_id": "snake_case_id",
    "persona": "role description",
    "tone": "tone",
    "version": "version string",
    "description": "one sentence"
  },
  "nodes": [
    {
      "id": 1,
      "type": "st",
      "label": "Start",
      "desc": "Entry point — initialize agent.",
      "refs": ["§0"]
    }
  ],
  "edges": [
    [1, 2, "Begin"],
    [2, 3, "Yes"],
    [2, 4, "No"]
  ]
}`;

export const SHARED_STRUCTURAL_RULES = `STRUCTURAL RULES:
- Every non-blank §N MUST appear in at least one node's refs
- Node ids are sequential integers starting at 1
- Edge tuples: [source_id, target_id, "optional label"]
- Labels on decision edges must be descriptive case names
- scope + governs required on annotation nodes (p, ru, cf, g, ref, tr, m)
- "tool" field REQUIRED on all t=tool nodes
- "desc" field REQUIRED on all nodes`;

export const REPAIR_PROMPT_V6 = `You are repairing a V6 graph plan.

Output ONLY raw JSON. Same schema as the original.
Return the FULL corrected plan, not a patch.

Fix all listed violations while preserving working parts.
Rules:
- Zero cycles (EXCEPTION: back-edges to lp=loop nodes are intentional — keep them)
- Every node reachable from START
- Every flow path reaches a terminal
- Every decision has outgoing edges for all cases
- All §N refs must be claimed
- Every t=tool node must have a non-null "tool" field
- Every lp=loop node must have at least one exit edge (not a back-edge)
- Every node must have a "desc" field (short description)
- Do not add/remove nodes unless absolutely necessary`;
