import type { NodeData, Connection } from '@/lib/types';

/** A single collapsed chip to render inside a parent node */
export interface CollapsedOptionChip {
  id: string;
  label: string;
  /** The node type, used for chip color */
  nodeType: string;
}

/** Full result of the detection pass */
export interface CollapseResult {
  /** Set of node IDs that should be hidden from the canvas */
  hiddenNodeIds: Set<string>;
  /** Set of edge IDs that should be hidden (P→child and child→T) */
  hiddenEdgeIds: Set<string>;
  /** Map from parent node ID to its chips */
  chipsByParent: Map<string, CollapsedOptionChip[]>;
  /** Synthetic bypass edges: parent → shared downstream target (OPTION groups only) */
  syntheticEdges: Array<{ id: string; source: string; target: string }>;
}

const EMPTY_RESULT: CollapseResult = {
  hiddenNodeIds: new Set(),
  hiddenEdgeIds: new Set(),
  chipsByParent: new Map(),
  syntheticEdges: [],
};

/** Node types that always collapse as chips into their parent */
const LEAF_CHIP_TYPES = new Set(['REFERENCE']);

/** Node types that collapse only when all siblings share the same downstream target */
const FLOW_CHIP_TYPES = new Set(['OPTION']);

/**
 * Detect child nodes that can be collapsed into their parent as pill/chip tags.
 *
 * Two patterns:
 * 1. OPTION children: Parent P has 2+ OPTION children, each with exactly 1 outgoing
 *    edge all targeting the same node T → collapse into P, add synthetic P→T edge.
 * 2. REFERENCE children: Parent P has 2+ REFERENCE children → collapse into P
 *    as leaf chips regardless of their outgoing edges. No synthetic edge needed.
 */
export function detectCollapsibleOptions(
  nodes: NodeData[],
  connections: Connection[],
): CollapseResult {
  if (nodes.length === 0 || connections.length === 0) return EMPTY_RESULT;

  const nodeById = new Map(nodes.map(n => [n.id, n]));

  // Build outgoing edges keyed by source
  const outgoingBySource = new Map<string, Connection[]>();
  for (const conn of connections) {
    const list = outgoingBySource.get(conn.source);
    if (list) list.push(conn);
    else outgoingBySource.set(conn.source, [conn]);
  }

  const hiddenNodeIds = new Set<string>();
  const hiddenEdgeIds = new Set<string>();
  const chipsByParent = new Map<string, CollapsedOptionChip[]>();
  const syntheticEdges: CollapseResult['syntheticEdges'] = [];

  for (const parentNode of nodes) {
    const outEdges = outgoingBySource.get(parentNode.id);
    if (!outEdges) continue;

    const allChips: CollapsedOptionChip[] = [];

    // ── Pattern 1: OPTION children (flow chips) ────────────────────────────
    const optionChildren: NodeData[] = [];
    const optionEdgeIds: string[] = [];
    for (const edge of outEdges) {
      const target = nodeById.get(edge.target);
      if (target && FLOW_CHIP_TYPES.has(target.type)) {
        optionChildren.push(target);
        optionEdgeIds.push(edge.id);
      }
    }

    if (optionChildren.length >= 2) {
      let sharedTarget: string | null = null;
      let allMatch = true;
      const downstreamEdgeIds: string[] = [];

      for (const option of optionChildren) {
        const optOutEdges = outgoingBySource.get(option.id);
        if (!optOutEdges || optOutEdges.length !== 1) { allMatch = false; break; }
        const targetId = optOutEdges[0].target;
        downstreamEdgeIds.push(optOutEdges[0].id);
        if (sharedTarget === null) sharedTarget = targetId;
        else if (targetId !== sharedTarget) { allMatch = false; break; }
      }

      if (allMatch && sharedTarget !== null) {
        for (const opt of optionChildren) {
          hiddenNodeIds.add(opt.id);
          allChips.push({ id: opt.id, label: opt.label, nodeType: opt.type });
        }
        for (const eid of optionEdgeIds) hiddenEdgeIds.add(eid);
        for (const eid of downstreamEdgeIds) hiddenEdgeIds.add(eid);
        syntheticEdges.push({
          id: `__synth_${parentNode.id}_${sharedTarget}`,
          source: parentNode.id,
          target: sharedTarget,
        });
      }
    }

    // ── Pattern 2: REFERENCE children (leaf chips) ─────────────────────────
    const refChildren: NodeData[] = [];
    const refEdgeIds: string[] = [];
    for (const edge of outEdges) {
      const target = nodeById.get(edge.target);
      if (target && LEAF_CHIP_TYPES.has(target.type)) {
        refChildren.push(target);
        refEdgeIds.push(edge.id);
      }
    }

    if (refChildren.length >= 2) {
      for (const ref of refChildren) {
        hiddenNodeIds.add(ref.id);
        allChips.push({ id: ref.id, label: ref.label, nodeType: ref.type });
      }
      for (const eid of refEdgeIds) hiddenEdgeIds.add(eid);
    }

    if (allChips.length > 0) {
      chipsByParent.set(parentNode.id, allChips);
    }
  }

  if (hiddenNodeIds.size === 0) return EMPTY_RESULT;

  return { hiddenNodeIds, hiddenEdgeIds, chipsByParent, syntheticEdges };
}
