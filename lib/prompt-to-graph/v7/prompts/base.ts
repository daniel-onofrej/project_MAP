export const V7_TYPE_CODES = [
  'st=start', 'e=end', 'i=input', 'd=decision', 'a=action', 't=tool',
  'ru=rule', 's=step', 'r=resolution', 'h=handoff', 'p=persona',
  'g=guard', 'tr=trigger', 'cf=config', 'ref=reference', 'm=memory',
  'ag=agent', 'sk=skill', 'lp=loop', 'wp=warning',
].join(', ');

export const V7_OUTPUT_SHAPE = `{
  "meta": {
    "agent_id": "snake_case_id",
    "persona": "role name",
    "tone": "tone",
    "version": "1.0",
    "description": "one sentence describing the agent"
  },
  "nodes": [
    { "id": 1, "type": "st", "label": "Start", "desc": "Entry point.", "dna_ids": ["dna_0"] },
    { "id": 2, "type": "p",  "label": "Poetic Assistant", "desc": "Core persona.", "dna_ids": ["dna_0"], "scope": "g", "governs": [1] }
  ],
  "edges": [
    [1, 2, "Begin"],
    [2, 3, "Yes"],
    [2, 4, "No"]
  ]
}`;

export const V7_STRUCTURAL_RULES = `STRUCTURAL RULES:
- Every DNA item id MUST appear in at least one node's dna_ids array
- Node ids are sequential integers starting at 1
- Edge tuples: [source_id, target_id, "optional label"]
- Decision edges MUST have descriptive case labels (e.g. "Yes", "No", "Haiku", "Sonnet")
- scope + governs required on annotation nodes (p, ru, cf, g, ref, tr, m, wp)
- "tool" field REQUIRED on all t=tool nodes
- "desc" field REQUIRED on all nodes (max 15 words)
- ZERO cycles (no back-edges)
- Every node must be reachable from the start node`;

export const V7_LABELING_RULES = `LABELING RULES:
- Use the EXACT text from the DNA item's "text" field as the node label (or a 4-8 word excerpt)
- Do NOT paraphrase or summarize — preserve the original wording
- d=decision: a yes/no question form. GOOD: "Style specified by user?" BAD: "Check style"
- g=guard / wp=warning: negative form. GOOD: "Never quote copyrighted works" BAD: "Originality rule"
- a=action: verb + object. GOOD: "Adapt tone to user request" BAD: "Processing"
- s=step: section heading text verbatim. GOOD: "Core Behavior" BAD: "Section 1"`;

export const V7_REPAIR_PROMPT = `You are repairing a V7 graph plan.

Output ONLY raw JSON. Same schema as the original.
Return the FULL corrected plan, not a patch.

Fix all listed violations:
- Every DNA id must appear in at least one node's dna_ids array
- Zero cycles (no back-edges)
- Every node reachable from start
- Every decision has outgoing edges for all cases
- Every node has a "desc" field
- Every t=tool node has a non-null "tool" field
Do not add/remove nodes unless absolutely necessary.`;
