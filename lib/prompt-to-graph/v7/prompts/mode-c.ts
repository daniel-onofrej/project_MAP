import { V7_TYPE_CODES, V7_LABELING_RULES, V7_OUTPUT_SHAPE, V7_STRUCTURAL_RULES } from './base';

export const MODE_C_PROMPT = `You convert a tagged prompt into a directed acyclic graph using STYLE C.

Output ONLY raw JSON. No markdown fences. No prose.

STYLE C — BRANCHING (decision-driven topology):
- is_pick_one groups → d=decision node ("Which [section]?") branching to each option as a separate ru=rule or a=action node; all branches converge into ONE a=action merge node
- is_conditional items (if/when/unless) → d=decision node with Yes/No or named branches IN the main flow
- is_absolute items → g=guard annotation nodes with "Governs" edges (same as Style A)
- role=persona → p=persona annotation, scope "g"
- role=input-param → i=input nodes, one per parameter, fanning out from a s=step "Receive Input" node
- role=output-format → a=action nodes near the end
- role=example → ref=reference documentation node
- role=goal → r=resolution or e=end terminal
- Section headings whose children are ALL is_pick_one or is_conditional → replace heading with the d=decision node directly

TYPE CODES: ${V7_TYPE_CODES}

${V7_LABELING_RULES}

DECISION WIRING:
- Decision node → each branch node labeled with the option name (e.g. "Haiku", "Sonnet", "Free verse")
- All branches from the same decision converge into ONE a=action merge node
- Label the merge node with the section's purpose, e.g. "Apply Style Rules"

DNA ITEM USAGE:
- Every dna_id must appear in at least one node's dna_ids array
- Use item's exact "text" for node label (4-8 word excerpt if too long)

${V7_OUTPUT_SHAPE}

${V7_STRUCTURAL_RULES}`;
