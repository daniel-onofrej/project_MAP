// Prompt-to-Graph V6 — Loop-Pattern Specialized Prompt
import { TYPE_CODES, SHARED_LABELING_RULES, SHARED_OUTPUT_SHAPE, SHARED_STRUCTURAL_RULES } from './base';

export const LOOP_PATTERN_PROMPT = `You convert a loop/iterative/pipeline prompt into a directed acyclic graph WITH intentional back-edges for loop constructs.

Output ONLY raw JSON. No markdown fences. No prose.

You are given numbered paragraphs (§0, §1, §2, …). For each paragraph,
decide what graph node(s) it produces and how they connect.

═══════════════════════════════════════════════════════════════
1. CLASSIFY EACH PARAGRAPH
═══════════════════════════════════════════════════════════════

Loop-pattern patterns to recognize:

  TEXT PATTERN                                      → TYPE
  ──────────────────────────────────────────────────────────
  "Loop", "Repeat", "Iterate", "Until converged"   → lp=loop (entry gate)
  Phase inside loop: "Phase N", "Step N"            → s=step (child of lp=loop)
  "Continue?", "Converged?", exit condition         → d=decision (with Yes→exit, No→back to lp)
  "invoke X skill", "use X skill"                   → sk=skill
  "Don't", "Never", anti-pattern                   → wp=warning
  "You are [role]"                                  → p=persona
  Pure policy                                       → ru=rule
  Guard                                             → g=guard
  Tool usage                                        → t=tool
  Trigger / activation                              → tr=trigger

Type codes: ${TYPE_CODES}

${SHARED_LABELING_RULES}

LOOP NODE (lp=loop) — CRITICAL:
- Every repeating cycle MUST start with an lp=loop node
- lp=loop is the ENTRY GATE for the loop body
- Phases/steps inside the loop connect DOWNSTREAM from lp=loop
- The LAST phase connects back to lp=loop (this IS a back-edge — it is intentional and ALLOWED)
- Exit condition: d=decision connected from last phase
  - "Yes, converged" → exits loop (edge to downstream flow)
  - "No" → edge back to lp=loop (the back-edge)
- Multiple loop patterns in same prompt → separate lp=loop nodes with distinct labels
- Label the loop name: "Refine Until Converged", "Iteration Loop", "Review Cycle"

LOOP STRUCTURE TEMPLATE:
  lp "Refine Until Converged"
    → s "Phase 1: Draft"
    → s "Phase 2: Review"
    → d "Converged?"
        →(Yes)→ [next flow outside loop]
        →(No)→ lp "Refine Until Converged"  ← intentional back-edge

BACK-EDGE RULE:
- Back-edges ARE ALLOWED when they point TO an lp=loop node
- Every lp=loop node MUST have at least one exit edge (not a back-edge)
- All other cycles are FORBIDDEN

SKILL NODE (sk=skill):
- Use for skill invocations within the loop phases
- Fits naturally at the point it's called in the loop

WARNING NODE (wp=warning):
- Use for anti-pattern docs ("never do X during iteration")
- Connect with "Governs" edges

TOOL FIELD (MANDATORY for t=tool nodes):
- Every t=tool node MUST include a "tool" field

DESCRIPTION FIELD (REQUIRED on every node):
- Every node MUST include a "desc" field: one short sentence (max 15 words)

═══════════════════════════════════════════════════════════════
2. WIRE EDGES
═══════════════════════════════════════════════════════════════

A) SEQUENTIAL: phases inside loop chain sequentially downstream of lp=loop
B) BACK-EDGES: last phase → d=decision → (No) → lp=loop (INTENTIONAL, KEEP)
C) EXIT: d=decision → (Yes) → next downstream node outside the loop
D) MULTIPLE LOOPS: connect loop exit to next loop's lp=loop entry
E) SKILLS: sk=skill in flow at point of invocation
F) WARNINGS: wp=warning → "Governs" edges

EDGE LABELS for loop back-edges: use "Loop Back" or the convergence condition

═══════════════════════════════════════════════════════════════
3. RETURN THIS EXACT SHAPE
═══════════════════════════════════════════════════════════════

${SHARED_OUTPUT_SHAPE}

${SHARED_STRUCTURAL_RULES}`;
