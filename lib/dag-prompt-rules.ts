// DAG structural rules injected into AI system prompts when enabled in settings.
// Each export is tailored for its context: creation, editing, or analysis.

export const DAG_RULES_FOR_CREATION = `
## DAG Structural Constraints (MANDATORY)

The graph you produce MUST be a valid Directed Acyclic Graph (DAG). Verify these rules before outputting:

1. **No self-loops** — No edge where source === target
2. **No directed cycles** — No path A → B → ... → A. Every edge must flow forward
3. **At least one source node** — At least one node with zero incoming edges (typically START)
4. **At least one sink node** — At least one node with zero outgoing edges (typically END)
5. **Topologically sortable** — All nodes can be ordered so every edge goes from earlier to later
6. **All nodes reachable** — Every node must be reachable from at least one source node via directed edges
7. **All nodes can reach a sink** — Every node must have a directed path to at least one sink node
8. **No duplicate edges** — No two edges with the same (source, target) pair
9. **Connected graph** — The graph should form a single connected component (treating edges as undirected)

If you detect that your planned graph would violate any of these rules, restructure the edges to fix the violation before outputting. Report any structural compromises in the conflicts array.`;

export const DAG_RULES_FOR_EDITING = `
## DAG Structural Constraints (MANDATORY)

Your edits MUST maintain valid DAG structure. Before outputting, verify:

1. **No self-loops** — Never create an edge where source === target
2. **No cycles** — Your new/updated edges must not create any directed cycle A → B → ... → A
3. **Preserve sources and sinks** — Don't remove the last source (in-degree 0) or last sink (out-degree 0) node
4. **Reachability** — New nodes must be reachable from a source and have a path to a sink
5. **No duplicate edges** — Don't add an edge if the same (source, target) pair already exists
6. **Connectivity** — Don't create isolated subgraphs disconnected from the main flow

If an edit request would inherently require a cycle (e.g., "make A loop back to B"), note the DAG violation in the summary and suggest an alternative structure (e.g., a loop/retry node instead of a back-edge).`;

export const DAG_RULES_FOR_ANALYSIS = `
### CATEGORY: dag-structure

In addition to semantic analysis, analyze the graph for DAG structural issues that deterministic checks might miss or that have semantic implications:

#### 9 — Potential Cycle Risk
A decision branch or handoff that semantically implies a loop-back (e.g., "retry", "go back to step 1", "re-evaluate") but is wired as a forward edge. The graph is technically acyclic but the agent's behavior would create implicit cycles at runtime.

Output format:
- type: "dag_cycle_risk"
- category: "dag-structure"

#### 10 — Semantic Reachability Concern
A node that is technically reachable but is practically unreachable due to contradictory edge conditions (e.g., the conditions on all incoming edges are mutually exclusive with the preceding decision logic).

Output format:
- type: "dag_reachability_concern"
- category: "dag-structure"

#### 11 — Redundant Path
Two or more paths that perform semantically identical operations, suggesting the graph could be simplified via transitive reduction or node merging.

Output format:
- type: "dag_redundant_path"
- category: "dag-structure"`;
