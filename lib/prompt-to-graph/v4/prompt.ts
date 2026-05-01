// ─────────────────────────────────────────────────────────────────────────────
// Prompt-to-Graph V4 — Single LLM Prompt
//
// One call does everything: classify paragraphs → build nodes → wire edges.
// Produces a complete {meta, nodes, edges} in one shot.
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_CODES = [
  'st=start', 'e=end', 'i=input', 'd=decision', 'a=action', 't=tool', 'ru=rule',
  's=step', 'lg=logging', 'r=resolution', 'h=handoff', 'p=persona',
  'g=guard', 'tr=trigger', 'cf=config', 'ref=reference', 'm=memory', 'gr=group',
  'ag=agent',
].join(', ');

export const SYSTEM_PROMPT = `You convert a structured prompt into a directed acyclic graph.

Output ONLY raw JSON. No markdown fences. No prose.

You are given numbered paragraphs (§0, §1, §2, …). For each paragraph,
decide what graph node(s) it produces and how they connect.

═══════════════════════════════════════════════════════════════
1. CLASSIFY EACH PARAGRAPH
═══════════════════════════════════════════════════════════════

Read each §N paragraph and assign it to one or more nodes:

  TEXT PATTERN                         → TYPE
  ──────────────────────────────────────────────
  "If [X]", "Check", IF/THEN/ELSE     → d=decision (label ends with ?)
  "Call [tool]", "use [tool]"          → t=tool
  "Respond:", "Ask:", action verb      → a=action
  "Terminate", "end session"           → e=end
  "Escalate", "handoff", "supervisor"  → h=handoff
  "You are [role]", identity           → p=persona
  Named agent: "XAgent", "1. XAgent"   → ag=agent
  Pure policy constant (no IF/THEN)    → ru=rule
  "At any point", "always", guard      → g=guard
  "Activate when", "Trigger:"         → tr=trigger
  Configuration value                  → cf=config
  Reference data                       → ref=reference
  Logging action                       → lg=logging
  Business outcome (approve, deny)     → r=resolution

Type codes: ${TYPE_CODES}

LABELING RULES (critical for readable graphs):
- d=decision: specific condition as a yes/no question.
  GOOD: "Order found?", "Placed > 90 days ago?", "Is item defective?"
  BAD:  "Order status?", "Check order", "Decision"
- t=tool: tool name as label: "OrderLookup", "MembershipCheck"
- a=action: verb + object: "Ask for Order ID", "Respond: No Order Found"
- r=resolution: outcome name: "Approve Full Cash Refund", "Issue Store Credit"
- e=end: termination reason: "Terminate: Invalid Input", "End Session"
- h=handoff: target: "Escalate to Supervisor", "Transfer to Billing"
- ru/g/ref: short descriptive name: "Return Window Policy", "Fraud Guard"
- Keep labels 3-8 words, specific to the paragraph's content
- ONE node = ONE concern. Do NOT merge unrelated bullets into one node.

SECTION ENTRY NODES (critical for readable graphs):
- Every section heading paragraph (§N whose text is "## Rule B …",
  "## Step 3 …", "## Refund Amounts", etc.) MUST become an s=step node.
- The label of the s=step node = the heading text without "##".
  Examples: "Rule B — Standard Window Check", "Rule C — Late Claim",
  "Step 3: Item Condition Check", "Refund Amounts", "Rule D — Conflict Resolution".
- This s=step node is the ENTRY GATE for that section's sub-flow.
  ALL flow nodes in that section connect DOWNSTREAM from this s=step node.
- When another section says "apply Rule B" or "proceed to Step 3",
  draw an edge TO that section's s=step node (the jump target).
- The first (preamble) heading or the "## Nova Refund Arbiter" title can
  be merged into the st=start node — no separate s=step needed.
- s=step nodes carry the heading §N ref in their refs array.

CRITICAL RULES:
- Exactly ONE st=start node (id=1)
- Each "If/then" condition → d=decision (NOT ru=rule)
- Each "Exception:" or "unless" clause → its own d=decision
- "Overrides Rule X" → d=decision checking the override condition
- After every t=tool whose result routes execution → add d=decision
- r=resolution for BUSINESS OUTCOMES (approve, deny, credit, refund)
- e=end ONLY for SESSION TERMINATION (input rejected, not found)
- ag=agent for SUB-AGENT references (NOT t=tool)
- h=handoff for ESCALATION to human
- Each §N paragraph maps to EXACTLY ONE primary node — do NOT merge
  multiple §N paragraphs into one node unless they describe the same
  single step. Prefer more nodes with specific labels over fewer
  nodes with vague labels.
- DUPLICATE TOOLS ALLOWED: if different sections each call the same
  tool (e.g., MembershipCheck in Rule B and Rule C), create SEPARATE
  t=tool nodes — one per section. This keeps each section's sub-flow
  self-contained and readable. Each t=tool instance uses its own refs
  from its own section.

SUB-AGENT NODES (ag=agent) — NOT TOOLS:
  When a prompt lists sub-agents the orchestrator can call (e.g.,
  "You have access to: 1. ResearchAgent  2. AnalystAgent  3. WriterAgent"),
  each sub-agent MUST be an ag=agent node, NOT a t=tool node.
  - Label = the agent name: "ResearchAgent", "AnalystAgent"
  - ag=agent nodes are placed IN THE FLOW where the orchestrator
    delegates work (e.g., s "Assign Subtasks" → ag "ResearchAgent",
    ag "AnalystAgent", ag "WriterAgent" → s "Validate Responses")
  - The graph ends at e=end ("Task Complete") AFTER collecting
    results from all sub-agents. Sub-agent nodes are NOT placed
    after the END node.
  - DO NOT use t=tool for named agents. t=tool is for API tools
    like "OrderLookup", "MembershipCheck", "RefundLedger".
  - An agent is identifiable by its name pattern: "XAgent",
    "X_Agent", "AgentX", or an explicit numbered list under
    "You have access to:" / "Available agents:" / "Subagents:".

DECISION ROUTING — MULTI-WAY SPLITS:
  When a paragraph lists N conditions (e.g., "> 90 days → X",
  "30-90 days → Y", "< 30 days → Z"), create a CHAIN of binary
  decisions, NOT one vague multi-way node:
  GOOD:  d "Placed > 90 days ago?" →(Yes)→ s "Rule C — Late Claim"
                                    →(No)→ d "Placed 30-90 days ago?"
                                              →(Yes)→ s "Rule B — Standard Window Check"
                                              →(No)→ s "Step 3: Item Condition Check" (< 30 days)
  BAD:   d "Order age category?" with 3 edges
  Each decision label must be a SPECIFIC binary yes/no question.
  EVERY branch MUST have an outgoing edge — no dead ends.

FULL BRANCHING — EVERY OPTION GETS A PATH:
  When a paragraph has multiple conditions with different outcomes,
  EACH outcome MUST get its own sub-tree with explicit nodes:

  Example for "## Step 3: Item Condition Check":
  s "Step 3: Item Condition Check"
    → a "Ask: Damaged, defective, or unwanted?"
      → d "Is damaged or defective?"
        →(Yes)→ r "Approve Full Refund" → t "RefundLedger"
        →(No, unwanted)→ t "CategoryCheck"
          → d "Is non-returnable?"
            →(Yes)→ r "Deny Refund: Non-Returnable"
            →(No)→ r "Approve Store Credit"

  Example for "## Rule B — Standard Window Check":
  s "Rule B — Standard Window Check"
    → ru "30-90 days: store credit only" (default policy)
    → d "Is defective AND reported within 7 days?"
      →(Yes)→ r "Approve Full Cash Refund"
      →(No)→ t "MembershipCheck"
        → d "Is Platinum Member?"
          →(Yes)→ r "Approve Full Cash Refund"
          →(No)→ r "Issue Store Credit"

  DO NOT collapse multiple outcomes into one node.
  DO NOT skip any branch — every "If X" needs its own d=decision
  and every outcome needs its own r=resolution or a=action.

REFS ISOLATION:
  - A node's refs array MUST only contain §N from ONE section.
    Never mix refs from different sections into one node.
  - If a resolution or action mentions text from another section
    (e.g., "apply Rule B"), use an EDGE to link to that section's
    nodes — do NOT pull that section's §N into this node's refs.

ANNOTATION NODES (p, ru, cf, g, ref, tr, m):
- Set scope: "g"=global, "s"=scoped
- Set governs: [list of flow node ids this annotation applies to]
- Global annotations: governs=[1] (the START node)

═══════════════════════════════════════════════════════════════
2. WIRE EDGES
═══════════════════════════════════════════════════════════════

Connect nodes following these rules:

A) SEQUENTIAL: Step 1 → Step 2 → Step 3 (follow document order)
B) BRANCHING: each d=decision case → separate outgoing edge with a descriptive label
   - Multi-way branches become CHAINS of binary d=decision nodes
   - Example: 3 age brackets → d "Placed > 90 days?" →(No)→ d "Placed > 30 days?" →(No)→ Step 3
C) JUMPS: "apply Rule B", "proceed to Step 3" → edge to that section's s=step node
D) TERMINAL FUNNELING: all r=resolution nodes → lg=logging → e=end
   - Early exits (short input, toxic, not found) bypass the funnel
   - h=handoff nodes have NO outgoing edges
E) GOVERNANCE: annotation → flow node with label "Governs"
F) TOOL → DECISION PATTERN: after every t=tool call, add a d=decision
   node to check the tool's result before continuing. Example:
   t "MembershipCheck" → d "Is Platinum Member?" →(Yes)→ ... →(No)→ ...
G) SECTION ENTRIES: s=step node for each ## section. Parent flow routes
   into the s=step node, which then fans out to that section's decisions/tools.
   Example:
   d "Placed > 90 days ago?" →(Yes)→ s "Rule C — Late Claim" → d "Known mfr defect?" → ...
                              →(No)→ d "Placed > 30 days ago?" →(Yes)→ s "Rule B — Standard Window Check" → ...

EDGE RULES:
- START has ZERO incoming flow edges
- Every d=decision has outgoing edges for ALL its cases
- Every flow node is reachable from START
- Every flow path reaches a terminal (e, r, or h)
- ZERO CYCLES: if A→B exists, B→A is FORBIDDEN
- "Retry once then escalate" = LINEAR (two nodes), NOT a loop
- "Apply Rule B instead" = one-directional jump, NOT a back-edge

═══════════════════════════════════════════════════════════════
3. RETURN THIS EXACT SHAPE
═══════════════════════════════════════════════════════════════

{
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
      "refs": ["§0"]
    },
    {
      "id": 2,
      "type": "d",
      "label": "Is input valid?",
      "refs": ["§3"],
      "tool": "optional",
      "outcome": "optional",
      "scope": "g|s",
      "governs": [4, 5]
    }
  ],
  "edges": [
    [1, 2, "Begin"],
    [2, 3, "Yes"],
    [2, 4, "No"]
  ]
}

STRUCTURAL RULES:
- Every non-blank §N MUST appear in at least one node's refs
- Node ids are sequential integers starting at 1
- Edge tuples: [source_id, target_id, "optional label"]
- Labels on decision edges must be descriptive case names
- scope + governs required on annotation nodes (p, ru, cf, g, ref, tr, m)`;

export const REPAIR_PROMPT = `You are repairing a graph plan.

Output ONLY raw JSON. Same schema as the original.
Return the FULL corrected plan, not a patch.

Fix all listed violations while preserving working parts.
Rules:
- Zero cycles
- Every node reachable from START
- Every flow path reaches a terminal
- Every decision has outgoing edges for all cases
- All §N refs must be claimed
- Do not add/remove nodes unless absolutely necessary`;
