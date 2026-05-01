// Prompt-to-Graph V6 — Business-Flow Specialized Prompt
import { TYPE_CODES, SHARED_LABELING_RULES, SHARED_OUTPUT_SHAPE, SHARED_STRUCTURAL_RULES } from './base';

export const BUSINESS_FLOW_PROMPT = `You convert a structured business-process prompt into a directed acyclic graph.

Output ONLY raw JSON. No markdown fences. No prose.

You are given numbered paragraphs (§0, §1, §2, …). For each paragraph,
decide what graph node(s) it produces and how they connect.

═══════════════════════════════════════════════════════════════
1. CLASSIFY EACH PARAGRAPH
═══════════════════════════════════════════════════════════════

Read each §N paragraph and assign it to one or more nodes:

  TEXT PATTERN                         → TYPE
  ──────────────────────────────────────────────────────────
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

${SHARED_LABELING_RULES}

TOOL FIELD (MANDATORY for t=tool nodes):
- Every t=tool node MUST include a "tool" field set to the exact API/function name.
- Examples:
    { "type": "t", "label": "Python Execution", "tool": "container.python_execution" }
    { "type": "t", "label": "Web Search",        "tool": "http://browser.search"       }
    { "type": "t", "label": "Social Search",     "tool": "meta_1p.content_search"      }
    { "type": "t", "label": "Create Image",      "tool": "media.create_image"          }
- If the paragraph does not name the tool explicitly, use the most specific name
  you can infer from the text. Never leave "tool" as null or omit it.

DESCRIPTION FIELD (REQUIRED on every node):
- Every node MUST include a "desc" field: one short sentence (max 15 words)
  that explains WHAT this node does or WHEN it applies.

CRITICAL RULES:
- Exactly ONE st=start node (id=1)
- Each "If/then" condition → d=decision (NOT ru=rule)
- r=resolution for BUSINESS OUTCOMES (approve, deny, credit, refund)
- e=end ONLY for SESSION TERMINATION (input rejected, not found)
- ag=agent for SUB-AGENT references (NOT t=tool)
- h=handoff for ESCALATION to human

═══════════════════════════════════════════════════════════════
2. WIRE EDGES
═══════════════════════════════════════════════════════════════

Connect nodes following these rules:

A) SEQUENTIAL: Step 1 → Step 2 → Step 3 (follow document order)
B) BRANCHING: each d=decision case → separate outgoing edge with label
C) JUMPS: "apply Rule B", "proceed to Step 3" → edge to that section's s=step node
D) TERMINAL FUNNELING: all r=resolution nodes → lg=logging → e=end
E) GOVERNANCE: annotation → flow node with label "Governs"
F) TOOL → DECISION PATTERN: after every t=tool call, add a d=decision

RULE-SECTION DISCIPLINE (read carefully):
- When a step or decision says "apply Rule X", "if X then Rule Y", or otherwise
  delegates to a named rule/step section, emit an edge whose TARGET is the
  s=step or ru=rule node that represents that rule section's header.
- DO NOT inline the rule's logic adjacent to the triggering decision. The rule
  section owns its own sub-graph and is triggered by a single entry edge.
- Each rule/step section has exactly ONE entry node — the section's header
  s=step node (preferred) or ru=rule node. Decisions that trigger a section
  connect to that entry, NOT to the first tool/action inside the section.
- When a decision branch label mentions a rule (e.g. "30-90 Days (Rule B)"),
  the edge's target MUST be Rule B's entry node, not an inline membership
  check or tool call.

START WIRING:
- The st=start node MUST have exactly ONE default outgoing edge, and that edge
  MUST target the tr=trigger node. No default edges from start to steps, tools,
  or actions. Persona/config/guard annotations attach via "Governs" edges.

EDGE RULES:
- START has ZERO incoming flow edges
- Every d=decision has outgoing edges for ALL its cases
- ZERO CYCLES: if A→B exists, B→A is FORBIDDEN
  — EXCEPTION: a cross-rule reference ("apply Rule X") is legal even if it
    forms a topological back-edge; these are preserved by post-processing.
- Every flow path reaches a terminal (e, r, or h)

═══════════════════════════════════════════════════════════════
3. RETURN THIS EXACT SHAPE
═══════════════════════════════════════════════════════════════

${SHARED_OUTPUT_SHAPE}

${SHARED_STRUCTURAL_RULES}`;
