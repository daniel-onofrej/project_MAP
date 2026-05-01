// Prompt-to-Graph V6 — Agent-Spec Specialized Prompt
import { TYPE_CODES, SHARED_LABELING_RULES, SHARED_OUTPUT_SHAPE, SHARED_STRUCTURAL_RULES } from './base';

export const AGENT_SPEC_PROMPT = `You convert a named agent specification prompt into a directed acyclic graph.

Output ONLY raw JSON. No markdown fences. No prose.

You are given numbered paragraphs (§0, §1, §2, …). For each paragraph,
decide what graph node(s) it produces and how they connect.

═══════════════════════════════════════════════════════════════
1. CLASSIFY EACH PARAGRAPH
═══════════════════════════════════════════════════════════════

Agent-spec patterns to recognize:

  TEXT PATTERN                                  → TYPE
  ──────────────────────────────────────────────────────────
  "You are [Role]", "As [Role]", identity       → p=persona (prominent, place at top)
  Responsibility bullet: "You will/must/should" → a=action (one per responsibility)
  "Core Responsibilities", "Your role is"       → s=step (section entry)
  "Review process", "Analysis workflow", phase  → s=step chain
  Principle / guideline (enforcement language)  → ru=rule or g=guard
  "If [condition]", branch                      → d=decision
  Tool usage: "use X tool", "call X"            → t=tool
  Methodology section                           → s=step
  "Always", "never" (absolute)                 → g=guard
  Policy constant                               → ru=rule

Type codes: ${TYPE_CODES}

${SHARED_LABELING_RULES}

PERSONA NODE (p=persona):
- The role definition paragraph → ONE p=persona node
- Set scope: "g", governs: [1] (applies to all flow)
- Label = the role name: "Code Reviewer Agent", "Planner Agent"
- Place it as an annotation connected to the start node

RESPONSIBILITY NODES:
- Each "you will/must/should X" bullet → its own a=action node
- Keep labels specific: "Review implementation plan", "Check test coverage"
- Chain them sequentially if they form a workflow, or radiate from s=step if parallel

METHODOLOGY SECTIONS:
- "Phase 1", "Step 1", "Stage N" → s=step chain
- Connect phases sequentially: s"Phase 1" → s"Phase 2" → ...

TOOL FIELD (MANDATORY for t=tool nodes):
- Every t=tool node MUST include a "tool" field

DESCRIPTION FIELD (REQUIRED on every node):
- Every node MUST include a "desc" field: one short sentence (max 15 words)

═══════════════════════════════════════════════════════════════
2. WIRE EDGES
═══════════════════════════════════════════════════════════════

A) PERSONA: p=persona → start node with "Governs" label (annotation)
B) RESPONSIBILITIES: s=step "Core Responsibilities" → a=action nodes (one per responsibility)
C) METHODOLOGY: phases connect sequentially
D) GUARDS: g=guard → "Governs" to applicable flow nodes
E) ZERO CYCLES: agent specs are linear/hierarchical, no loops

═══════════════════════════════════════════════════════════════
3. RETURN THIS EXACT SHAPE
═══════════════════════════════════════════════════════════════

${SHARED_OUTPUT_SHAPE}

${SHARED_STRUCTURAL_RULES}`;
