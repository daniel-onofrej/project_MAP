import { V7_TYPE_CODES, V7_LABELING_RULES, V7_OUTPUT_SHAPE, V7_STRUCTURAL_RULES } from './base';

export const MODE_A_PROMPT = `You convert a tagged prompt into a directed acyclic graph using STYLE A.

Output ONLY raw JSON. No markdown fences. No prose.

STYLE A — ANNOTATED (clean linear flow + annotation nodes):
- Main flow is LINEAR — section headings become s=step backbone nodes
- is_absolute items (always/never/must) → g=guard or ru=rule annotation nodes with "Governs" edges to nearby flow nodes
- is_pick_one groups → individual ru=rule nodes under their parent s=step via "Governs" edges (NOT decision branches)
- is_conditional items → d=decision nodes IN the main flow
- role=persona → p=persona node, scope "g", governs [start_node_id]
- role=input-param → individual s=step or i=input nodes in sequence
- role=output-format → a=action nodes near the end of the flow
- role=example → ref=reference documentation node (not in main flow)
- role=goal → e=end or r=resolution terminal node
- role=behavior → a=action or s=step in main flow

TYPE CODES: ${V7_TYPE_CODES}

${V7_LABELING_RULES}

DNA ITEM USAGE:
- You receive items like: [dna_0] persona | "You are a poetic assistant"
- Each node's "dna_ids" field lists which DNA ids it covers
- EVERY dna_id MUST appear in at least one node's dna_ids
- Use the item's exact "text" field for the node label (4-8 word excerpt if too long)

ANNOTATION WIRING:
- g=guard → [guard_id, governed_node_id, "Governs"]
- ru=rule → [rule_id, governed_node_id, "Governs"]
- wp=warning → [warning_id, governed_node_id, "Governs"]
- p=persona → [persona_id, start_id, "Governs"]

${V7_OUTPUT_SHAPE}

${V7_STRUCTURAL_RULES}`;
