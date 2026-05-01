// Prompt-to-Graph V6 — Skill-Workflow Specialized Prompt
import { TYPE_CODES, SHARED_LABELING_RULES, SHARED_OUTPUT_SHAPE, SHARED_STRUCTURAL_RULES } from './base';

export const SKILL_WORKFLOW_PROMPT = `You convert a skill/command/workflow prompt (e.g. a Claude Code skill or developer command spec) into a directed acyclic graph.

Output ONLY raw JSON. No markdown fences. No prose.

You are given numbered paragraphs (§0, §1, §2, …). For each paragraph,
decide what graph node(s) it produces and how they connect.

═══════════════════════════════════════════════════════════════
1. CLASSIFY EACH PARAGRAPH
═══════════════════════════════════════════════════════════════

Skill-workflow patterns to recognize:

  TEXT PATTERN                                  → TYPE
  ──────────────────────────────────────────────────────────
  "## When to Use", "Trigger:", activation      → tr=trigger
  "## Checklist", numbered step, "Phase N"      → s=step (one per step)
  "invoke X skill", "use X skill", "read skill" → sk=skill
  "Don't", "Never", "Avoid", anti-pattern       → wp=warning
  Code block summary [CODE: bash — ...]         → t=tool (label from summary, tool=inferred)
  "You are [role]", identity                    → p=persona
  Pure policy constant                          → ru=rule
  "At any point", guard                         → g=guard
  "Activate when"                               → tr=trigger
  Configuration value                           → cf=config
  Reference to external doc                     → ref=reference
  Decision / branch                             → d=decision

Type codes: ${TYPE_CODES}

${SHARED_LABELING_RULES}

SKILL NODE (sk=skill):
- Use for any paragraph that invokes, references, or composes another skill
- Set label to the skill name: "Brand Voice Skill", "Brainstorming Skill"
- No "tool" field needed on sk=skill nodes

WARNING NODE (wp=warning):
- Use for anti-pattern sections, "do NOT" instructions, "never do X" guidance
- Label in negative form: "Never batch completions", "Don't skip self-review"
- These are documentation nodes — connect them with "Governs" edges to nearby flow nodes
- Set scope: "s", governs: [ids of the nodes this warning applies to]

TOOL FIELD (MANDATORY for t=tool nodes derived from code blocks):
- Code block summaries like [CODE: bash — Run sequential pipeline step] → t=tool
- Set "tool" to the inferred tool name (e.g. "Bash", "Read", "Write", "WebSearch")
- If unclear, use the language as the tool name

DESCRIPTION FIELD (REQUIRED on every node):
- Every node MUST include a "desc" field: one short sentence (max 15 words)

CRITICAL RULES:
- "## When to Use" section → tr=trigger nodes
- Each checklist item / numbered step → its own s=step node
- Anti-pattern sections → wp=warning nodes with governs edges
- Skill invocations → sk=skill nodes in the flow

═══════════════════════════════════════════════════════════════
2. WIRE EDGES
═══════════════════════════════════════════════════════════════

A) SEQUENTIAL: steps in checklist order
B) TRIGGERS: tr=trigger → st=start or first step (activation conditions)
C) SKILLS: sk=skill fits in the flow at the point it's invoked
D) WARNINGS: wp=warning → "Governs" edge to the nodes it warns about
E) ZERO CYCLES: no back-edges (this is a skill workflow, not a loop pattern)

═══════════════════════════════════════════════════════════════
3. RETURN THIS EXACT SHAPE
═══════════════════════════════════════════════════════════════

${SHARED_OUTPUT_SHAPE}

${SHARED_STRUCTURAL_RULES}`;
