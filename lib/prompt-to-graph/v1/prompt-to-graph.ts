import { GoogleGenAI } from '@google/genai';
import type { AgentConfig, NodeData, Connection, NodeType, MultiAgentDetection } from '../../types';
import { DEFAULT_GEMINI_MODEL } from '../../types';
import { applyAutoLayout, resolveOverlaps } from '../../graph/auto-layout';
import { validateAgentConfig } from '../../validation';
import { getGraphRuleSettings } from '../../storage/storage';
import { DAG_RULES_FOR_CREATION } from '../../dag-prompt-rules';
import { parseMarkdownToSnippets } from './prompt-to-graph-shared';
import { buildSubAgentContext, extractInterfaceContract } from './multi-agent-context';
import { findBestRoleMatch } from './role-matching';
import yaml from 'js-yaml';

// ─────────────────────────────────────────────────────────────────────────────
// Normalize JS-string-concatenation prompt syntax to clean markdown.
// Handles patterns like:
//   "You are a specialist.\n" +
//   "## RULES:\n" +
//   "- Never lie.\n"
// Strips the surrounding quotes, "\n" escape sequences, and " +" joiners.
// If the text does not match this pattern, returns it unchanged.
//
// Known limitation: if clean markdown happens to pass the 40% detection gate
// (e.g. YAML-style content with many lines starting with a quote character),
// lines ending with a quoted word (e.g. `return "json"`) may have the trailing
// quote stripped. This is acceptable for the intended use-case (JS-concat prompts).
// ─────────────────────────────────────────────────────────────────────────────
export function normalizePromptText(raw: string): string {
  const trimmed = raw.trim();

  // Detect JS string concat: majority of non-blank lines end with \n" + or \n\n" +
  const lines = trimmed.split('\n');
  const jsStringLines = lines.filter(l => /\\n["']\s*\+?\s*$/.test(l.trim()) || /^["']/.test(l.trim()));
  if (jsStringLines.length < lines.filter(l => l.trim()).length * 0.4) {
    // Not a JS string prompt — return as-is
    return raw;
  }

  // Strip JS string syntax line by line
  const cleaned = lines.map(line => {
    let l = line;
    // Remove leading whitespace + optional opening quote
    l = l.replace(/^\s*["']/, '');
    // Remove trailing: \n\n" + or \n" + or " + or trailing quote
    l = l.replace(/\\n\\n["']\s*\+?\s*$/, '\n');
    l = l.replace(/\\n["']\s*\+?\s*$/, '');
    l = l.replace(/["']\s*\+?\s*$/, '');
    l = l.replace(/["']\s*;?\s*$/, '');
    // Unescape \n inside the string → actual newlines
    l = l.replace(/\\n/g, '\n');
    // Unescape \" and \'
    l = l.replace(/\\"/g, '"').replace(/\\'/g, "'");
    return l;
  });

  return cleaned.join('').replace(/\n+$/, '');
}

export interface TokenUsageData {
  promptTokens?: number;
  responseTokens?: number;
  thoughtsTokens?: number;
  totalTokens?: number;
}

export interface PromptToGraphOptions {
  apiKey: string;
  model?: string;
  onChunk?: (text: string) => void;
  onUsage?: (usage: TokenUsageData) => void;
  signal?: AbortSignal;
  outputFormat?: 'json' | 'yaml' | 'json-compact';
  /** Force paragraph-indexed mode on/off. If omitted, auto-enables for prompts ≥10K chars. */
  useParagraphIndexing?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// prompt-flow-graph SKILL.md embedded as system instruction
// ─────────────────────────────────────────────────────────────────────────────
const PFG_SYSTEM_PROMPT = `# Prompt Flow Graph

## CRITICAL OUTPUT RULES

1. Output ONLY raw JSON. First character = \`{\`, last character = \`}\`.
2. No markdown fences, no preamble, no commentary before or after.
3. Think through the entire graph internally before writing. Write the complete JSON in one pass.
4. **Verbatim rule (non-negotiable):** Every \`logic_snippet\` must be findable by exact string search in the source. If you paraphrased — delete it and copy the original.

---

## Role & Guarantees

You are a graph architect. Read any agent instruction document and produce a JSON graph mapping every logical unit.

- **1:1 guarantee**: The graph must contain enough information to fully reconstruct the original document. Nothing omitted, summarized, or merged.
- **Semantic-first layout**: Show what the agent does at runtime — decisions, actions, rules — not section mirrors.
- **DAG invariant**: The graph is a strict directed acyclic graph. No cycles. No back-edges. Every node topologically sortable. Every edge flows forward (higher order targets).
- **Top-to-bottom flow**: START at top, END/HANDOFF nodes at bottom. Every path reads as a straight downward line.

---

## Step 1 — Analyze the Document

1. Read the entire document top to bottom before creating nodes.
2. Identify the pattern: decision-tree, sequential process, multi-service/config, or hybrid.
3. Identify \`source_doc_format\`: "markdown_yaml", "markdown_table_meta", "markdown_nested_meta", or "plain_markdown".
4. Maintain a **global counter** starting at 1. Every node gets the next value as its \`order\`.

## Step 2 — Extract Everything

### 2A — Frontmatter / Metadata

- markdown_table_meta / markdown_nested_meta: header row → one config node, each value row → its own config node.
- markdown_yaml: each key:value → one config node (source_format: "yaml_field").
- Hook sub-rows: each tab-separated cell → its own config node (source_format: "tab_table_row").

### 2B — Input Detection & Merged Input Pattern

Scan for explicitly declared runtime inputs before building other nodes.

**Create input nodes ONLY when the document has explicit lines.** Signals: "you receive", "you are given", "you have access to", dedicated INPUTS/CONTEXT section.
- Required (input_required: true): "you receive", "is provided"
- Optional (input_required: false): "you may know", "optionally", "if available"
- User-facing questions: create INPUT for the expected response, wire to consuming DECISION/ACTION.

**Merged Input Pattern**: When multiple inputs belong to the same logical group (e.g., "Required Fields: field_a, field_b, field_c"):
- Create ONE input node for the group, NOT one per field.
- Set \`label\` = group name (e.g., "Required Fields").
- Set \`description\` = bulleted list of sub-items (one per field).
- Set \`logic_snippet\` = verbatim text of the entire group listing from the source.
- Wire ONE edge from the merged input node to the center-column node that consumes all those inputs.
- When inputs are scattered (not grouped under a heading), each gets its own input node as before.

If the document has NO explicit input declarations, do NOT invent input nodes.

### 2C — Body Extraction

From the document body, in reading order, extract every logical unit:

- Section headings → step nodes (source_format: "heading")
- Identity / persona → persona nodes. For documents that define tone, target audience, writing style, or mascot identity, ALWAYS create a PERSONA node (persona_scope: "agent") capturing these attributes. This includes meta-prompts that instruct HOW content should be written.
- Sequential steps → step nodes
- Decision logic (IF/THEN, conditional branches) → decision nodes
- Actions → action nodes
- Tool/API invocations → tool nodes (ONE tool node per distinct tool name, even when mentioned inline inside a bullet)
- Named rules or policies → rule nodes
- Selectable options → option nodes
- Configuration values → config nodes
- External references, lookup tables, template definitions, emoji/symbol tables → reference nodes. When a document defines a standardized set of symbols, emojis, or codes that are referenced throughout, create ONE reference node listing them all.
- Escalation paths → handoff nodes
- Hooks / triggers → trigger nodes

**Tool Extraction (CRITICAL):** Every distinct tool name in the source MUST produce its own TOOL node. Tools mentioned inside parentheses like "(detected via ToxicityFilter tool)" or "(call CategoryCheck tool)" or "(check MembershipCheck tool)" MUST each get their own TOOL node, wired to the node that uses their result. Do NOT skip a tool just because it appears inline.

**One bullet = one node**. Each list item becomes exactly ONE node. Do NOT split a single bullet into multiple nodes.
CRITICAL EXCEPTION FOR CONDITIONS: Consecutive IF/THEN blocks or distinct logical conditions MUST be split into separate individual nodes. Never group multiple IF/THEN blocks into a single node's logic_snippet.
No duplicate content: Never create a node whose logic_snippet is a substring of another node's. Every snippet must be uniquely findable.

**No duplicate content:** Never create a node whose \`logic_snippet\` is a substring of another node's. Every snippet must be uniquely findable.

**Capture every standalone line** that carries meaning and is not already inside another node's \`logic_snippet\`.

### 2D½ — Constraint / Guard Detection

Scan for hard constraints, prohibitions, and absolute rules. Signals:
- "DO NOT", "NEVER", "must NOT", "FORBIDDEN", "AVOID"
- "ALWAYS" (when enforcing a mandatory behavior)
- "CRITICAL", "MANDATORY", "NON-NEGOTIABLE"
- Numeric limits: "no more than X", "maximum Y per Z"

For each hard constraint, create a GUARD node:
- label: Short constraint name (e.g., "Function Limit", "No Printed Tips")
- logic_snippet: Verbatim constraint text
- rule_scope: "scoped" (wire to specific nodes) or "global" (wire to START)
- Wire GUARD → node it constrains, label "Constrains"

Do NOT fold constraints into STEP or RULE nodes. GUARDs are visually distinct (red shield in the UI) and signal hard restrictions vs soft guidance (green RULE).

### 2D — Logging Node Injection (CRITICAL)

Scan the source document for a logging / auditing / recording section (e.g., "## Logging", "## Audit", "## Recording").

If such a section exists:

1. Identify the logging tool name from the section (e.g., "RefundLedger", "AuditDB").
2. For **every** terminal path in the graph (every path that ends at an END or HANDOFF node), inject a **LOGGING** node **immediately before** the terminal node.
3. Wire inline: \`[last action/resolution/decision] → LOGGING → END/HANDOFF\`.
4. Each LOGGING node:
   - type: "logging"
   - label: "Log [Decision/Action Label]" (descriptive of what is being logged)
   - logic_snippet: verbatim logging instruction from the source (e.g., "Log to RefundLedger with: order_id, decision, rule_applied, timestamp.")
   - tool: the logging tool name
   - source_section: the logging section heading
5. Also create the logging section heading and individual logging rules as RULE nodes (global scope) — these are separate from the inline LOGGING nodes.
6. Wire each global logging RULE node → each LOGGING node with label "Governs".

**Result:** Every path through the graph passes through a LOGGING node before terminating. No branch can reach END or HANDOFF without being logged.

If the document has NO logging/auditing section, do NOT create any LOGGING nodes.

### 2E — Reference / Documentation Section Extraction (CRITICAL)

Scan for sections that list external resources, documentation, or references (e.g., "## Reference Files", "## Documentation", "## Resources", "## Links").

When such a section exists:

1. Create ONE reference node per distinct resource listed (URL, guide name, document name).
2. Each reference node's logic_snippet MUST include the full description of what the resource contains (e.g., "Complete Python/FastMCP guide with: Server initialization patterns, Pydantic model examples, Tool registration with @mcp.tool").
3. When resources have **loading-priority or timing directives** (e.g., "Load First", "Load During Phase 2", "Required before implementation"), create a CONFIG node for each timing group with:
   - label: The group heading (e.g., "Core MCP Documentation (Load First)")
   - logic_snippet: Verbatim text of the timing directive and resource list
   - Wire CONFIG → the phase/step GROUP node it applies to, label "Required for"
4. Wire each REFERENCE node → the step/group that consumes it, label "Provides reference".

Do NOT skip a reference section just because it appears at the end of the document. Every listed resource MUST produce a node.

WRONG: A "Reference Files" section with 10 resources produces zero nodes.
CORRECT: Each resource gets its own REFERENCE node; each timing group gets a CONFIG node.

### 2F — Configuration / Settings Detection

Scan for configuration patterns: recommended stacks, model settings, parameter choices, environment settings. Signals:
- "Recommended stack", "Default settings", "Configuration"
- Key-value patterns: "Language: TypeScript", "Transport: HTTP", "Temperature: 0"
- Technology choices: "Use X for Y", "Prefer X over Y"

For each distinct configuration block, create a CONFIG node:
- label: Short name (e.g., "Recommended Stack", "Model Settings")
- logic_snippet: Verbatim configuration text
- Wire CONFIG → the step/group it configures, label "Defines"

Do NOT fold configuration data into STEP nodes. CONFIG nodes are visually distinct and signal parameter/settings choices.

### 2G — CLI Command / Tool Invocation Detection

Scan for explicit command-line invocations, build commands, and tool calls. Signals:
- Backtick-wrapped commands: \`npm run build\`, \`python -m py_compile\`
- "Run X", "Execute X", "Test with X"
- CLI tools: npx, npm, pip, python, docker, etc.

For each distinct CLI command or tool invocation, create a TOOL node:
- label: Command name (e.g., "npm run build", "MCP Inspector")
- logic_snippet: Verbatim instruction text containing the command
- tool: The tool/command name
- Wire TOOL → the step that uses its result, label "Provides result"

Do NOT skip tools just because they appear inside a build/test instruction. Each distinct command is a separate TOOL node.

---

## Step 3 — Node Types & Schema

### Node Types

| type | use for |
|------|---------|
| start | Single entry point (order: 1). logic_snippet = document title or "". EXACTLY ONE. Zero incoming edges. |
| end | Terminal outcome. ONE per distinct path. Label = outcome name. logic_snippet MUST be empty string "" — NEVER fabricate or infer text for END nodes. |
| input | Runtime data from outside. Set input_required: true/false. Use Merged Input Pattern for grouped fields. |
| decision | Branch point with 2+ outgoing edges. Label MUST be a "?" question (e.g., "Confidence < 80%?"). |
| action | Discrete operation the agent performs. |
| tool | External tool/API/CLI invocation. One TOOL node per distinct tool name. Edge: tool → consuming node ("Provides result"). Even if mentioned inline in parentheses, ALWAYS create. |
| rule | Behavioral constraint. rule_scope: "global" (wire to START) or "scoped" (wire to specific nodes). |
| step | Sequential procedure step or named-procedure section heading. |
| option | Selectable choice. MUST have both incoming AND outgoing edges. |
| skill | Named external skill/plugin. Wire like tool. |
| agent | Autonomous sub-agent or AI service. |
| reference | Pointer to external file/URL/knowledge base. |
| config | Configuration values, model settings, templates. |
| trigger | Pre/post event hook, scheduled activation. |
| condition | Boolean guard clause (no branching). |
| task | Batch operation, loop, retry block. |
| persona | Identity (persona_scope: "agent") or tone (persona_scope: "response"). |
| memory | Read/write to context, session, or knowledge base. |
| handoff | Transfer to another agent/human. ALWAYS at leaf level (see Handoff Rule below). |
| logging | Write to audit log/compliance system. |
| guard | Hard constraint, prohibition, safety filter, content policy. Signals: "DO NOT", "NEVER", "must NOT", "FORBIDDEN", "AVOID". Also used for section headings that define validation or safety gates (e.g. "Step 1: Input Validation"). |
| resolution | Conclusive named outcome of a decision branch. |
| group | Section/phase container. MANDATORY when the prompt has numbered phases (e.g. "Phase 1: Research", "Phase 2: Implementation") or clearly delineated top-level sections (e.g. "## Setup Instructions"). The GROUP node's label is the section heading. Child steps within that section connect FROM the GROUP via edges. GROUP nodes have terse logic_snippet (just the heading text). Do NOT use step for phase/section headings that contain child steps — use group instead. |

### Node Object Shape

{
  "id": "n1",
  "type": "step",
  "position": { "x": 0, "y": 0 },
  "data": {
    "label": "Short label (max 6 words)",
    "description": "Fuller explanation",
    "logic_snippet": "VERBATIM text from source",
    "tool": "tool_name or null",
    "value": "threshold/enum or null",
    "outcome": "success|failure|escalation|refusal|timeout (end nodes only)",
    "source_section": "Exact section heading or empty string for preamble",
    "source_format": "prose|numbered_list|bulleted_list|table_row|yaml_field|tab_table_row|heading",
    "order": 1,
    "input_required": null,
    "rule_scope": null,
    "applies_to": null,
    "persona_scope": null,
    "branch_group": null
  }
}

**Field rules:**
- \`label\`: Decision nodes MUST end with "?" naming the condition. WRONG: "Late Claim Check". CORRECT: "Claim Over 90 Days?".
- \`input_required\`: true/false on input nodes only, null on all others.
- \`rule_scope\`: "global"/"scoped" on rule nodes only, null on all others.
- \`applies_to\`: Array of node IDs (scoped) or "all" (global) on rule nodes, null on others.
- \`persona_scope\`: "agent"/"response" on persona nodes only, null on all others.
- \`branch_group\`: Shared snake_case id on parallel branch outcome nodes. null on others.
- \`logic_snippet\`: ALWAYS verbatim. Never summarize. Must be string-searchable in source.
- \`source_section\`: Exact heading text. "Frontmatter" for frontmatter. "" for preamble.
- \`source_format\`: Exactly one of: prose, numbered_list, bulleted_list, table_row, yaml_field, tab_table_row, heading.
- \`order\`: Unique sequential integers starting at 1, strict reading order.

---

## Step 4 — Structural Patterns

### Hierarchy Rule (CRITICAL)

When a prompt has headings (##, ###) or numbered phases (Phase 1, Step 1):
- Create a **GROUP** node (type: "group") for each top-level section/phase. NOT a step node.
- GROUP node label = the section heading (e.g., "Phase 2: Implementation").
- GROUP node logic_snippet = just the heading text (brief — the content belongs to child nodes).
- Connect child steps as: GROUP → child1 → child2 → ... → child_n.
- Phase transitions: last child of Phase N → GROUP of Phase N+1.

WRONG: Phase headings as STEP nodes with tautological logic_snippets.
CORRECT: Phase headings as GROUP nodes, child content as STEP/ACTION/DECISION nodes.

### 4A — IF/THEN Classification Pattern (CRITICAL)

When the document lists explicit conditional branches:
\`\`\`
IF [condition A] THEN [action A]
IF [condition B] THEN [action B]
IF [condition C] THEN [action C]
\`\`\`

Create ONE foundational DECISION node representing the branch point. The DECISION node label = the classification question (e.g., "Issue Type?", "Request Category?"). If there is no summarizing text for this decision, its logic_snippet can be the section header or an empty string.
For EACH explicit IF/THEN clause, you MUST create a separate downstream node (Type: condition or action) at the start of its branch.
The logic_snippet for each of these branch nodes MUST contain ONLY its specific IF ... THEN ... text block.
Never bundle all the IF/THEN blocks into the DECISION node's logic_snippet.
Each outgoing edge from the DECISION node connects to one of these specific IF/THEN nodes.
Each edge label = the specific condition (e.g., "Incident", "Problem").
After passing through its specific IF/THEN node, each branch leads to a FULLY INDEPENDENT vertical subtree with its own nodes and its own END.
Do NOT merge branches into shared downstream nodes.

WRONG: DECISION "Classify?" → single edge "Classified" → shared handler
CORRECT: DECISION "Issue Type?" → "Incident" → [Incident subtree] → END "Incident Created"
                                → "Problem" → [Problem subtree] → END "Problem Created"
                                → "Change Request" → [Change subtree] → END "Change Created"
                                → "Service Request" → [SR subtree] → END "SR Fulfilled"

### 4B — Independent Subtree Rule (CRITICAL)

After ANY fan-out from a DECISION or OPTION node:

1. Each branch is a FULLY INDEPENDENT vertical path flowing downward.
2. Branches NEVER merge back into shared downstream nodes.
3. If multiple branches need the same downstream logic (e.g., "validate", "confirm"), DUPLICATE it per branch — each branch gets its own copy.
4. Each branch terminates at its own END or HANDOFF node.
5. **Only exception**: the source document EXPLICITLY says paths reconverge (e.g., "regardless of type, proceed to validation").

When in doubt, keep branches independent. Independent paths are always safer than spaghetti merges.

WRONG: DECISION → [Branch A, B, C] → all merge into shared "Process" → single END
CORRECT: DECISION → Branch A → Process A → END A
                  → Branch B → Process B → END B
                  → Branch C → Process C → END C

### 4C — Handoff / Escalation Rule

HANDOFF nodes are ALWAYS leaf nodes at the bottom of a branch:

- They sit at the same vertical level as END nodes.
- They MUST have at least one incoming edge from the branch that triggers them.
- They NEVER float as detached islands.
- They are ALWAYS center column.
- No further center-column nodes exist below a HANDOFF on that branch.
- "escalate to human", "escalate immediately", "escalate to supervisor" → ALWAYS handoff type, NEVER rule.

WRONG: HANDOFF floating with no edges. WRONG: HANDOFF → more nodes below.
CORRECT: DECISION "Need Escalation?" →"Yes" HANDOFF "Escalate to Human" (leaf, terminal).

### 4D — Cycle Prevention (CRITICAL)

The graph MUST be acyclic. When the document describes retry/loop/feedback:

1. Do NOT create back-edges.
2. Insert a CONDITION node at the loop boundary:
   - Label: "Loop: [trigger]" (e.g., "Loop: Awaiting User Input")
   - logic_snippet: verbatim retry/loop instruction
3. Wire forward: asking-action → CONDITION → next logical step (NOT back to original decision).

WRONG: "Fields Missing?" → "Ask for Fields" → "Fields Missing?" (CYCLE!)
CORRECT: "Fields Missing?" → "Ask for Fields" → CONDITION "Loop: Awaiting Input" → "Fields Complete?" → next step

### 4E — Named Procedure Sections (CRITICAL — NO DEAD-END HEADINGS)

When a decision says "apply Rule X" and the document has "## Rule X":
- Section heading → \`step\` node (NOT \`rule\`).
- Content inside: constraints → \`rule\` (scoped), exception branches → \`decision\`, escalations → \`handoff\`.
- Every \`step\` heading node MUST have at least one outgoing edge to its first child node.

**CRITICAL: A heading STEP node must NEVER be a dead end.** Every bullet under the heading MUST produce its own node:
- Default behavior line (e.g., "Items over 90 days are not eligible") → RULE node (scoped) + a DECISION or RESOLUTION to enforce it
- Exception lines (e.g., "Exception: if ...") → DECISION node with branches
- Tool mentions (e.g., "call ManufacturerDefectDB tool") → TOOL node wired to the DECISION
- Escalation outcomes → HANDOFF node
- Each exception branch leads to its own independent subtree with its own END

WRONG: STEP "Rule C — Late Claim" with ZERO outgoing edges (dead end!)
CORRECT: STEP "Rule C" → DECISION "Known Manufacturer Defect?" → [HANDOFF "Escalate" | DECISION "Platinum Member?" → [STEP "Apply Rule B" | RESOLUTION "Deny Refund" → END]]

### 4F — Overview-to-Detail Wiring

When an overview list ("1. X, 2. Y, 3. Z") is followed by detailed sections:
- Wire each overview step → its corresponding detail section heading.
- Wire last node of each detail section → next overview step.
- Result: overview-1 → detail-1 → ... → overview-2 → detail-2 → ...
- Do NOT create parallel disconnected chains.

### 4G — List Fan-Out Pattern

When the document lists categories, options, or capabilities:

1. Heading/intro → STEP node (center).
2. Each item → OPTION or ACTION node (center).
3. Wire STEP → each item with edge labeled by item name.
4. Each item with detailed flow → wire to that flow's first node.
5. Items WITHOUT detailed flow → wire to placeholder ACTION "Handle [Name]" → END "[Name] Complete".
6. **Default**: Use independent subtrees (each item → own vertical path → own END). Only merge if items genuinely share identical downstream logic.

### 4H — Decision-Before-Tool-Call

When "If X not provided, ask; if provided, call tool Y":
1. DECISION checking X presence.
2. Missing branch → ACTION "Ask for X".
3. Present branch → forward to result processing.
4. TOOL node → result-processing node ("Provides result").

### 4I — If-Else Chain (branch_group)

Consecutive if-else checks on the same value → each check = one decision node. Tag the immediate outcome nodes with the same \`branch_group\` string so the layout engine aligns them side-by-side.

---

## Step 5 — Build the Edge List

{
  "id": "e1",
  "source": "n1",
  "target": "n2",
  "label": "Descriptive condition label",
  "data": {
    "condition": "Verbatim or close condition text",
    "animation": "pulse|none"
  }
}

### Edge Labels

- Decision edges: ALWAYS descriptive conditions. NEVER bare "Yes"/"No"/"True"/"False".
  WRONG: "Yes". CORRECT: "Incident", "Over 90 days", "Low Confidence".
- **Sequential edges (CRITICAL): NEVER use generic labels like "Next", "Then", "Continue".** Instead, describe WHY or WHAT enables the transition. Use the pattern: "[completion state] → [purpose of next step]".
  WRONG: "Next". WRONG: "Continue". WRONG: "Then".
  CORRECT: "Research complete", "Stack selected", "Structure ready", "Tools implemented", "After review".
  For phase transitions: "Start Phase 2", "Begin Testing" are acceptable but prefer action-oriented labels.
- animation: "pulse" for happy path, "none" for error/fallback.

### Special Wiring

- **START invariant**: ZERO incoming edges to START from ANY node. START is the sole entry point. NEVER wire any node back to START. This is an absolute rule — no exceptions.
- **Every node MUST be reachable from START.** No floating islands. If a node has no path from START, the graph is broken.
- **Annotation nodes (RULE, GUARD, PERSONA, CONFIG, MEMORY) use a TWO-EDGE pattern:**
  1. **START → annotation node** (label "Applies to Agent" / "Defines Role" / "Response Style")
  2. **annotation node → first DECISION or ACTION** in the main flow (label "Applies to Agent" / "Defines Role" / "Governs")
  - This makes annotation nodes reachable from START AND their constraints flow forward to the main flow.
  - **WRONG**: GUARD with only an outgoing edge and no incoming edge (unreachable island).
  - **CORRECT**: START → GUARD "Compliance Rules" → DECISION "Identify Request Type?"
  - **Global rules** (rule_scope: "global"): START → rule → first DECISION/ACTION, labels "Applies to Agent".
  - **Scoped rules** (rule_scope: "scoped"): START → rule → specific DECISION/ACTION/STEP node(s), labels "Governs".
  - **GUARD nodes**: START → guard → first DECISION or ACTION it protects, labels "Applies to Agent".
  - **Personas** (agent scope): START → persona → first DECISION/ACTION, labels "Defines Role".
  - **Personas** (response scope): START → persona → first DECISION/ACTION, labels "Response Style".
- **REFERENCE nodes**: START → reference → the node it informs (DECISION/CONDITION/STEP), label "Provides reference".
- **Tools**: Edge tool → result-processing node, label "Provides result".
- **Configs**: Edge config → node it configures, label "Defines".
- **Inputs**: Edge input → consuming DECISION/ACTION, label "Provides [input name]".

**ANTI-PATTERNS (FORBIDDEN):**
- Annotation node with NO incoming edge (unreachable island — not reachable from START).
- Annotation node wired BACK to START as a target (creates illegal cycle).
- GUARD/RULE/PERSONA that only has outgoing edges but no incoming from START.

### Connectivity Guarantee

Every RULE, CONFIG, TOOL, MEMORY, GUARD, REFERENCE, TRIGGER, PERSONA, INPUT node MUST have at least one outgoing edge. Zero disconnected nodes.

**Flow guarantee (CRITICAL):** Every node that is not END or HANDOFF MUST have at least one outgoing edge. If you create a node with zero outgoing edges and it is not END or HANDOFF, the graph is BROKEN. Fix it by wiring to its child content nodes.

Anti-patterns (FORBIDDEN):
- Rule/config/tool with no outgoing edges (floating island).
- STEP heading with no outgoing edges (dead-end heading).
- Rule → rule, rule → self-loop.
- Duplicate edges (same source+target pair).
- DECISION node with only 1 outgoing edge (e.g., only the "Yes" branch but no "No" fallback).
- DECISION node with 0 outgoing edges (created the question but forgot to wire the answers).

**COMMON GEMINI FAILURE — READ CAREFULLY:**
When the source says "If damaged or defective: approve full refund", you MUST create the full downstream path:
  DECISION "Damaged?" → RESOLUTION "Approve Full Refund" → LOGGING → END
Do NOT stop at the DECISION node. The DECISION is just the question — you must also create the ANSWER nodes.

Similarly, when a DECISION has two possible outcomes (e.g., "defect reported < 7 days?" — yes or no), you MUST create edges for BOTH outcomes. If the "No" case falls through to a default (e.g., store credit), wire an explicit edge from the DECISION to that default RESOLUTION. Never leave a DECISION with only one outgoing edge.

---

## Step 6 — Detect Conflicts

{
  "id": "conflict_1",
  "type": "dead_end|unreachable|circular_logic|missing_fallback|contradiction|overlap|priority_gap|ambiguous_condition|undefined_reference|missing_documentation|tool_restriction_conflict|hook_scope_ambiguity",
  "severity": "critical|warning|info",
  "involved_nodes": ["n5", "n8"],
  "reason": "Clear explanation",
  "suggestion": "Actionable fix"
}

---

## Step 7 — Metadata & Registries

### Metadata
{
  "agent_id": "snake_case_id",
  "persona": "role name or null",
  "tone": "tone or null",
  "version": "version or null",
  "description": "one-sentence summary",
  "model": "model name or null",
  "aliases": [],
  "skills": [],
  "allowed_tools": [],
  "hooks": [],
  "source_doc_format": "markdown_yaml|markdown_table_meta|markdown_nested_meta|plain_markdown"
}

### Global Rules Registry
Collect all rule nodes with rule_scope "global":
[{ "id": "gr1", "label": "Group label", "rule_nodes": ["n13"], "applies_to": "all" }]

### Inputs Registry
Collect all input nodes (including merged input nodes):
[{ "node_id": "n3", "required": true }, { "node_id": "n4", "required": false }]

---

## Output Format

Raw JSON, nothing else:

{
  "metadata": { ... },
  "graph": {
    "nodes": [ ...node objects in id order... ],
    "edges": [ ...edge objects... ],
    "conflicts": [ ...conflict objects... ],
    "global_rules": [ ...global rule groups... ],
    "inputs": [ ...input registry... ]
  }
}

**CRITICAL TOKEN SAVING RULE:**
Omit ANY dictionary keys where the value would be \`null\`, \`false\`, or an empty array \`[]\`. Do not include fields like \`tool\`, \`outcome\`, \`input_required\`, \`rule_scope\`, etc., if they do not apply.

---

## Quality Checklist (verify before output)

**Structural:**
- Exactly ONE start node with ZERO incoming edges
- Every DECISION has 2+ outgoing edges with descriptive labels (never "Yes"/"No"). **SELF-CHECK: iterate every DECISION node in your output and count its outgoing edges. If any has < 2, you MUST add the missing branch before outputting.**
- Every explicit IF/THEN in source creates one outgoing edge per named branch. If the source implies a default/fallback case (e.g., "if X do Y" implies "if NOT X, continue normally"), you MUST create an explicit edge for the fallback.
- After fan-out, each branch is an independent subtree with its own END (no spaghetti merges)
- Every DECISION branch leads to a complete path ending at END or HANDOFF — never a dangling DECISION with no downstream RESOLUTION/ACTION
- NO CYCLES: for every edge A→B, B is never an ancestor of A. If you find a would-be back-edge, use CONDITION loop-boundary pattern instead
- Every HANDOFF is reachable from main flow and sits at leaf level (no detached islands)
- Every step heading (source_format: "heading") has outgoing center→center edge — ZERO dead-end headings
- Every option has BOTH incoming AND outgoing edges
- Every path reaches END or HANDOFF
- Every node has outgoing edges EXCEPT END and HANDOFF (no dead-end nodes)
- Numbered phases (Phase 1, Phase 2...) and top-level sections use GROUP type, EXCEPT when the section is primarily about validation/safety rules, in which case use GUARD.
- END nodes have logic_snippet = "" (empty) — NEVER fabricated text

**Tools & Commands:**
- Every distinct tool name mentioned in the source has its own TOOL node
- Every TOOL node is wired to the node that processes its result
- Tools mentioned inline in parentheses (e.g., "via ToxicityFilter tool") are NOT skipped
- Every CLI command in backticks (e.g., \`npm run build\`, \`npx ...\`) has its own TOOL node

**References & Config:**
- Every "Reference", "Documentation", or "Resources" section has one REFERENCE node per listed resource
- Resource loading-priority directives ("Load First", "Load During Phase X") produce CONFIG nodes
- Configuration/settings blocks (recommended stacks, model params) produce CONFIG nodes, not STEP nodes

**Edge Labels:**
- Sequential edges NEVER use generic "Next", "Then", "Continue" — use descriptive transition labels

**Logging:**
- If the source document has a logging/auditing section, EVERY terminal path (before END or HANDOFF) includes a LOGGING node
- LOGGING nodes appear inline between the last action/resolution/decision and the terminal node
- Each LOGGING node has the correct tool name from the logging section
- Global logging RULE nodes are wired to each LOGGING node with "Governs" edges

**Wiring:**
- **START has ZERO incoming edges** — iterate every edge and confirm no target = START node id. If any edge targets START, delete it.
- **Every node is reachable from START** — do a mental DFS from START and confirm every node appears. Unreachable nodes are broken.
- **Annotation nodes use TWO-EDGE pattern**: START → annotation → DECISION/ACTION. Each RULE/GUARD/PERSONA must have BOTH an incoming edge from START AND an outgoing edge to the main flow.
- Every rule node has outgoing edge(s) (global → first DECISION/ACTION, scoped → specific nodes)
- Every RULE, CONFIG, TOOL, MEMORY, GUARD, REFERENCE, TRIGGER, PERSONA, INPUT node has at least one outgoing edge (no floating islands)
- Every edge source and target is a real node id
- No duplicate edges (same source+target)

**Dead-End Self-Audit (MANDATORY — do this LAST before outputting):**
- For EVERY node in your output that is NOT type END or HANDOFF, verify it appears as a "source" in at least one edge. If it doesn't, the graph is broken — add the missing edge(s).
- For EVERY DECISION node, count how many edges have it as "source". If the count is < 2, add the missing branch edge and any missing downstream nodes (RESOLUTION, LOGGING, END).

**Content:**
- Every logic_snippet is verbatim (string-search test)
- No duplicate logic_snippet values across nodes
- One bullet = one node (no splitting bullets into multiple nodes)
- Every node has source_section, source_format, order set
- order values are unique sequential integers from 1
- Decision labels end with "?" naming the condition
- Grouped inputs use Merged Input Pattern (one node per group)

**Registries:**
- All global rules listed in global_rules
- All input nodes listed in inputs (including merged)
- source_doc_format set in metadata

**Output:**
- Valid JSON starting with \`{\` and ending with \`}\`
- No fences, no preamble, no trailing text`;

// Appended to PFG_SYSTEM_PROMPT only when the source prompt is >= 10,000 characters.
const PFG_LARGE_PROMPT_SUPPLEMENT = `

---

## Supplement: Large Prompt Handling (10,000+ characters)

This supplement OVERRIDES and EXTENDS the base rules when the source document is 10,000+ characters.
Read it in full before generating any nodes.

---

### PRE-GENERATION PLANNING (do this first, before any node creation)

1. Scan the entire document. List every top-level section, XML tag, heading, and paragraph cluster.
2. Count non-blank lines. Divide by 4 → that is your minimum node target.
   - Example: 300 non-blank lines → minimum 75 nodes required.
   - If you produce fewer nodes than this floor, you MUST keep adding until you reach it.
3. For each section in your list, mark whether you have created nodes for it. Do not skip any.

**STOP RULE**: After completing the main decision tree, you are NOT done. You have only finished the routing spine (~20% of a behavioral prompt). Continue extracting ALL remaining sections.

---

### XML / HTML SECTION HANDLING (CRITICAL)

XML and HTML tags (e.g. \`<behavior_instructions>\`, \`<artifacts_info>\`, \`<search_instructions>\`,
\`<citation_instructions>\`, \`<refusal_handling>\`, \`<tone_and_formatting>\`, \`<user_wellbeing>\`,
\`<knowledge_cutoff>\`) are NOT wrappers to skip. They are first-class sections with full content.

**For every XML-tagged section:**
1. Create one GROUP node for the tag itself (label = tag name in Title Case, e.g. "Artifacts Info").
2. For EVERY paragraph, rule, bullet, and sentence inside the tag, create a child node:
   - Behavioral rule / constraint → RULE node (rule_scope: "global")
   - Conditional behavior (IF/THEN) → DECISION + ACTION nodes
   - Tool definition → TOOL node
   - Identity/character trait → PERSONA node (persona_scope: "agent")
   - Tone/communication constraint → RULE node (rule_scope: "global")
3. Nested XML tags → nested GROUP node with its own children.
4. Wire GROUP → first child → next child → ... in reading order.

**WRONG**: \`<artifacts_info>\` produces 0 or 1 nodes because "it's just metadata".
**CORRECT**: \`<artifacts_info>\` produces a GROUP node + 15–25 child nodes covering every
design principle, artifact type, React constraint, storage restriction, and usage rule inside it.

---

### PROSE PARAGRAPH EXTRACTION (CRITICAL — this is the #1 cause of low coverage)

For behavioral/instruction prompts, EVERY standalone prose paragraph is a node.

**The rule**: Each paragraph that carries a distinct behavioral instruction MUST become its own node.
Do NOT bundle multiple paragraphs into one node's logic_snippet — that hides coverage.

**Node type assignment for prose paragraphs:**
- "If [condition], [agent does X]" → DECISION node (the condition) + ACTION node (what X is)
- "[Agent] always/never/must [do X]" → RULE node (rule_scope: "global")
- "[Agent] is [trait]" or "[Agent] enjoys/cares about [X]" → PERSONA node
- "[Agent] responds in [way]" or "[Agent] avoids [pattern]" → RULE node (tone/communication)
- "[Agent] can [capability]" → RULE or ACTION node
- A paragraph listing N behaviors → N separate nodes, one per sentence if each is distinct

**VERBATIM RULE — applies to ALL node types without exception:**
logic_snippet is a copy-paste from the source. Character for character. Do NOT rewrite.

The most common failure pattern (DO NOT DO THIS):
- Source: "it clarifies the situation and asks the human to paste the relevant text"
- WRONG snippet: "Clarifies the situation and asks the human to paste the relevant text" ← dropped "it", capitalized
- CORRECT snippet: "it clarifies the situation and asks the human to paste the relevant text or image content directly into the conversation."

More examples of the WRONG pattern to avoid:
- Source: "Claude is always sensitive to human suffering, and expresses sympathy..."
- WRONG: "Always sensitive to human suffering; expresses sympathy..." ← dropped subject, changed punctuation
- WRONG: "Claude is always sensitive to human suffering." ← truncated mid-sentence
- CORRECT: Copy the full sentence verbatim.

- Source: "Claude avoids peppering the human with questions and tries to only ask the single most relevant follow-up question"
- WRONG: "Avoids peppering with questions; tries to only ask the single most relevant follow-up."
- CORRECT: "Claude avoids peppering the human with questions and tries to only ask the single most relevant follow-up question when it does ask a follow up."

**Test**: after writing each logic_snippet, mentally search for it in the source. If you changed even one word, it will fail. Fix it before moving on.

---

### PERSONA MULTI-TRAIT EXTRACTION

A behavioral prompt with 15 persona sentences → 15 separate PERSONA or RULE nodes.
**NEVER collapse multiple traits into one PERSONA node.**

Each sentence of the form "[Agent] is/does/avoids/enjoys [X]" → its own node:
- Identity/character ("Claude is intellectually curious") → PERSONA (persona_scope: "agent")
- Communication style ("Claude avoids peppering the human with questions") → RULE (rule_scope: "global")
- Emotional response ("Claude is always sensitive to human suffering") → RULE (rule_scope: "global")
- Capability ("Claude is happy to help with analysis, coding, creative writing") → RULE (rule_scope: "global")

Wire each PERSONA node → first node after START, label "Defines Role".
Wire each communication RULE → first node after START, label "Applies to Agent".

---

### SECTION-BY-SECTION COVERAGE CHECKLIST

For a typical LLM system prompt (like claude.json), confirm ALL of these section types have nodes:

☐ Identity / model name → PERSONA nodes (one per trait sentence)
☐ Date / knowledge cutoff → CONFIG nodes
☐ URL / link handling → DECISION + ACTION
☐ Controversial topics → DECISION + ACTION
☐ Math / logic problems → DECISION + ACTION
☐ Obscure topics / hallucination → DECISION + ACTION
☐ Citation handling → DECISION + ACTION
☐ Empathy / human suffering → RULE or PERSONA
☐ Creative writing / roleplay → DECISION + ACTION
☐ Long tasks / piecemeal → DECISION + ACTION
☐ Dangerous / risky activities → DECISION + ACTION
☐ Tone rules (no affirmations, no safety warnings) → RULE nodes
☐ Response length rules → RULE nodes
☐ Language-following rule → RULE node
☐ Refusal handling (malware, child safety) → GUARD nodes
☐ Citation instructions XML section → GROUP + child RULE nodes
☐ Artifacts info XML section → GROUP + child RULE/DECISION/TOOL nodes
☐ Search instructions XML section → GROUP + child RULE/DECISION nodes
☐ Knowledge cutoff XML section → GROUP + CONFIG + DECISION nodes
☐ Tool definitions (web_search, artifacts, web_fetch) → TOOL nodes

Any unchecked item = missing coverage. Add nodes for every unchecked item before finalizing.

---

### COVERAGE SELF-CHECK (MANDATORY — perform before writing final output)

1. Count non-blank lines in source (estimate is fine).
2. Count nodes in your output.
3. If nodes < (non-blank lines ÷ 4), you are under-extracting. Keep adding.
4. Walk the source top to bottom. For each paragraph, find its node in your output.
   If a paragraph has no corresponding node → add it now.
5. Common missed sections: tone rules, creative writing, language-following, refusal handling,
   knowledge cutoff policy, citation rules, artifact constraints, browser storage restriction.

**Do NOT output until step 4 passes for every paragraph.**
`;

// ─────────────────────────────────────────────────────────────────────────────
// Paragraph-indexed mode: split source into numbered paragraphs for large prompts.
// The LLM references paragraphs by §N instead of copying text — guarantees verbatim.
// ─────────────────────────────────────────────────────────────────────────────
export interface NumberedParagraph {
  index: number;       // 1-based
  text: string;        // the original paragraph text (trimmed)
  lineStart: number;   // 0-based line number in source
  lineEnd: number;     // 0-based line number (inclusive)
}

/**
 * Split a prompt into numbered paragraphs. A "paragraph" is one or more
 * consecutive non-blank lines separated by blank lines. XML tags on their
 * own line are kept as separate paragraphs. Bullet lists keep each bullet
 * as a separate paragraph for fine-grained node mapping.
 */
export function splitIntoParagraphs(prompt: string): NumberedParagraph[] {
  const lines = prompt.split('\n');
  const paragraphs: NumberedParagraph[] = [];
  let currentLines: string[] = [];
  let currentStart = -1;

  const flush = (endLine: number) => {
    if (currentLines.length === 0) return;
    const text = currentLines.join('\n').trim();
    if (text) {
      paragraphs.push({
        index: paragraphs.length + 1,
        text,
        lineStart: currentStart,
        lineEnd: endLine,
      });
    }
    currentLines = [];
    currentStart = -1;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line → flush current paragraph
    if (!trimmed) {
      flush(i - 1);
      continue;
    }

    // Bullet/list item starts a new paragraph (for fine-grained mapping)
    if (/^[-*•]\s/.test(trimmed) || /^\d+[.)]\s/.test(trimmed)) {
      flush(i - 1);
      currentStart = i;
      currentLines = [line];
      flush(i);
      continue;
    }

    // XML opening/closing tags on their own line → separate paragraph
    if (/^<\/?[a-zA-Z_][\w-]*[^>]*>\s*$/.test(trimmed)) {
      flush(i - 1);
      currentStart = i;
      currentLines = [line];
      flush(i);
      continue;
    }

    // Section headings (# or ##) → separate paragraph
    if (/^#{1,6}\s/.test(trimmed)) {
      flush(i - 1);
      currentStart = i;
      currentLines = [line];
      flush(i);
      continue;
    }

    // Normal line → accumulate
    if (currentStart === -1) currentStart = i;
    currentLines.push(line);
  }
  flush(lines.length - 1);

  return paragraphs;
}

/**
 * Build the numbered paragraph text to send to the LLM.
 * Format: §1: "The assistant is Claude, created by Anthropic."
 */
function buildNumberedPrompt(paragraphs: NumberedParagraph[]): string {
  return paragraphs.map(p => `§${p.index}: ${JSON.stringify(p.text)}`).join('\n');
}

/**
 * System prompt supplement for paragraph-indexed mode.
 * Replaces the large-prompt supplement when paragraph indexing is active.
 */
const PFG_PARAGRAPH_INDEX_SUPPLEMENT = `

---

## PARAGRAPH-INDEXED MODE (ACTIVE — source has been pre-split)

The source document has been split into numbered paragraphs (§1, §2, §3, ...).
Each paragraph is shown as: §N: "paragraph text"

### HOW TO USE PARAGRAPH REFERENCES

Instead of copying text into logic_snippet, use paragraph references:

- **Single paragraph**: set logic_snippet to \`"§3"\` (just the reference)
- **Multiple paragraphs for one node**: set logic_snippet to \`"§3,§4,§5"\` (comma-separated)
- **Range**: set logic_snippet to \`"§3-§7"\` (inclusive range)

The system will automatically replace these references with the actual source text after generation.
This guarantees 100% verbatim fidelity — you never need to copy text.

### CRITICAL RULES FOR PARAGRAPH-INDEXED MODE

1. **Every paragraph (§N) must appear in at least one node's logic_snippet.** Do not skip any.
2. **Node types still follow the same rules**: DECISION for conditions, RULE for constraints, PERSONA for traits, etc.
3. **Edges still required**: connect nodes as in normal mode.
4. **The label field should be a SHORT human-readable summary** (2-5 words), NOT a paragraph reference.
5. **One node per paragraph is the default.** Only combine paragraphs (§3,§4) if they are truly one logical unit.
6. XML tag lines (like \`<behavior_instructions>\`) that are standalone → GROUP node.
7. **Section headings** (lines starting with #) → GROUP node or use as source_section label.

### NODE TYPE ASSIGNMENT (same as base rules, but now by paragraph content)

Read each §N's content and assign:
- "If [condition]..." → DECISION + ACTION
- "[Agent] always/never/must..." → RULE
- "[Agent] is [trait]" → PERSONA
- Tool definition / JSON → TOOL
- URL / external resource → REFERENCE
- Settings / configuration → CONFIG
- Safety / content policy → GUARD

### COVERAGE GUARANTEE

Since every paragraph is numbered, coverage is trivially verifiable:
- Total paragraphs = N
- Every §1 through §N must appear in at least one node
- If any §K is missing from your output, add a node for it

**Do NOT output until every §K from §1 to §N is assigned to at least one node.**

### WIRING RULES (CRITICAL — same as base, restated for this mode)

**Annotation nodes (RULE, GUARD, PERSONA) use a TWO-EDGE pattern: START → annotation → DECISION.**
- Every annotation node needs BOTH an incoming edge (from START) AND an outgoing edge (to first DECISION/ACTION).
- START → GUARD/RULE/PERSONA (label "Applies to Agent" / "Defines Role")
- GUARD/RULE/PERSONA → first DECISION or ACTION in main flow (label "Applies to Agent" / "Governs")
- START MUST have ZERO incoming edges. NEVER wire anything → START.
- WRONG: GUARD with only outgoing edge, no incoming (unreachable island).
- WRONG: RULE → START (illegal back-edge).
- CORRECT: START → GUARD "Compliance" → DECISION "Request Type?".
`;

/**
 * Resolve §N references in logic_snippet fields back to actual source text.
 * Supports: "§3", "§3,§4,§5", "§3-§7", and mixed "§1,§3-§5,§8".
 * Mutates the parsed JSON in place (before adaptPfgJsonToAgentConfig).
 */
function resolveParagraphReferences(parsed: any, paragraphs: NumberedParagraph[]): void {
  const paraMap = new Map(paragraphs.map(p => [p.index, p.text]));

  function resolveSnippet(snippet: string): string {
    if (!snippet) return snippet;
    // Check if the snippet looks like a §reference (starts with § or is only §refs)
    const trimmed = snippet.trim();
    if (!trimmed.startsWith('§') && !trimmed.includes('§')) return snippet;

    // Parse references: §3, §3-§7, §1,§3-§5,§8
    const parts = trimmed.split(',').map(s => s.trim());
    const resolvedTexts: string[] = [];

    for (const part of parts) {
      const rangeMatch = part.match(/^§(\d+)\s*-\s*§(\d+)$/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = parseInt(rangeMatch[2], 10);
        for (let i = start; i <= end; i++) {
          const text = paraMap.get(i);
          if (text) resolvedTexts.push(text);
        }
      } else {
        const singleMatch = part.match(/^§(\d+)$/);
        if (singleMatch) {
          const text = paraMap.get(parseInt(singleMatch[1], 10));
          if (text) resolvedTexts.push(text);
        } else {
          // Not a §reference — keep as-is (LLM may have mixed text with refs)
          resolvedTexts.push(part);
        }
      }
    }

    return resolvedTexts.length > 0 ? resolvedTexts.join('\n') : snippet;
  }

  // Walk the parsed JSON and resolve all logic_snippet fields
  const graphData = parsed?.graph ?? parsed ?? {};
  const nodes: any[] = graphData.nodes ?? [];
  for (const node of nodes) {
    const data = node.data ?? node;
    if (data.logic_snippet) {
      data.logic_snippet = resolveSnippet(data.logic_snippet);
    }
    // Also handle compact tuple format where logic_snippet is at index 3
    if (Array.isArray(node) && typeof node[3] === 'string') {
      node[3] = resolveSnippet(node[3]);
    }
  }
}

// ENHANCED_EDGE_RULES content has been absorbed into PFG_SYSTEM_PROMPT Section 5 (Edge Rules).
const ENHANCED_EDGE_RULES = ``;

// DISABLE_OUTCOME_CHAINS removed — outcome chain decomposition no longer in base prompt.
// The structuredOutcomeChains setting now only controls post-parse autoInjectLoggingNodes.
const DISABLE_OUTCOME_CHAINS = ``;

// ─────────────────────────────────────────────────────────────────────────────
// Node type mapping: prompt-flow-graph types → Project_graph NodeType
// ─────────────────────────────────────────────────────────────────────────────
export const PFG_TYPE_MAP: Record<string, NodeType> = {
  // Canonical types (match visual node type names)
  start: 'START',
  end: 'END',
  input: 'INPUT',
  decision: 'DECISION',
  action: 'ACTION',
  tool: 'TOOL',
  rule: 'RULE',
  step: 'STEP',
  option: 'OPTION',
  agent: 'AGENT',
  reference: 'REFERENCE',
  config: 'CONFIG',
  trigger: 'TRIGGER',
  condition: 'CONDITION',
  task: 'TASK',
  persona: 'PERSONA',
  memory: 'MEMORY',
  handoff: 'HANDOFF',
  guard: 'GUARD',
  resolution: 'RESOLUTION',
  logging: 'LOGGING',
  group: 'GROUP',
  // Skill type — treated identically to TOOL
  skill: 'TOOL',
  // Legacy aliases — kept for backward compatibility with old PFG output
  tool_call: 'TOOL',
  service: 'AGENT',
  hook: 'TRIGGER',
  loop: 'TASK',
  escalation: 'HANDOFF',
  error: 'GUARD',
};

export function mapPfgType(pfgType: string): NodeType {
  return PFG_TYPE_MAP[pfgType] ?? 'TASK';
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-processing: edge cleanup.
// 1. Removes RESOLUTION → RESOLUTION edges (resolutions are terminal outcomes)
// 2. Deduplicates edges with the same source → target pair
// ─────────────────────────────────────────────────────────────────────────────
export function cleanupEdges(
  nodes: NodeData[],
  connections: Connection[]
): Connection[] {
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  const cleaned: Connection[] = [];
  const seen = new Set<string>();

  for (const conn of connections) {
    const sourceNode = nodeById.get(conn.source);
    const targetNode = nodeById.get(conn.target);

    // Block END → anything (END nodes have no outgoing edges)
    if (sourceNode && sourceNode.type === 'END') {
      continue;
    }

    // Block RESOLUTION → RESOLUTION chains (duplicate terminals)
    if (sourceNode && targetNode &&
      sourceNode.type === 'RESOLUTION' && targetNode.type === 'RESOLUTION') {
      continue;
    }

    // Deduplicate: same source → target pair
    const key = `${conn.source}→${conn.target}`;
    if (seen.has(key)) continue;
    seen.add(key);

    cleaned.push(conn);
  }

  return cleaned;
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-processing: strip fabricated logicSnippets from END nodes.
// END nodes should have empty logicSnippets. If the LLM fabricated text that
// doesn't exist in the original prompt, clear it to maintain verbatim fidelity.
// ─────────────────────────────────────────────────────────────────────────────
export function cleanupEndNodeSnippets(
  nodes: NodeData[],
  originalPrompt: string
): NodeData[] {
  return nodes.map(node => {
    if (node.type !== 'END') return node;

    const snippet = (node.config as any)?.logicSnippet;
    if (!snippet || snippet.length === 0) return node;

    // Check if the snippet exists verbatim in the original prompt
    if (originalPrompt.includes(snippet)) return node;

    // Fabricated — strip it
    return {
      ...node,
      config: {
        ...node.config,
        logicSnippet: '',
        origSnippet: '',
      },
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-processing: auto-wire disconnected right-column nodes.
// Scans for RULE, CONFIG, and PERSONA nodes with no outgoing edges and
// generates "Governs" / "Defines" / "Applies to Agent" edges from metadata.
//
// IMPORTANT — DAG invariant:
// Annotation nodes (RULE, GUARD, CONFIG, PERSONA, etc.) must NEVER point TO
// the START node as their edge target. Dagre interprets an edge A→B as "A
// ranks above (or at the same level as) B". Pointing back to START forces
// Dagre to place the annotation *above* START, creating a massive fan of nodes
// at the top and making the graph appear completely broken.
//
// Correct pattern: START → annotation → firstMainFlowNode
// (Two edges: one incoming from START, one outgoing to the main flow.)
// ─────────────────────────────────────────────────────────────────────────────
export function autoWireDisconnectedNodes(
  nodes: NodeData[],
  connections: Connection[]
): Connection[] {
  const RIGHT_COLUMN_TYPES = new Set(['RULE', 'TOOL', 'CONFIG', 'MEMORY', 'GUARD', 'REFERENCE', 'PERSONA', 'TRIGGER']);
  const FLOW_TYPES = new Set(['STEP', 'DECISION', 'ACTION', 'CONDITION', 'GROUP', 'OPTION', 'TASK', 'AGENT', 'RESOLUTION']);

  // Build set of nodes that already have outgoing / incoming edges
  const hasOutgoing = new Set<string>();
  const hasIncoming = new Set<string>();
  for (const conn of connections) {
    hasOutgoing.add(conn.source);
    hasIncoming.add(conn.target);
  }

  // Find the START node
  const startNode = nodes.find(n => n.type === 'START');
  const startId = startNode?.id;

  // Find the first main-flow node that START already directly points to.
  // This is used as the downstream leg for the two-edge annotation pattern:
  //   START → annotation → firstMainFlowId
  // Falling back to the lowest-order center flow node if nothing is directly
  // connected from START.
  const startOutgoing = connections.filter(c => c.source === startId).map(c => c.target);
  const firstMainFlowId: string | undefined = (() => {
    // Priority 1: center-column flow node directly reachable from START
    for (const tid of startOutgoing) {
      const t = nodes.find(n => n.id === tid);
      if (t && FLOW_TYPES.has(t.type)) return t.id;
    }
    // Priority 2: any center-column flow node sorted by order
    const centerFlow = nodes
      .filter(n => FLOW_TYPES.has(n.type))
      .sort((a, b) => ((a.config as any)?.order ?? 0) - ((b.config as any)?.order ?? 0));
    return centerFlow[0]?.id;
  })();

  // Build lookup maps
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const centerNodes = nodes.filter(n => {
    const col = (n.config as any)?.column;
    return col === 'center' || (!col && !RIGHT_COLUMN_TYPES.has(n.type) && n.type !== 'INPUT');
  });

  // Find disconnected right-column nodes (excluding headings with sourceFormat "heading")
  const disconnected = nodes.filter(n => {
    if (!RIGHT_COLUMN_TYPES.has(n.type) && n.type !== 'PERSONA') return false;
    if (hasOutgoing.has(n.id)) return false;
    // Skip heading nodes — they are visual grouping labels
    if ((n.config as any)?.sourceFormat === 'heading') return false;
    return true;
  });

  if (disconnected.length === 0) return connections;

  const newEdges: Connection[] = [];
  // Track which START → annotation edges we've already emitted (avoid dupes)
  const emittedFromStart = new Set<string>();
  let edgeCounter = connections.length + 100;

  // Helper: create the two-edge pattern START → annotation → target
  // Only adds the START → annotation leg if START doesn't already point to this node.
  function wireAnnotationGlobal(annotId: string, downstreamId: string | undefined, incomingLabel: string, outgoingLabel: string) {
    // Leg 1: START → annotation (only if not already connected)
    if (startId && !hasIncoming.has(annotId) && !emittedFromStart.has(annotId)) {
      newEdges.push({
        id: `auto-e${edgeCounter++}`,
        source: startId,
        target: annotId,
        condition: incomingLabel,
      });
      emittedFromStart.add(annotId);
    }
    // Leg 2: annotation → downstream flow node
    if (downstreamId && downstreamId !== annotId) {
      newEdges.push({
        id: `auto-e${edgeCounter++}`,
        source: annotId,
        target: downstreamId,
        condition: outgoingLabel,
      });
    }
  }

  for (const node of disconnected) {
    const ruleScope = (node.config as any)?.ruleScope;
    const appliesTo = (node.config as any)?.appliesTo;

    // ── RULE nodes ──────────────────────────────────────────────────────
    if (node.type === 'RULE') {
      // Special case: logging/audit global rules — wire to LOGGING nodes
      const snippetLower = ((node.config as any)?.logicSnippet ?? '').toLowerCase();
      const isLoggingRule = ruleScope === 'global' &&
        (snippetLower.includes('log') || snippetLower.includes('audit') || snippetLower.includes('record'));

      if (isLoggingRule) {
        const loggingNodes = nodes.filter(n => n.type === 'LOGGING');
        if (loggingNodes.length > 0) {
          // RULE → every LOGGING node (no START leg — rules wire forward, not backward)
          for (const loggingNode of loggingNodes) {
            newEdges.push({
              id: `auto-e${edgeCounter++}`,
              source: node.id,
              target: loggingNode.id,
              condition: 'Governs',
            });
          }
        } else if (firstMainFlowId) {
          newEdges.push({
            id: `auto-e${edgeCounter++}`,
            source: node.id,
            target: firstMainFlowId,
            condition: 'Applies to Agent',
          });
        }
      } else if (ruleScope === 'global') {
        // RULE → first main flow node (no START leg)
        if (firstMainFlowId) {
          newEdges.push({
            id: `auto-e${edgeCounter++}`,
            source: node.id,
            target: firstMainFlowId,
            condition: 'Applies to Agent',
          });
        }
      } else if (ruleScope === 'scoped' && Array.isArray(appliesTo)) {
        // Scoped rules — each node in appliesTo (no START leg)
        let wiredAny = false;
        for (const targetRef of appliesTo) {
          let targetId: string | undefined;

          // Direct ID match
          if (nodeById.has(targetRef)) {
            targetId = targetRef;
          } else {
            // Try to find by order number (e.g., "n42" → order 42)
            const orderMatch = targetRef.match(/^n(\d+)$/);
            if (orderMatch) {
              const orderNum = parseInt(orderMatch[1], 10);
              const matchByOrder = nodes.find(n => (n.config as any)?.order === orderNum);
              if (matchByOrder) targetId = matchByOrder.id;
            }
          }

          // Fallback: find center nodes in same sourceSection
          if (!targetId) {
            const section = (node.config as any)?.sourceSection;
            if (section) {
              const sectionMatch = centerNodes.find(
                n => (n.config as any)?.sourceSection === section
              );
              if (sectionMatch) targetId = sectionMatch.id;
            }
          }

          if (targetId && targetId !== node.id) {
            newEdges.push({
              id: `auto-e${edgeCounter++}`,
              source: node.id,
              target: targetId,
              condition: 'Governs',
            });
            wiredAny = true;
          }
        }
        // If nothing resolved, wire to first flow node
        if (!wiredAny && firstMainFlowId) {
          newEdges.push({
            id: `auto-e${edgeCounter++}`,
            source: node.id,
            target: firstMainFlowId,
            condition: 'Applies to Agent',
          });
        }
      } else if (ruleScope === 'scoped' && appliesTo && !Array.isArray(appliesTo)) {
        // Unresolvable or "all" scoped rule — wire to first flow node
        if (firstMainFlowId) {
          newEdges.push({
            id: `auto-e${edgeCounter++}`,
            source: node.id,
            target: firstMainFlowId,
            condition: appliesTo === 'all' ? 'Applies to Agent' : 'Governs',
          });
        }
      } else {
        // No ruleScope fallback — wire forward to first flow node
        if (firstMainFlowId) {
          newEdges.push({
            id: `auto-e${edgeCounter++}`,
            source: node.id,
            target: firstMainFlowId,
            condition: 'Applies to Agent',
          });
        }
      }
      continue;
    }

    // ── CONFIG nodes (generic metadata-based matching) ─────────────────
    if (node.type === 'CONFIG') {
      let matched = false;

      // Strategy 1: appliesTo refs (same as RULE nodes)
      const configAppliesTo = (node.config as any)?.appliesTo;
      if (configAppliesTo) {
        const refs = Array.isArray(configAppliesTo) ? configAppliesTo : [configAppliesTo];
        for (const ref of refs) {
          if (ref === 'all') continue;
          let targetId: string | undefined;
          if (nodeById.has(ref)) {
            targetId = ref;
          } else {
            const orderMatch = ref.match(/^n(\d+)$/);
            if (orderMatch) {
              const orderNum = parseInt(orderMatch[1], 10);
              const matchByOrder = nodes.find(n => (n.config as any)?.order === orderNum);
              if (matchByOrder) targetId = matchByOrder.id;
            }
          }
          if (targetId && targetId !== node.id) {
            if (!hasIncoming.has(node.id) && !emittedFromStart.has(node.id) && startId) {
              newEdges.push({
                id: `auto-e${edgeCounter++}`,
                source: startId,
                target: node.id,
                condition: 'Agent Configuration',
              });
              emittedFromStart.add(node.id);
            }
            newEdges.push({
              id: `auto-e${edgeCounter++}`,
              source: node.id,
              target: targetId,
              condition: 'Defines',
            });
            matched = true;
          }
        }
      }

      // Strategy 2: same sourceSection as a center node
      if (!matched) {
        const section = (node.config as any)?.sourceSection;
        if (section) {
          const sectionMatches = centerNodes.filter(
            n => (n.config as any)?.sourceSection === section
          );
          if (sectionMatches.length > 0) {
            wireAnnotationGlobal(node.id, sectionMatches[0].id, 'Agent Configuration', 'Defines');
            matched = true;
          }
        }
      }

      // Strategy 3: fallback — two-edge pattern to first main flow node
      if (!matched) {
        wireAnnotationGlobal(node.id, firstMainFlowId, 'Agent Configuration', 'Agent Configuration');
      }
      continue;
    }

    // ── PERSONA nodes ───────────────────────────────────────────────────
    if (node.type === 'PERSONA') {
      const scope = (node.config as any)?.personaScope;
      const outLabel = scope === 'response' ? 'Response Style' : 'Defines Agent Role';
      // PERSONA → first flow node (no START leg — personas define outgoing behavior)
      if (firstMainFlowId) {
        newEdges.push({
          id: `auto-e${edgeCounter++}`,
          source: node.id,
          target: firstMainFlowId,
          condition: outLabel,
        });
      }
      continue;
    }

    // ── GUARD nodes ─────────────────────────────────────────────────────
    if (node.type === 'GUARD') {
      const guardScope = (node.config as any)?.ruleScope;
      if (guardScope === 'scoped' && Array.isArray(appliesTo)) {
        let wiredAny = false;
        for (const targetRef of appliesTo) {
          let targetId: string | undefined;
          if (nodeById.has(targetRef)) {
            targetId = targetRef;
          } else {
            const orderMatch = targetRef.match(/^n(\d+)$/);
            if (orderMatch) {
              const orderNum = parseInt(orderMatch[1], 10);
              const matchByOrder = nodes.find(n => (n.config as any)?.order === orderNum);
              if (matchByOrder) targetId = matchByOrder.id;
            }
          }
          if (targetId && targetId !== node.id) {
            newEdges.push({
              id: `auto-e${edgeCounter++}`,
              source: node.id,
              target: targetId,
              condition: 'Constrains',
            });
            wiredAny = true;
          }
        }
        if (!wiredAny && firstMainFlowId) {
          newEdges.push({
            id: `auto-e${edgeCounter++}`,
            source: node.id,
            target: firstMainFlowId,
            condition: 'Constrains',
          });
        }
      } else if (firstMainFlowId) {
        // Global guard — constrains the first main flow node directly
        newEdges.push({
          id: `auto-e${edgeCounter++}`,
          source: node.id,
          target: firstMainFlowId,
          condition: 'Constrains',
        });
      }
      continue;
    }

    // ── Fallback: any other disconnected right-column node ─────────────
    // Use two-edge pattern instead of wiring back to START
    wireAnnotationGlobal(node.id, firstMainFlowId, 'Applies to Agent', 'Applies to Agent');
  }

  return [...connections, ...newEdges];
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-processing: auto-inject missing LOGGING nodes after RESOLUTION nodes.
// When the original prompt mentions logging/auditing and a RESOLUTION node
// has no LOGGING successor, inject a LOGGING node between RESOLUTION and
// its successor (END or next node).
// ─────────────────────────────────────────────────────────────────────────────
export function autoInjectLoggingNodes(
  nodes: NodeData[],
  connections: Connection[],
  originalPrompt: string
): { nodes: NodeData[]; connections: Connection[] } {
  // Check if prompt mentions logging
  const lowerPrompt = originalPrompt.toLowerCase();
  const hasLoggingSection = /\b(log|audit|record|must be logged|logging)\b/.test(lowerPrompt);
  if (!hasLoggingSection) return { nodes, connections };

  // Detect the logging tool name from the prompt (e.g., "RefundLedger", "AuditDB")
  const toolMatch = originalPrompt.match(/log(?:ged)?\s+to\s+(\w+)/i);
  const loggingTool = toolMatch ? toolMatch[1] : null;

  // Build adjacency: for each node, find outgoing connections
  const outgoing = new Map<string, Connection[]>();
  for (const conn of connections) {
    if (!outgoing.has(conn.source)) outgoing.set(conn.source, []);
    outgoing.get(conn.source)!.push(conn);
  }

  const nodeById = new Map(nodes.map(n => [n.id, n]));

  // Find nodes that lead to END/HANDOFF without a LOGGING node in between.
  // Covers: RESOLUTION, ACTION, DECISION, CONDITION nodes → END/HANDOFF paths.
  const TERMINAL_TYPES = new Set(['END', 'HANDOFF']);
  const CANDIDATE_TYPES = new Set(['RESOLUTION', 'ACTION', 'DECISION', 'CONDITION']);

  const newNodes: NodeData[] = [];
  const newConnections: Connection[] = [];
  const connectionsToRemove = new Set<string>();
  let counter = 0;

  for (const conn of connections) {
    const sourceNode = nodeById.get(conn.source);
    const targetNode = nodeById.get(conn.target);
    if (!sourceNode || !targetNode) continue;

    // Only handle edges from candidate types → terminal types
    if (!CANDIDATE_TYPES.has(sourceNode.type)) continue;
    if (!TERMINAL_TYPES.has(targetNode.type)) continue;

    // Check if source already has a LOGGING successor on any path
    const sourceOutgoing = outgoing.get(sourceNode.id) ?? [];
    const hasLogging = sourceOutgoing.some(c => {
      const t = nodeById.get(c.target);
      return t?.type === 'LOGGING';
    });
    if (hasLogging) continue;

    // Create LOGGING node
    counter++;
    const loggingId = `auto-log-${counter}-${sourceNode.id.slice(-8)}`;
    const sourceLabel = sourceNode.label || 'Decision';

    const loggingNode: NodeData = {
      id: loggingId,
      type: 'LOGGING',
      label: `Log ${sourceLabel}`,
      description: `Logs the ${sourceLabel.toLowerCase()} decision.`,
      config: {
        logicSnippet: loggingTool
          ? `Log to ${loggingTool} with: order_id, decision, rule_applied, timestamp.`
          : `Log decision to audit system.`,
        sourceSection: 'Logging',
        sourceFormat: 'bulleted_list',
        order: (sourceNode.config as any)?.order ?? 0,
        tool: loggingTool,
        value: null,
        outcome: null,
        pfgType: 'logging',
        inputRequired: null,
        ruleScope: null,
        appliesTo: null,
        personaScope: null,
        column: 'center',
        branchGroup: null,
      },
      position: {
        x: sourceNode.position.x,
        y: sourceNode.position.y + 200,
      },
    };
    newNodes.push(loggingNode);
    // Register so subsequent edges from the same source see the LOGGING node
    nodeById.set(loggingId, loggingNode);

    // Rewire: remove source → terminal, add source → LOGGING → terminal
    connectionsToRemove.add(conn.id);
    newConnections.push({
      id: `auto-log-e${counter}a`,
      source: sourceNode.id,
      target: loggingId,
      condition: `Log ${sourceLabel}`,
    });
    newConnections.push({
      id: `auto-log-e${counter}b`,
      source: loggingId,
      target: targetNode.id,
      condition: conn.condition ? `${conn.condition}` : 'Logged',
    });
  }

  if (newNodes.length === 0) return { nodes, connections };

  return {
    nodes: [...nodes, ...newNodes],
    connections: [
      ...connections.filter(c => !connectionsToRemove.has(c.id)),
      ...newConnections,
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Expand abbreviated JSON Compact keys → full PFG keys
// Handles: metadata arrays, node tuples, integer IDs, edge tuples,
//          global rule tuples, input tuples, value enums, and auto-fill.
// ─────────────────────────────────────────────────────────────────────────────
export function expandCompactKeys(obj: any): any {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(expandCompactKeys);

  const TOP_MAP: Record<string, string> = { m: 'metadata', g: 'graph' };
  const META_MAP: Record<string, string> = {
    aid: 'agent_id', p: 'persona', t: 'tone', v: 'version', d: 'description',
    mdl: 'model', al: 'aliases', sk: 'skills', at: 'allowed_tools', hk: 'hooks',
    sdf: 'source_doc_format',
  };
  const GRAPH_MAP: Record<string, string> = {
    n: 'nodes', e: 'edges', cf: 'conflicts', gr: 'global_rules', inp: 'inputs',
  };
  const NODE_MAP: Record<string, string> = { t: 'type', pos: 'position', dt: 'data' };
  const DATA_MAP: Record<string, string> = {
    l: 'label', d: 'description', ls: 'logic_snippet', tl: 'tool', val: 'value',
    oc: 'outcome', ss: 'source_section', sf: 'source_format', o: 'order',
    ir: 'input_required', rs: 'rule_scope', ap: 'applies_to', ps: 'persona_scope',
    col: 'column', bg: 'branch_group', os: 'orig_snippet',
  };
  const EDGE_MAP: Record<string, string> = { s: 'source', tg: 'target', l: 'label', dt: 'data' };
  const EDGE_DATA_MAP: Record<string, string> = { c: 'condition', a: 'animation' };
  const GR_MAP: Record<string, string> = { l: 'label', rn: 'rule_nodes', ap: 'applies_to' };
  const INPUT_MAP: Record<string, string> = { nid: 'node_id', rq: 'required' };

  const TYPE_ENUM: Record<string, string> = {
    a: 'action', d: 'decision', s: 'step', r: 'resolution', t: 'tool',
    i: 'input', k: 'skill', ag: 'agent', st: 'start', e: 'end', h: 'handoff',
    c: 'condition', p: 'persona', ru: 'rule', cf: 'config', lg: 'logging', tr: 'trigger',
    g: 'guard', m: 'memory', ref: 'reference', o: 'option', ta: 'task', gr: 'group',
  };
  const SF_ENUM: Record<string, string> = { p: 'prose', h: 'heading', t: 'table', y: 'yaml' };
  const COL_ENUM: Record<string, string> = { l: 'left', c: 'center', r: 'right' };
  const RS_ENUM: Record<string, string> = { g: 'global', s: 'scoped' };

  // Helper: normalize an ID to string with "n" prefix
  function normalizeId(id: any): string {
    if (typeof id === 'number') return `n${id}`;
    const s = String(id);
    return s.startsWith('n') ? s : `n${s}`;
  }

  function remap(o: any, keyMap: Record<string, string>, childMaps?: Record<string, (v: any) => any>): any {
    if (o === null || o === undefined || typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(item => remap(item, keyMap, childMaps));
    const out: any = {};
    for (const [k, v] of Object.entries(o)) {
      const fullKey = keyMap[k] ?? k;
      out[fullKey] = childMaps?.[fullKey] ? childMaps[fullKey](v) : v;
    }
    return out;
  }

  // ── Layer 0: Remap top-level keys ──
  const top = remap(obj, TOP_MAP);

  // ── Layer 2 & 5: Metadata — flat array OR object ──
  if (Array.isArray(top.metadata)) {
    const arr = top.metadata;
    top.metadata = {
      agent_id: arr[0] ?? '',
      persona: arr[1] ?? '',
      tone: arr[2] ?? '',
      version: arr[3] ?? '1.0',
      description: arr[4] ?? '',
      source_doc_format: SF_ENUM[arr[5]] ?? arr[5] ?? 'plain_markdown',
      model: null, aliases: [], skills: [], allowed_tools: [], hooks: [],
    };
  } else if (top.metadata) {
    top.metadata = remap(top.metadata, META_MAP);
    if (top.metadata.source_doc_format) {
      top.metadata.source_doc_format = SF_ENUM[top.metadata.source_doc_format] ?? top.metadata.source_doc_format;
    }
  }

  if (top.graph) {
    top.graph = remap(top.graph, GRAPH_MAP);

    // ── Layer 2 & 3: Nodes — tuple arrays OR objects ──
    if (Array.isArray(top.graph.nodes)) {
      top.graph.nodes = top.graph.nodes.map((node: any, idx: number) => {
        // Tuple format: [id, type, label, logic_snippet, tool?, outcome?, column?]
        if (Array.isArray(node)) {
          const typeCode = String(node[1] ?? 'a');
          // Enforce column algorithmically to prevent LLM hallucinations
          let col = 'center';
          const LEFT_TYPES = new Set(['i', 'p', 'input', 'persona']);
          const RIGHT_TYPES = new Set(['ru', 'cf', 'rule', 'config', 'g', 'guard', 'm', 'memory', 'ref', 'reference', 'tr', 'trigger']);

          if (LEFT_TYPES.has(typeCode)) col = 'left';
          else if (RIGHT_TYPES.has(typeCode)) col = 'right';

          return {
            id: normalizeId(node[0]),
            type: TYPE_ENUM[typeCode] ?? typeCode,
            position: { x: 0, y: 0 },
            data: {
              label: node[2] ?? `Node ${node[0]}`,
              description: '',
              logic_snippet: node[3] ?? '',
              tool: node[4] ?? null,
              value: null,
              outcome: node[5] ?? null,
              source_section: node[9] ?? '',
              source_format: 'prose',
              order: idx + 1,
              input_required: null,
              rule_scope: node[7] ? (RS_ENUM[node[7]] ?? node[7]) : null,
              applies_to: Array.isArray(node[8]) ? node[8].map(normalizeId) : (node[8] ?? null),
              persona_scope: null,
              column: col,
              branch_group: null,
              orig_snippet: node[3] ?? '',
            },
          };
        }

        // Object format (existing v1 compact or fallback)
        const expanded = remap(node, NODE_MAP);
        // Normalize ID
        if (expanded.id !== undefined) expanded.id = normalizeId(expanded.id);
        if (expanded.type) expanded.type = TYPE_ENUM[expanded.type] ?? expanded.type;
        if (Array.isArray(expanded.position)) {
          expanded.position = { x: expanded.position[0], y: expanded.position[1] };
        }
        if (!expanded.position) expanded.position = { x: 0, y: 0 };
        if (expanded.data) {
          expanded.data = remap(expanded.data, DATA_MAP);
          if (expanded.data.source_format) {
            expanded.data.source_format = SF_ENUM[expanded.data.source_format] ?? expanded.data.source_format;
          }
          if (expanded.data.column) {
            expanded.data.column = COL_ENUM[expanded.data.column] ?? expanded.data.column;
          }
          // Auto-fill dropped fields
          if (!expanded.data.order) expanded.data.order = idx + 1;
          if (!expanded.data.description) expanded.data.description = '';
          if (!expanded.data.source_section) expanded.data.source_section = '';
          if (!expanded.data.source_format) expanded.data.source_format = 'prose';
          if (!expanded.data.orig_snippet) expanded.data.orig_snippet = expanded.data.logic_snippet ?? '';
        }
        return expanded;
      });
    }

    // ── Layer 4 & 3: Edges — tuples with integer IDs ──
    if (Array.isArray(top.graph.edges)) {
      top.graph.edges = top.graph.edges.map((edge: any, idx: number) => {
        // Tuple format: [source, target, label, condition, animation]
        if (Array.isArray(edge)) {
          return {
            id: `e${idx + 1}`,
            source: normalizeId(edge[0]),
            target: normalizeId(edge[1]),
            label: edge[2] ?? undefined,
            data: (edge[3] || edge[4]) ? {
              condition: edge[3] ?? undefined,
              animation: edge[4] ?? undefined
            } : undefined
          };
        }
        const expanded = remap(edge, EDGE_MAP);
        if (expanded.source) expanded.source = normalizeId(expanded.source);
        if (expanded.target) expanded.target = normalizeId(expanded.target);
        if (expanded.data) expanded.data = remap(expanded.data, EDGE_DATA_MAP);
        return expanded;
      });
    }

    // ── Layer 6: Global rules — tuples OR objects ──
    if (Array.isArray(top.graph.global_rules)) {
      top.graph.global_rules = top.graph.global_rules.map((gr: any) => {
        // Tuple: [id, label, [node_ids], applies_to]
        if (Array.isArray(gr)) {
          return {
            id: gr[0] ?? 'gr1',
            label: gr[1] ?? '',
            rule_nodes: (gr[2] ?? []).map(normalizeId),
            applies_to: gr[3] ?? 'all',
          };
        }
        return remap(gr, GR_MAP);
      });
    }

    // ── Layer 6: Inputs — tuples OR objects ──
    if (Array.isArray(top.graph.inputs)) {
      top.graph.inputs = top.graph.inputs.map((inp: any) => {
        // Tuple: [node_id, required]
        if (Array.isArray(inp)) {
          return {
            node_id: normalizeId(inp[0]),
            required: inp[1] ?? true,
          };
        }
        return remap(inp, INPUT_MAP);
      });
    }
  }

  return top;
}

/** Dynamic coverage threshold based on prompt length */
export function getCoverageThreshold(nonBlankLineCount: number): number {
  if (nonBlankLineCount < 10) return 50;
  if (nonBlankLineCount <= 20) return 60;
  if (nonBlankLineCount <= 50) return 70;
  return 80;
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-parse: compute source coverage + verbatim snippet validation.
// Returns violation objects for uncovered source ranges and non-verbatim snippets.
// ─────────────────────────────────────────────────────────────────────────────
export function computeSourceCoverage(
  originalPrompt: string,
  nodes: NodeData[]
): Array<{ type: string; severity: string; message: string; lineRange?: [number, number]; nodeId?: string }> {
  const violations: Array<{ type: string; severity: string; message: string; lineRange?: [number, number]; nodeId?: string }> = [];
  const lines = originalPrompt.split('\n');
  const snippets = nodes
    .map(n => (n.config as any)?.logicSnippet ?? '')
    .filter((s: string) => s.length > 0);

  // --- Coverage gap detection ---
  // Build a single merged snippets string for O(1) per-line lookup instead of O(n*m).
  // Since snippets are verbatim substrings, any source line present in any snippet
  // will also appear in the merged string.
  const mergedSnippets = snippets.join('\n');
  const coveredLines = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.length < 4) continue; // skip blank/trivial lines
    if (mergedSnippets.includes(trimmed)) {
      coveredLines.add(i);
    }
  }

  // Find contiguous uncovered ranges
  const nonBlankLines = lines.map((l, i) => ({ i, blank: !l.trim() })).filter(x => !x.blank);
  let rangeStart = -1;
  let rangeEnd = -1;
  let rangeLen = 0;
  for (const { i } of nonBlankLines) {
    if (!coveredLines.has(i)) {
      if (rangeStart === -1) rangeStart = i;
      rangeEnd = i;
      rangeLen++;
    } else {
      if (rangeLen > 3) {
        violations.push({
          type: 'coverage_gap',
          severity: 'warning',
          message: `Lines ${rangeStart + 1}-${rangeEnd + 1} have no corresponding nodes`,
          lineRange: [rangeStart + 1, rangeEnd + 1],
        });
      }
      rangeStart = -1;
      rangeEnd = -1;
      rangeLen = 0;
    }
  }
  // Flush final range
  if (rangeLen > 3) {
    violations.push({
      type: 'coverage_gap',
      severity: 'warning',
      message: `Lines ${rangeStart + 1}-${rangeEnd + 1} have no corresponding nodes`,
      lineRange: [rangeStart + 1, rangeEnd + 1],
    });
  }

  // Overall coverage
  const totalNonBlank = nonBlankLines.length;
  const coverage = totalNonBlank > 0 ? (coveredLines.size / totalNonBlank) * 100 : 100;
  const threshold = getCoverageThreshold(totalNonBlank);
  if (coverage < threshold) {
    violations.push({
      type: 'low_coverage',
      severity: 'error',
      message: `Only ${Math.round(coverage)}% of source lines are represented in the graph (${coveredLines.size}/${totalNonBlank} non-blank lines, threshold: ${threshold}%)`,
    });
  }

  // --- Verbatim snippet validation ---
  for (const node of nodes) {
    const snippet = (node.config as any)?.logicSnippet;
    if (snippet && snippet.length > 0 && !originalPrompt.includes(snippet)) {
      violations.push({
        type: 'verbatim_violation',
        severity: 'warning',
        message: `Node "${node.label}" has a logic_snippet not found verbatim in source`,
        nodeId: node.id,
      });
    }
  }

  return violations;
}

export async function promptToGraph(
  prompt: string,
  options: PromptToGraphOptions,
  existingPositions?: Map<string, { x: number; y: number }>
): Promise<AgentConfig> {
  // Normalize JS-string-concatenation syntax so originalPrompt is always clean markdown
  prompt = normalizePromptText(prompt);

  const { apiKey, model = DEFAULT_GEMINI_MODEL } = options;

  const ai = new GoogleGenAI({ apiKey });
  const graphRules = getGraphRuleSettings();

  const outputFormat = options.outputFormat ?? graphRules.outputFormat ?? 'json';

  let raw = '';
  const promptId = prompt.substring(0, 40).replace(/\n/g, ' ');
  const isLargePrompt = prompt.length >= 10000;

  // Paragraph-indexed mode: for large prompts, pre-split into numbered §N paragraphs.
  // The LLM references by §N instead of copying text — guarantees verbatim by construction.
  // Auto-enabled for ≥10K chars; can be forced on/off via options.useParagraphIndexing.
  const shouldUseParagraphIndexing = options.useParagraphIndexing ?? isLargePrompt;
  const paragraphs = shouldUseParagraphIndexing ? splitIntoParagraphs(prompt) : null;
  const useParagraphIndexing = paragraphs !== null && paragraphs.length > 0;
  const userMessage = useParagraphIndexing ? buildNumberedPrompt(paragraphs) : prompt;

  const systemPromptVersion = useParagraphIndexing
    ? `paragraph-indexed (${paragraphs!.length} §paragraphs)`
    : isLargePrompt ? 'extended (large-prompt supplement active)' : 'base';
  console.log(`[PFG] Gemini API call STARTING — model: ${model}, format: ${outputFormat}, prompt: "${promptId}…"`);
  const maxOutTokens = outputFormat === 'json-compact' ? 16384 : isLargePrompt ? 65536 : 16384;
  console.log(`[PFG] System Prompt: ${systemPromptVersion} | user input: ${prompt.length.toLocaleString()} chars | maxOutputTokens: ${maxOutTokens} (format: ${outputFormat})`);
  const streamStartTime = Date.now();
  const stream = await ai.models.generateContentStream({
    model,
    config: {
      temperature: 0,
      topP: 0,
      // json-compact: 100 nodes ≈ 6K tokens — 16384 is plenty (5-6× headroom).
      // json/yaml: 100 nodes ≈ 30K tokens — Gemini default 8192 truncates mid-JSON for large prompts.
      maxOutputTokens: maxOutTokens,
      thinkingConfig: (model?.includes('gemini-2') ? { thinkingBudget: 0 } : { thinkingLevel: 'MINIMAL' }) as any,
      ...(outputFormat === 'json' || outputFormat === 'json-compact'
        ? { responseMimeType: 'application/json' }
        : {}),
      systemInstruction: (() => {
        let instruction = PFG_SYSTEM_PROMPT;
        if (useParagraphIndexing) {
          instruction += PFG_PARAGRAPH_INDEX_SUPPLEMENT;
        } else if (isLargePrompt) {
          instruction += PFG_LARGE_PROMPT_SUPPLEMENT;
        }
        if (graphRules.injectDAGRulesInPrompts) {
          instruction += '\n\n' + DAG_RULES_FOR_CREATION;
        }
        if (outputFormat === 'yaml') {
          instruction += '\n\n## Output Format Override: YAML\n\n' +
            'Output your response in YAML format instead of JSON.\n' +
            'Use standard YAML syntax with proper indentation (2 spaces).\n' +
            'Key rules:\n' +
            '- Use indentation for nesting, no braces or brackets\n' +
            '- Arrays use `- ` prefix for each item\n' +
            '- Strings with special characters (colons, commas, #) must be quoted\n' +
            '- Empty arrays: use `[]`\n' +
            '- null values: use `null` or `~`\n' +
            '- Raw text output only — no code fences, no preamble, no explanation.\n';
        } else if (outputFormat === 'json-compact') {
          instruction += '\n\n## Output Format Override: Compact JSON\n\n' +
            'CRITICAL: The 1:1 Logic Guarantee STILL APPLIES. Do NOT omit any nodes, edges, or logic. Do NOT summarize or merge branches.\n' +
            'Save tokens using ALL of these optimizations:\n\n' +
            '1. TOP STRUCTURE: `{"m":[...],"g":{"n":[...],"e":[...]}}`\n\n' +
            '2. METADATA as flat array:\n' +
            '`"m":[agent_id, persona, tone, version, description, source_doc_format]`\n' +
            'Example: `"m":["jira_bot","Jira Assistant","professional","1.0","Ticket management","p"]`\n' +
            'source_doc_format codes: `p` (prose), `h` (heading), `t` (table), `y` (yaml)\n\n' +
            '3. NODE TUPLES (each node is a flat array):\n' +
            '`[id, type, label, logic_snippet, tool, outcome, column, rule_scope, applies_to, source_section]`\n' +
            '- `id`: integer (1,2,3...) — NO "n" prefix, no quotes\n' +
            '- `type` codes: `a` (action), `d` (decision), `s` (step), `r` (resolution), `t` (tool), `i` (input), `k` (skill), `ag` (agent), `st` (start), `e` (end), `h` (handoff), `c` (condition), `p` (persona), `ru` (rule), `cf` (config), `lg` (logging), `tr` (trigger), `g` (guard), `m` (memory), `ref` (reference), `o` (option), `ta` (task)\n' +
            '- `tool`: only if node uses a tool, else omit\n' +
            '- `outcome`: only if resolution/end node, else omit\n' +
            '- `column`: REQUIRED — always include: `l` (left), `c` (center), `r` (right)\n' +
            '  - `l` = persona (agent scope), input nodes (sidebar)\n' +
            '  - `c` = all main flow nodes (start, decision, condition, action, tool, step, resolution, end, handoff, logging)\n' +
            '  - `r` = rule, config, guard, memory, reference, trigger nodes (sidebar)\n' +
            '- `rule_scope`: only for rule/guard nodes: `"g"` (global) or `"s"` (scoped), else omit\n' +
            '- `applies_to`: only for rule/guard nodes: array of target node IDs e.g. `[4,5]`, else omit\n' +
            '- `source_section`: the heading/section this node belongs to, e.g. `"Phase 1"`, else omit\n' +
            'Example: `[1,"st","Start Agent","System prompt entry",null,null,"c"]`\n' +
            'Example: `[5,"t","OrderLookup","Call OrderLookup","OrderLookup",null,"c"]`\n' +
            'Example: `[8,"ru","Validation","Never skip validation",null,null,"r","g",[4,5],"Input Handling"]`\n\n' +
            '4. EDGE TUPLES:\n' +
            '`[source_id, target_id, label, condition, animation]`\n' +
            'IDs are integers matching node IDs. Omit trailing nulls.\n' +
            'Example: `[1,2,"Next"]`\n\n' +
            '5. GLOBAL RULES as tuples (in `"gr"` array):\n' +
            '`[id, label, [node_ids...], applies_to]`\n' +
            'Example: `["gr1","Validation",[5,6],"all"]`\n\n' +
            '6. INPUTS as tuples (in `"inp"` array):\n' +
            '`[node_id, required]`\n' +
            'Example: `[3,true]`\n\n' +
            'FIELDS TO NEVER GENERATE (decoder auto-fills these):\n' +
            '- position/coordinates — auto-layout calculates\n' +
            '- order — inferred from array index\n' +
            '- orig_snippet — copied from logic_snippet\n' +
            '- description (in node data) — defaults to empty\n\n' +
            'NODE ORDERING — CRITICAL:\n' +
            '- Output center-column nodes in TOP-TO-BOTTOM logical flow order.\n' +
            '- START node FIRST, END node(s) LAST in the array.\n' +
            '- Decision → branches → merge-back → next step.\n' +
            '- Left/right sidebar nodes can go before or after center nodes.\n\n' +
            'FINAL RULES:\n' +
            '- NO whitespace or newlines. Single line of minified JSON.\n' +
            '- Omit empty arrays, null fields.\n' +
            '- Every branch, tool, condition, and rule from the prompt MUST appear as a node.\n' +
            '\n\n' +
            'SNIPPET VERBATIM RULE (ABSOLUTE — no exceptions in compact mode):\n' +
            'The "compact" in json-compact refers ONLY to the JSON structure keys and node tuple format.\n' +
            'It does NOT mean you can compress, paraphrase, or shorten logic_snippet content.\n' +
            'logic_snippet is ALWAYS the verbatim source text — copy-paste, character for character.\n' +
            '- WRONG: source says "it clarifies the situation" → snippet says "Clarifies the situation"\n' +
            '- WRONG: source says "Claude is always sensitive to human suffering" → snippet says "Always sensitive to human suffering"\n' +
            '- WRONG: source says "Claude avoids peppering the human with questions" → snippet says "Avoids peppering with questions"\n' +
            '- CORRECT: snippet = the exact sentence(s) from the source, unchanged, including subject and punctuation.\n' +
            '- If the source text for a node is under 500 characters, include it VERBATIM — letter for letter.\n' +
            '- If the source text exceeds 500 characters, include at minimum the first 400 characters verbatim.\n' +
            '- NEVER rephrase, summarize, or change the subject of a sentence. Copy. Do not write.\n' +
            '- Every logic_snippet MUST pass: originalPrompt.includes(logic_snippet) === true\n\n' +
            'REFERENCE EXTRACTION (NON-NEGOTIABLE):\n' +
            '- Every URL (http://, https://) in the source MUST produce its own REFERENCE node.\n' +
            '- Every named external document (e.g., "TypeScript Guide", "Evaluation Guide") MUST produce a REFERENCE node.\n' +
            '- A "Documentation" or "Reference" section in the source MUST produce one REFERENCE node per distinct resource listed.\n' +
            '- Do NOT skip references just because they appear in a list format.\n' +
            '- When resources have loading-priority directives ("Load First", "Load During Phase X"), create CONFIG nodes for timing groups.\n' +
            '- REFERENCE node logic_snippets MUST include the full description of what the resource contains, not just the URL.\n\n' +
            'GROUP vs STEP vs GUARD (NON-NEGOTIABLE):\n' +
            '- Numbered phases (Phase 1, Phase 2...) and top-level section headings that contain child steps MUST use type `gr` (group), UNLESS the section defines validation/safety gates, in which case use `g` (guard).\n' +
            '- GROUP nodes have brief logic_snippet (just the heading). Child content goes in child STEP/ACTION nodes.\n' +
            '- STEP is for individual procedural instructions WITHIN a phase, not for the phase heading itself.\n\n' +
            'EDGE LABEL QUALITY (NON-NEGOTIABLE):\n' +
            '- NEVER use generic labels: "Next", "Then", "Continue", "Proceed".\n' +
            '- Sequential edges MUST describe the transition: "Research complete", "Stack selected", "Structure ready".\n' +
            '- Phase transitions: "Start Phase 2", "Begin Testing" are acceptable.\n\n' +
            'END NODE RULES:\n' +
            '- END node logic_snippet MUST be empty string "". NEVER fabricate or infer text.\n\n' +
            'CONFIG DETECTION:\n' +
            '- "Recommended stack", "Settings", "Configuration" blocks → CONFIG node (type `cf`), not STEP.\n' +
            '- Key-value patterns (Language: X, Transport: Y) → CONFIG node.\n\n' +
            'CLI COMMAND EXTRACTION:\n' +
            '- Every CLI command in backticks (npm run build, npx ..., python -m ...) → TOOL node (type `t`).\n' +
            '- Wire TOOL → the step that uses its result.\n';
        }
        return instruction;
      })(),
    } as any,
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
  });

  console.log(`[PFG] Gemini stream OPENED — "${promptId}…" (${Date.now() - streamStartTime}ms to connect)`);
  let chunkCount = 0;
  for await (const chunk of stream) {
    chunkCount++;
    if (options.signal?.aborted) {
      throw new DOMException('Generation aborted', 'AbortError');
    }
    const text = chunk.text ?? '';
    options.onChunk?.(text);
    raw += text;

    // Extract token usage from usageMetadata (populated on last chunk by Gemini API)
    const chunkAny = chunk as any;
    const usage = chunkAny.usageMetadata;
    if (usage) {
      if (options.onUsage) {
        options.onUsage({
          promptTokens: usage.promptTokenCount,
          responseTokens: usage.candidatesTokenCount,
          thoughtsTokens: usage.thoughtsTokenCount,
          totalTokens: usage.totalTokenCount,
        });
      }
    }
  }

  console.log(`[PFG] Gemini stream COMPLETE — "${promptId}…" (${Date.now() - streamStartTime}ms total, ${chunkCount} chunks, ${raw.length} chars output | system: ${systemPromptVersion}, input: ${prompt.length.toLocaleString()} chars)`);

  let parsed: any;
  if (outputFormat === 'yaml') {
    // YAML mode: try YAML decode first, fall back to JSON
    try {
      // Strip code fences if present
      let yamlText = raw.trim();
      if (yamlText.startsWith('```')) {
        yamlText = yamlText.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
      }
      // Fix unquoted colons in values: `key: value: more` → `key: "value: more"`
      yamlText = yamlText.replace(
        /^(\s*(?:- )?[a-zA-Z_][\w]*): (.+:.+)$/gm,
        (match, keyPart, valuePart) => {
          if (valuePart.startsWith('"') || valuePart.startsWith("'")) return match;
          return `${keyPart}: "${valuePart.replace(/"/g, '\\"')}"`;
        }
      );
      parsed = yaml.load(yamlText) as any;
      console.log('[PFG-YAML] Successfully decoded YAML output');
    } catch (yamlError) {
      console.warn('[PFG-YAML] YAML decode failed, attempting JSON fallback:', yamlError);
      try {
        parsed = JSON.parse(raw);
        console.log('[PFG-YAML] JSON fallback succeeded');
      } catch (jsonError) {
        const len = raw.length;
        const tail = raw.slice(-400);
        throw new Error(
          `Both YAML and JSON parsing failed (${len} chars). ` +
          `YAML error: ${yamlError instanceof Error ? yamlError.message : yamlError}. ` +
          `JSON error: ${jsonError instanceof Error ? jsonError.message : jsonError}. ` +
          `Tail: ...${tail}`
        );
      }
    }
  } else if (outputFormat === 'json-compact') {
    // JSON Compact mode: parse JSON then expand abbreviated keys
    try {
      let jsonText = raw.trim();
      // Strip leading code-fence block (e.g. ```json\n...\n```)
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
      } else {
        // Even when there's no leading fence the model sometimes appends ``` at the end
        jsonText = jsonText.replace(/\n?```\s*$/, '');
      }
      jsonText = jsonText.trim();

      // Fix invalid range notation like [183-192] → [183,184,...,192] that the model sometimes emits
      jsonText = jsonText.replace(/\[(\d+)-(\d+)\]/g, (_match, start, end) => {
        const s = parseInt(start, 10), e = parseInt(end, 10);
        if (e > s && e - s < 1000) {
          const arr = [];
          for (let i = s; i <= e; i++) arr.push(i);
          return `[${arr.join(',')}]`;
        }
        return _match;
      });

      let compactParsed: any;
      try {
        compactParsed = JSON.parse(jsonText);
      } catch (e) {
        if (e instanceof Error && e.message.includes('Unexpected non-whitespace character after JSON at position')) {
          const match = e.message.match(/at position (\d+)/);
          if (match) {
            const pos = parseInt(match[1], 10);
            compactParsed = JSON.parse(jsonText.substring(0, pos));
          } else {
            throw e;
          }
        } else {
          throw e;
        }
      }
      parsed = expandCompactKeys(compactParsed);
      console.log('[PFG-COMPACT] Successfully parsed and expanded compact JSON');
    } catch (e) {
      const len = raw.length;
      const tail = raw.slice(-400);
      throw new Error(
        `JSON Compact parsing failed (${len} chars). Parse error: ${e instanceof Error ? e.message : e}. ` +
        `Tail: ...${tail}`
      );
    }
  } else {
    // Standard JSON mode
    try {
      let jsonText = raw.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
      }
      try {
        parsed = JSON.parse(jsonText);
      } catch (e) {
        if (e instanceof Error && e.message.includes('Unexpected non-whitespace character after JSON at position')) {
          const match = e.message.match(/at position (\d+)/);
          if (match) {
            const pos = parseInt(match[1], 10);
            parsed = JSON.parse(jsonText.substring(0, pos));
          } else {
            throw e;
          }
        } else {
          throw e;
        }
      }
    } catch (e) {
      const len = raw.length;
      const tail = raw.slice(-400);
      throw new Error(
        `Gemini returned invalid JSON (${len} chars). Parse error: ${e instanceof Error ? e.message : e}. ` +
        `Tail: ...${tail}`
      );
    }
  }

  // Paragraph-indexed mode: resolve §N references in logic_snippet before adapting
  if (useParagraphIndexing && paragraphs) {
    resolveParagraphReferences(parsed, paragraphs);
    console.log(`[PFG] Resolved §paragraph references (${paragraphs.length} paragraphs available)`);
  }

  let agentConfig = adaptPfgJsonToAgentConfig(parsed, prompt, existingPositions);

  // Post-parse: strip fabricated END node logicSnippets
  agentConfig = {
    ...agentConfig,
    nodes: cleanupEndNodeSnippets(agentConfig.nodes, prompt),
  };

  // Post-parse: source coverage + verbatim validation
  const coverageViolations = computeSourceCoverage(prompt, agentConfig.nodes);
  if (coverageViolations.length > 0) {
    const existing = (agentConfig as any)._postParseViolations ?? [];
    (agentConfig as any)._postParseViolations = [...existing, ...coverageViolations];
  }

  // Post-parse edge cleanup: remove RESOLUTION→RESOLUTION chains + deduplicate
  agentConfig = {
    ...agentConfig,
    connections: cleanupEdges(agentConfig.nodes, agentConfig.connections),
  };

  // Post-parse: strip edges that target the START node (LLM anti-pattern — wiring rules/personas back to START)
  // This enforces the START invariant: zero incoming edges.
  const startNodeId = agentConfig.nodes.find(n => n.type === 'START')?.id;
  if (startNodeId) {
    const beforeCount = agentConfig.connections.length;
    agentConfig = {
      ...agentConfig,
      connections: agentConfig.connections.filter(c => c.target !== startNodeId),
    };
    const removed = beforeCount - agentConfig.connections.length;
    if (removed > 0) {
      console.log(`[PFG] Stripped ${removed} illegal back-edge(s) targeting START node (${startNodeId})`);
    }

    // Strip START → RULE / PERSONA / GUARD edges.
    // These annotation types are "enhancers" that wire FORWARD into the flow —
    // they should never appear as destinations from the entry point.
    const STRIP_FROM_START = new Set(['RULE', 'GUARD', 'PERSONA']);
    const nodeTypeById = new Map(agentConfig.nodes.map(n => [n.id, n.type]));
    const beforeAnnot = agentConfig.connections.length;
    agentConfig = {
      ...agentConfig,
      connections: agentConfig.connections.filter(c => {
        if (c.source !== startNodeId) return true;
        return !STRIP_FROM_START.has(nodeTypeById.get(c.target) ?? '');
      }),
    };
    const removedAnnot = beforeAnnot - agentConfig.connections.length;
    if (removedAnnot > 0) {
      console.log(`[PFG] Stripped ${removedAnnot} START→RULE/PERSONA/GUARD edge(s) — annotations wire forward`);
    }
  }

  // Post-parse: auto-wire annotation nodes that are unreachable from START.
  // These are CONFIG/REFERENCE nodes the LLM created with outgoing edges
  // but no incoming edges (islands). Fix by adding START → annotation edges.
  // NOTE: RULE/GUARD/PERSONA are intentionally excluded — they wire forward
  // (annotation → flow) and do not need a START inbound edge.
  if (startNodeId) {
    const ANNOTATION_TYPES = new Set(['CONFIG', 'REFERENCE', 'MEMORY']);
    const reachable = new Set<string>();
    const queue = [startNodeId];
    while (queue.length) {
      const cur = queue.shift()!;
      if (reachable.has(cur)) continue;
      reachable.add(cur);
      agentConfig.connections.filter(c => c.source === cur).forEach(c => queue.push(c.target));
    }
    const unreachableAnnotations = agentConfig.nodes.filter(
      n => ANNOTATION_TYPES.has(n.type) && !reachable.has(n.id)
    );
    if (unreachableAnnotations.length > 0) {
      const newEdges: Connection[] = unreachableAnnotations.map(n => ({
        id: `auto-reach-${n.id}`,
        source: startNodeId,
        target: n.id,
        condition: 'Applies to Agent',
      }));
      agentConfig = {
        ...agentConfig,
        connections: [...agentConfig.connections, ...newEdges],
      };
      console.log(`[PFG] Auto-wired ${newEdges.length} unreachable annotation node(s) from START: ${unreachableAnnotations.map(n => n.label).join(', ')}`);
    }
  }

  // Post-parse auto-wiring (if enabled in settings)
  if (graphRules.autoWireDisconnected) {
    agentConfig = {
      ...agentConfig,
      connections: autoWireDisconnectedNodes(agentConfig.nodes, agentConfig.connections),
    };
  }

  // Post-parse: auto-inject missing LOGGING nodes (if outcome chains enabled)
  if (graphRules.structuredOutcomeChains) {
    const injected = autoInjectLoggingNodes(
      agentConfig.nodes,
      agentConfig.connections,
      agentConfig.originalPrompt ?? prompt
    );
    agentConfig = {
      ...agentConfig,
      nodes: injected.nodes,
      connections: injected.connections,
    };
  }

  // Post-parse DAG validation (if enabled in settings)
  if (graphRules.postParseValidation) {
    const violations = validateAgentConfig(agentConfig);
    if (violations.length > 0) {
      const existing = (agentConfig as any)._postParseViolations ?? [];
      (agentConfig as any)._postParseViolations = [...existing, ...violations];
    }
  }

  agentConfig.sourceFormat = outputFormat;
  agentConfig.rawLlmOutput = raw;
  console.log(`[PFG] promptToGraph DONE — "${promptId}…" (${Date.now() - streamStartTime}ms total, ${agentConfig.nodes.length} nodes, ${agentConfig.connections.length} edges)`);
  return agentConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic short hash: djb2 over a string, returns 8 hex chars.
// Used to derive stable node / agent IDs from content so that re-uploading
// the same prompt always produces an identical AgentConfig.
// ─────────────────────────────────────────────────────────────────────────────
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0; // keep 32-bit unsigned
  }
  return h.toString(16).padStart(8, '0');
}

function stableNodeId(pfgType: string, sourceSection: string, logicSnippet: string, order: number): string {
  return `n-${djb2(`${pfgType}|${sourceSection}|${logicSnippet}|${order}`)}`;
}

function generateAgentId(prompt: string): string {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `agent-${djb2(prompt.trim())}-${timestamp}-${randomStr}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter: transform PFG JSON → AgentConfig
// ─────────────────────────────────────────────────────────────────────────────
export function adaptPfgJsonToAgentConfig(
  pfgJson: any,
  originalPrompt: string,
  existingPositions?: Map<string, { x: number; y: number }>
): AgentConfig {
  const metadata = pfgJson?.metadata ?? {};
  const graphData = pfgJson?.graph ?? pfgJson ?? {};
  const rawNodes: any[] = graphData.nodes ?? [];
  const rawEdges: any[] = graphData.edges ?? [];
  const parsedSnippets = parseMarkdownToSnippets(originalPrompt);

  // Build a mapping from Gemini's (non-deterministic) node IDs → stable content-derived IDs.
  // This ensures the same prompt always produces the same node IDs regardless of what
  // Gemini chose to call them in this particular call.
  const idRemap = new Map<string, string>();
  // Track collisions: if two nodes hash to the same ID, append a counter suffix.
  const seenIds = new Map<string, number>();
  for (const n of rawNodes) {
    const data = n.data ?? {};
    let stable = stableNodeId(
      n.type ?? 'action',
      data.source_section ?? '',
      data.logic_snippet ?? '',
      data.order ?? 0,
    );
    const count = seenIds.get(stable) ?? 0;
    seenIds.set(stable, count + 1);
    if (count > 0) stable = `${stable}-${count}`;
    idRemap.set(n.id, stable);
  }

  // Track which nodes matched an existing position (used for overlap fix below)
  const matchedNodeIds = new Set<string>();

  const nodes: NodeData[] = rawNodes.map((n: any) => {
    const pfgType: string = n.type ?? 'action';
    const mappedType = mapPfgType(pfgType);
    const data = n.data ?? {};
    const stableId = idRemap.get(n.id) ?? n.id;
    const logicSnippet = data.logic_snippet ?? '';

    let lineIndex: number | undefined;
    let rawLine: string | undefined;

    if (logicSnippet) {
      const lowerSnippet = logicSnippet.toLowerCase().trim();
      // Try to find a snippet that overlaps with the logic snippet
      const match = parsedSnippets.find(s => {
        const lowerText = s.text.toLowerCase().trim();
        if (!lowerText || !lowerSnippet) return false;
        return lowerSnippet.includes(lowerText) || lowerText.includes(lowerSnippet);
      });
      if (match) {
        lineIndex = match.lineIndex;
        rawLine = match.rawLine;
      }
    }

    let position: { x: number; y: number };
    if (existingPositions) {
      const matched =
        existingPositions.get(logicSnippet) ??
        existingPositions.get(stableId) ??
        existingPositions.get(n.id) ??
        existingPositions.get(data.label ?? '');
      if (matched) {
        position = matched;
        matchedNodeIds.add(stableId);
      } else {
        position = n.position ?? { x: 0, y: 0 };
      }
    } else {
      position = n.position ?? { x: 0, y: 0 };
    }

    return {
      id: stableId,
      type: mappedType,
      label: data.label ?? n.id,
      description: data.description ?? '',
      lineIndex,
      rawLine,
      config: {
        logicSnippet,
        sourceSection: data.source_section ?? '',
        sourceFormat: data.source_format ?? 'prose',
        order: data.order ?? 0,
        tool: data.tool ?? null,
        value: data.value ?? null,
        outcome: data.outcome ?? null,
        pfgType,
        inputRequired: data.input_required ?? null,
        ruleScope: data.rule_scope ?? null,
        appliesTo: data.applies_to ?? null,
        personaScope: data.persona_scope ?? null,
        column: (data.column === 'left' || data.column === 'center' || data.column === 'right')
          ? data.column
          : null,
        branchGroup: data.branch_group ?? null,
      },
      position,
    };
  });

  const connections: Connection[] = rawEdges.map((e: any, i: number) => ({
    id: e.id ?? `conn-${i}`,
    source: idRemap.get(e.source) ?? e.source,
    target: idRemap.get(e.target) ?? e.target,
    condition: e.label ?? e.data?.condition ?? undefined,
  }));

  const annotatedNodes = annotateWithOriginalPositions(nodes, originalPrompt);

  let finalNodes: NodeData[];
  if (existingPositions) {
    // Place unmatched nodes near connected neighbors that DO have good positions
    const unmatchedIds = new Set(
      annotatedNodes.filter(n => !matchedNodeIds.has(n.id)).map(n => n.id)
    );

    if (unmatchedIds.size > 0) {
      const posById = new Map(annotatedNodes.map(n => [n.id, n.position]));

      for (const n of annotatedNodes) {
        if (!unmatchedIds.has(n.id)) continue;

        const neighborPositions: { x: number; y: number }[] = [];
        for (const conn of connections) {
          if (conn.source === n.id && matchedNodeIds.has(conn.target)) {
            const p = posById.get(conn.target);
            if (p) neighborPositions.push(p);
          }
          if (conn.target === n.id && matchedNodeIds.has(conn.source)) {
            const p = posById.get(conn.source);
            if (p) neighborPositions.push(p);
          }
        }

        if (neighborPositions.length > 0) {
          const avgX = neighborPositions.reduce((s, p) => s + p.x, 0) / neighborPositions.length;
          const avgY = neighborPositions.reduce((s, p) => s + p.y, 0) / neighborPositions.length;
          n.position = { x: avgX + 50, y: avgY + 120 };
        }
      }
    }

    // Always resolve overlaps to prevent nodes from piling up
    finalNodes = resolveOverlaps(annotatedNodes);
  } else {
    finalNodes = applyAutoLayout(annotatedNodes, connections);
  }

  const agentId = metadata.agent_id
    ? metadata.agent_id.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    : extractAgentName(originalPrompt);

  return {
    id: generateAgentId(originalPrompt),
    name: agentId,
    description:
      metadata.description ??
      `Generated from: "${originalPrompt.substring(0, 100)}${originalPrompt.length > 100 ? '...' : ''}"`,
    originalPrompt,
    nodes: finalNodes,
    connections,
    version: metadata.version ?? '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-processing: find each node's exact source row in the original prompt.
// Stores origRow (0-based line index), origLine (verbatim line with indent and
// list/heading marker), origIndent (leading-space count), and origBlankBefore
// (whether the preceding line was blank) in node.config.
//
// Reconstruction uses these to emit every unchanged node as its exact original
// line — preserving indentation, list markers, and blank-line spacing — without
// any heuristic formatting logic.
// ─────────────────────────────────────────────────────────────────────────────
function annotateWithOriginalPositions(nodes: NodeData[], prompt: string): NodeData[] {
  if (!prompt) return nodes;

  const lines = prompt.split('\n');
  const usedRows = new Set<number>();

  // Strip markdown list / heading markers so that snippets stored with or
  // without these markers (Gemini is inconsistent) still match source lines.
  const normalize = (s: string) =>
    s.replace(/^[-*]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/^#+\s+/, '')
      .trim();

  // Process in document order. Structural/side-column types (tool, input) are
  // deferred so content nodes (action, step, persona) claim rows first.
  const DEFER_TYPES = new Set(['tool', 'input', 'skill']);
  const byOrder = [...nodes].sort((a, b) => {
    const aDefer = DEFER_TYPES.has((a.config?.pfgType as string) ?? a.type.toLowerCase()) ? 1 : 0;
    const bDefer = DEFER_TYPES.has((b.config?.pfgType as string) ?? b.type.toLowerCase()) ? 1 : 0;
    if (aDefer !== bDefer) return aDefer - bDefer;
    return ((a.config?.order as number) ?? 0) - ((b.config?.order as number) ?? 0);
  });

  const rowMeta = new Map<string, {
    origRow: number;
    origLine: string;
    origIndent: number;
    origBlankBefore: boolean;
  }>();

  for (const node of byOrder) {
    const snippet = (node.config?.logicSnippet as string) ?? '';
    if (!snippet) continue;

    const snippetNorm = normalize(snippet);
    if (snippetNorm.length < 4) continue; // too short → too many potential false matches
    const pfgType = ((node.config?.pfgType as string) ?? node.type.toLowerCase());
    const allowContainsMatch = (pfgType === 'tool' || pfgType === 'skill') && snippetNorm.length >= 6;

    for (let rowIdx = 0; rowIdx < lines.length; rowIdx++) {
      if (usedRows.has(rowIdx)) continue;
      const line = lines[rowIdx];
      const trimmed = line.trimStart();
      if (!trimmed) continue;

      const lineNorm = normalize(trimmed);
      const isExact = lineNorm === snippetNorm;
      const isPrefix = !isExact && snippetNorm.length >= 30 && lineNorm.startsWith(snippetNorm);
      const isContained = !isExact && !isPrefix && allowContainsMatch && lineNorm.includes(snippetNorm);

      if (isExact || isPrefix || isContained) {
        usedRows.add(rowIdx);
        rowMeta.set(node.id, {
          origRow: rowIdx,
          origLine: line.trimEnd(),
          origIndent: line.length - trimmed.length,
          origBlankBefore: rowIdx > 0 && lines[rowIdx - 1].trim() === '',
        });
        break;
      }
    }
  }

  // Store origSnippet for ALL nodes — even those without a row match — so that
  // reconstruction can distinguish "PFG sub-extraction, unchanged" from "user edited".
  return nodes.map(node => {
    const snippet = (node.config?.logicSnippet as string) ?? '';
    const meta = rowMeta.get(node.id);
    if (!meta) {
      return {
        ...node,
        config: {
          ...node.config,
          origSnippet: snippet,
        },
      };
    }
    return {
      ...node,
      config: {
        ...node.config,
        origRow: meta.origRow,
        origLine: meta.origLine,
        origIndent: meta.origIndent,
        origBlankBefore: meta.origBlankBefore,
        origSnippet: snippet,
      },
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Build a position map from an existing AgentConfig for re-sync preservation
// ─────────────────────────────────────────────────────────────────────────────
export function buildPositionMap(agent: AgentConfig): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  for (const node of agent.nodes) {
    map.set(node.id, node.position);
    if (node.config?.logicSnippet) {
      map.set(node.config.logicSnippet as string, node.position);
    }
    if (node.label) {
      map.set(node.label, node.position);
    }
  }
  return map;
}

function extractAgentName(prompt: string): string {
  const words = prompt.split(' ').slice(0, 5);
  let name = words.join(' ');
  if (name.length > 50) name = name.substring(0, 47) + '...';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-Agent Detection
// Lightweight Gemini call to determine if a prompt describes a master agent
// routing to N specialist subagents. Called BEFORE promptToGraph in the UI.
// ─────────────────────────────────────────────────────────────────────────────

const MULTI_AGENT_DETECTION_PROMPT = `You are an agent architecture analyzer.

Analyze the given prompt and determine if it describes a MULTI-AGENT system — i.e., a master/coordinator/router agent that delegates to multiple specialist sub-agents.

Signs of a multi-agent system:
- A "router" or "intent classifier" that routes to named agents
- Multiple named agents listed (e.g. "PRICE_CHECK", "LIST_BUILDER", "RECIPE")
- Each agent has its own distinct behavior/prompt described separately
- Phrases like "route to", "delegate to", "specialist agent", "sub-agent"

Signs of a SINGLE agent (NOT multi-agent):
- One agent with multiple rules/steps/tools
- Decision trees within a single agent
- Tools or APIs called by one agent (tools are NOT agents)

IMPORTANT: Do NOT confuse TOOLS with AGENTS. A tool is an external API/function call. An agent is an autonomous AI module with its own prompt/behavior.

Return a JSON object:
- If multi-agent: { "isMasterAgent": true, "masterRole": "ROUTER", "subAgentRoles": ["AGENT_A", "AGENT_B", ...], "masterPromptFragment": "the portion of text that is the master agent's own logic", "subAgentPromptHints": ["hint about what AGENT_A does", "hint about what AGENT_B does", ...] }
- If single agent: { "isMasterAgent": false, "masterRole": "", "subAgentRoles": [], "masterPromptFragment": "", "subAgentPromptHints": [] }

Return ONLY the JSON object. No other text.`;

export async function detectMultiAgent(
  prompt: string,
  options: { apiKey: string; model?: string }
): Promise<MultiAgentDetection | null> {
  const normalized = normalizePromptText(prompt);
  const { apiKey, model = DEFAULT_GEMINI_MODEL } = options;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      config: {
        temperature: 0,
        topP: 0,
        thinkingConfig: (model?.includes('gemini-2') ? { thinkingBudget: 0 } : { thinkingLevel: 'MINIMAL' }) as any,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        systemInstruction: MULTI_AGENT_DETECTION_PROMPT,
      } as any,
      contents: [{ role: 'user', parts: [{ text: normalized }] }],
    });

    const text = response.text?.trim() ?? '';
    if (!text) return null;

    const parsed = JSON.parse(text) as MultiAgentDetection;
    if (!parsed.isMasterAgent) return null;
    if (!parsed.subAgentRoles?.length) return null;
    return parsed;
  } catch (err) {
    console.error('Multi-agent detection failed:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-Agent Graph Generation
// Generates master + N subagent graphs, linking them via parentAgentId/childAgentIds
// ─────────────────────────────────────────────────────────────────────────────

export type AgentGenStatus = 'pending' | 'generating' | 'done' | 'error';

export interface AgentGenProgress {
  role: string;
  status: AgentGenStatus;
  error?: string;
}

export async function generateMultiAgentGraphs(
  masterPrompt: string,
  subAgentPrompts: { role: string; prompt: string }[],
  options: PromptToGraphOptions,
  onProgress?: (agents: AgentGenProgress[]) => void,
  masterRole?: string
): Promise<{ master: AgentConfig; subAgents: AgentConfig[] }> {
  const { promptToGraphV4 } = await import('@/lib/prompt-to-graph/v4');
  const resolvedMasterRole = masterRole || 'MASTER';

  const v4Opts = {
    apiKey: options.apiKey,
    model: options.model,
    signal: options.signal,
    onChunk: options.onChunk,
  };

  // Initial state: master generating, all subagents pending
  const progressState: AgentGenProgress[] = [
    { role: resolvedMasterRole, status: 'generating' },
    ...subAgentPrompts.map(({ role }) => ({ role, status: 'pending' as AgentGenStatus })),
  ];
  onProgress?.([...progressState]);

  // Step 1: Generate master first (needed for context building)
  const master = await promptToGraphV4(masterPrompt, v4Opts);
  master.agentRole = resolvedMasterRole;
  master.childAgentIds = [];

  progressState[0] = { role: resolvedMasterRole, status: 'done' };
  onProgress?.([...progressState]);

  if (options.signal?.aborted) {
    throw new DOMException('Generation aborted', 'AbortError');
  }

  // Step 2: Generate all subagents in parallel using V4 pipeline
  const AGENT_TIMEOUT_MS = 180_000; // 3 minutes per agent
  const MAX_RETRIES = 1;

  // Mark all subagents as generating
  for (let i = 0; i < subAgentPrompts.length; i++) {
    progressState[i + 1] = { role: subAgentPrompts[i].role, status: 'generating' };
  }
  onProgress?.([...progressState]);

  const generateOne = async (i: number): Promise<AgentConfig> => {
    const { role, prompt } = subAgentPrompts[i];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (options.signal?.aborted) {
        throw new DOMException('Generation aborted', 'AbortError');
      }

      if (attempt > 0) {
        console.log(`[MultiAgent] Retrying ${role} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
        await new Promise(resolve => setTimeout(resolve, 2_000));
      }

      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`Generation timed out after ${AGENT_TIMEOUT_MS / 1000}s`)),
          AGENT_TIMEOUT_MS
        );
      });

      try {
        const subAgentContext = buildSubAgentContext(
          master,
          role,
          subAgentPrompts.map(s => s.role)
        );
        const augmentedPrompt = `${subAgentContext}\n\n---\n\n${prompt}`;

        console.log(`[MultiAgent] ${role} attempt ${attempt + 1}: starting (prompt: ${augmentedPrompt.length} chars)`);
        const subAgent = await Promise.race([
          promptToGraphV4(augmentedPrompt, { ...v4Opts, onChunk: undefined }),
          timeoutPromise,
        ]);
        clearTimeout(timeoutId!);

        subAgent.originalPrompt = prompt;
        subAgent.agentRole = role;
        subAgent.parentAgentId = master.id;
        subAgent.name = `${role} Agent`;
        subAgent.id = `agent-${djb2(`${role}|${prompt.trim()}`)}`;


        // Strip sibling AGENT nodes — they are context-only, not real children
        const siblingRoles = subAgentPrompts
          .filter(s => s.role.toUpperCase() !== role.toUpperCase())
          .map(s => s.role.toUpperCase());
        const siblingNodeIds = new Set<string>();
        for (const node of subAgent.nodes) {
          if (node.type !== 'AGENT') continue;
          const nodeRole = ((node.config?.agentRole as string) || node.label || '').toUpperCase();
          const isSibling = siblingRoles.some(sr =>
            nodeRole.includes(sr) || sr.includes(nodeRole) ||
            node.label.toUpperCase().includes(sr) || sr.includes(node.label.toUpperCase())
          );
          if (isSibling) siblingNodeIds.add(node.id);
        }
        if (siblingNodeIds.size > 0) {
          subAgent.nodes = subAgent.nodes.filter(n => !siblingNodeIds.has(n.id));
          subAgent.connections = subAgent.connections.filter(
            c => !siblingNodeIds.has(c.source) && !siblingNodeIds.has(c.target)
          );
          // Rebuild childAgentIds from remaining AGENT nodes only
          const remainingAgentIds = subAgent.nodes
            .filter(n => n.type === 'AGENT' && n.config?.linkedAgentId)
            .map(n => n.config.linkedAgentId as string);
          subAgent.childAgentIds = remainingAgentIds.length > 0 ? remainingAgentIds : undefined as any;
        }

        console.log(`[MultiAgent] ${role} attempt ${attempt + 1}: SUCCESS (${subAgent.nodes.length} nodes)`);
        progressState[i + 1] = { role, status: 'done' };
        onProgress?.([...progressState]);
        return subAgent;
      } catch (err) {
        clearTimeout(timeoutId!);
        const errDetail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.error(`[MultiAgent] ${role} attempt ${attempt + 1}: FAILED —`, errDetail);
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        if (attempt >= MAX_RETRIES) {
          const errMsg = err instanceof Error ? err.message : 'Failed';
          progressState[i + 1] = { role, status: 'error', error: errMsg };
          onProgress?.([...progressState]);
          throw err;
        }
      }
    }
    throw new Error(`${role}: all retries exhausted`);
  };

  const settled = await Promise.allSettled(
    subAgentPrompts.map((_, i) => generateOne(i))
  );

  // If the user aborted, surface the AbortError immediately
  for (const result of settled) {
    if (result.status === 'rejected') {
      const err = result.reason;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
    }
  }

  // Collect successful subagents
  const subAgentResults: AgentConfig[] = settled
    .filter((r): r is PromiseFulfilledResult<AgentConfig> => r.status === 'fulfilled')
    .map(r => r.value);

  console.log(`[MultiAgent] Final results: ${subAgentResults.length}/${subAgentPrompts.length} subagents succeeded`);
  settled.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[MultiAgent] Subagent ${i} (${subAgentPrompts[i].role}) rejected:`, r.reason);
    } else {
      console.log(`[MultiAgent] Subagent ${i} (${subAgentPrompts[i].role}): ${r.value.nodes.length} nodes`);
    }
  });

  // Assign child IDs in original order
  for (const subAgent of subAgentResults) {
    master.childAgentIds.push(subAgent.id);
  }

  // ── Step A: Link existing AGENT nodes to subagents by scored role matching ──
  const linkedRoles = new Set<string>();
  const subRoles = subAgentResults.map(s => s.agentRole || '');

  for (const node of master.nodes) {
    if (node.type !== 'AGENT') continue;
    const nodeLabel = node.label || '';
    const availableRoles = subRoles.filter(r => !linkedRoles.has(r.toUpperCase()));

    // Try scored matching first
    let { bestMatch, confidence } = findBestRoleMatch(nodeLabel, availableRoles);

    // If scored match is weak, try substring containment (handles "Agent1: Research Agent" vs "Research Agent")
    if ((!bestMatch || confidence < 0.5) && availableRoles.length > 0) {
      const labelUpper = nodeLabel.toUpperCase();
      for (const role of availableRoles) {
        if (labelUpper.includes(role.toUpperCase()) || role.toUpperCase().includes(labelUpper)) {
          bestMatch = role;
          confidence = 0.8;
          break;
        }
      }
    }

    if (bestMatch && confidence >= 0.5) {
      const matchedSub = subAgentResults.find(s => (s.agentRole || '').toUpperCase() === bestMatch.toUpperCase());
      if (matchedSub) {
        node.config = {
          ...node.config,
          linkedAgentId: matchedSub.id,
          agentRole: matchedSub.agentRole,
          roleMatchConfidence: confidence,
        };
        linkedRoles.add(bestMatch.toUpperCase());
      }
    }
  }

  // ── Step B: Deduplicate AGENT nodes — keep exactly one per subagent role ─
  // Gemini sometimes creates multiple nodes for the same role if the role is
  // mentioned both in the prompt body and in our augmentation. Keep the first
  // linked node; remove all unlinked extras for that role.
  const seenAgentRoles = new Set<string>();
  const nodeIdsToRemove = new Set<string>();
  for (const node of master.nodes) {
    if (node.type !== 'AGENT') continue;
    const role = ((node.config?.agentRole as string) || node.label || '').toUpperCase();
    if (seenAgentRoles.has(role)) {
      nodeIdsToRemove.add(node.id);
    } else {
      seenAgentRoles.add(role);
    }
  }
  if (nodeIdsToRemove.size > 0) {
    master.nodes = master.nodes.filter(n => !nodeIdsToRemove.has(n.id));
    master.connections = master.connections.filter(
      c => !nodeIdsToRemove.has(c.source) && !nodeIdsToRemove.has(c.target)
    );
  }

  // ── Step C: Link existing in-flow AGENT nodes to subagent configs ─────────
  // V4 already creates AGENT nodes in the flow via promoteSubAgents.
  // We just need to ensure they have linkedAgentId set. Only inject a new
  // AGENT node if no existing node matches the role at all (fuzzy match).
  const agentNodes = master.nodes.filter(n => n.type === 'AGENT');
  for (const sub of subAgentResults) {
    const subRole = sub.agentRole || '';
    // Check if any existing AGENT node already covers this role
    const alreadyLinked = agentNodes.some(n => {
      const nodeRole = (n.config?.agentRole as string) || n.label || '';
      const { confidence } = findBestRoleMatch(nodeRole, [subRole]);
      return confidence >= 0.5;
    });
    if (alreadyLinked) continue;

    // Also check by label substring (handles "Agent1: Research Agent" vs "Research Agent")
    const labelMatch = agentNodes.some(n =>
      n.label.toUpperCase().includes(subRole.toUpperCase()) ||
      subRole.toUpperCase().includes(n.label.toUpperCase())
    );
    if (labelMatch) continue;

    // No match at all — inject a standalone AGENT node (rare with V4)
    const newNodeId = `agent-node-${djb2(subRole.toUpperCase())}`;
    const newNode: NodeData = {
      id: newNodeId,
      type: 'AGENT',
      label: sub.agentRole || sub.name,
      description: `Sub-agent: ${sub.agentRole}`,
      config: {
        logicSnippet: sub.agentRole || '',
        sourceSection: 'Sub-Agents in this System',
        sourceFormat: 'prose',
        order: 9000 + subAgentResults.indexOf(sub),
        column: 'center',
        linkedAgentId: sub.id,
        agentRole: sub.agentRole,
      },
      position: { x: 0, y: 0 },
    };
    master.nodes.push(newNode);

    // Wire to first STEP node (not END) as a sibling reference
    const stepNode = master.nodes.find(n => n.type === 'STEP' || n.type === 'ACTION');
    const anchor = stepNode ?? master.nodes.find(n => n.type === 'START') ?? master.nodes[0];
    if (anchor && anchor.id !== newNodeId) {
      master.connections.push({
        id: `conn-injected-${newNodeId}`,
        source: anchor.id,
        target: newNodeId,
        condition: sub.agentRole || undefined,
      });
    }
  }

  // ── Step D: Populate interface contracts on all AGENT nodes ─────────────
  for (const node of master.nodes) {
    if (node.type !== 'AGENT') continue;
    const contract = extractInterfaceContract(master, node.id);
    node.config = {
      ...node.config,
      interfaceContract: contract,
    };
  }

  return { master, subAgents: subAgentResults };
}
