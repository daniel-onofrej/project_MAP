import dagre from 'dagre';
import type { NodeData, Connection } from '../types';

const FLOW_W = 220;
const FLOW_H = 80;
const ANNOT_W = 180;
const ANNOT_H = 60;

// Annotation types — smaller nodes, dashed borders (visual distinction only)
const ANNOTATION_TYPES = new Set([
  'RULE', 'CONFIG', 'MEMORY', 'GUARD', 'REFERENCE',
  'PERSONA', 'INPUT', 'TRIGGER',
]);

function isAnnotation(node: NodeData): boolean {
  return ANNOTATION_TYPES.has(node.type);
}

function getOrder(node: NodeData): number {
  return (node.config as any)?.order ?? 0;
}

export function applyAutoLayout(
  nodes: NodeData[],
  connections: Connection[]
): NodeData[] {
  if (nodes.length === 0) return nodes;

  // ── 1. Single Dagre graph with ALL nodes and ALL edges ──
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: 'TB',
    align: 'UL',
    nodesep: 120,
    ranksep: 100,
    marginx: 50,
    marginy: 50,
  });

  // Add ALL nodes — annotation types get smaller dimensions
  nodes.forEach(node => {
    const w = isAnnotation(node) ? ANNOT_W : FLOW_W;
    const h = isAnnotation(node) ? ANNOT_H : FLOW_H;
    dagreGraph.setNode(node.id, { width: w, height: h });
  });

  // Add ALL edges
  connections.forEach(conn => {
    dagreGraph.setEdge(conn.source, conn.target);
  });

  dagre.layout(dagreGraph);

  // ── 2. Extract positions ──
  let layoutted = nodes.map(node => {
    const pos = dagreGraph.node(node.id);
    const w = isAnnotation(node) ? ANNOT_W : FLOW_W;
    const h = isAnnotation(node) ? ANNOT_H : FLOW_H;
    return {
      ...node,
      position: {
        x: pos.x - w / 2,
        y: pos.y - h / 2,
      },
    };
  });

  // ── 3. Post-process: align branchGroup siblings ──
  const branchGroups = new Map<string, NodeData[]>();
  for (const node of layoutted) {
    const bg = (node.config as any)?.branchGroup;
    if (bg) {
      if (!branchGroups.has(bg)) branchGroups.set(bg, []);
      branchGroups.get(bg)!.push(node);
    }
  }
  for (const [, groupNodes] of branchGroups) {
    if (groupNodes.length < 2) continue;
    const avgY = groupNodes.reduce((s, n) => s + n.position.y, 0) / groupNodes.length;
    groupNodes.sort((a, b) => getOrder(a) - getOrder(b));
    const minSpacing = FLOW_W + 60;
    const needsSpread = groupNodes.some((n, i) =>
      i > 0 && Math.abs(n.position.x - groupNodes[i - 1].position.x) < minSpacing
    );
    if (needsSpread) {
      const centroidX = groupNodes.reduce((s, n) => s + n.position.x, 0) / groupNodes.length;
      const totalWidth = (groupNodes.length - 1) * minSpacing;
      const startX = centroidX - totalWidth / 2;
      groupNodes.forEach((node, i) => {
        node.position.x = startX + i * minSpacing;
      });
    }
    for (const node of groupNodes) {
      node.position.y = avgY;
    }
  }

  return resolveOverlaps(layoutted);
}

// ─────────────────────────────────────────────────────────────────────────────
// Guarantee no two nodes visually merge: push overlapping nodes apart.
// Iterates until no overlaps remain (up to MAX_ITERS passes) so that cascading
// pushes fully converge instead of leaving secondary overlaps behind.
// ─────────────────────────────────────────────────────────────────────────────
export function resolveOverlaps(nodes: NodeData[]): NodeData[] {
  const PAD_X = 50;  // extra horizontal breathing room between nodes
  const PAD_Y = 30;  // extra vertical breathing room between nodes
  const MAX_ITERS = 25;

  // Working copy (mutated in-place during iterations)
  const working = nodes.map(n => ({ ...n, position: { ...n.position } }));

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    // Sort top-to-bottom, left-to-right each pass so earlier nodes stay stable
    working.sort(
      (a, b) =>
        a.position.y - b.position.y ||
        a.position.x - b.position.x ||
        a.id.localeCompare(b.id)
    );

    let moved = false;

    for (let i = 1; i < working.length; i++) {
      const b = working[i];
      const bW = isAnnotation(b) ? ANNOT_W : FLOW_W;
      const bH = isAnnotation(b) ? ANNOT_H : FLOW_H;

      for (let j = 0; j < i; j++) {
        const a = working[j];
        const aW = isAnnotation(a) ? ANNOT_W : FLOW_W;
        const aH = isAnnotation(a) ? ANNOT_H : FLOW_H;

        // Required minimum gap between left-edges and top-edges
        const minX = Math.max(aW, bW) + PAD_X;
        const minY = Math.max(aH, bH) + PAD_Y;

        const dx = Math.abs(b.position.x - a.position.x);
        const dy = Math.abs(b.position.y - a.position.y);

        if (dx < minX && dy < minY) {
          // Push in the axis where the overlap is smallest relative to threshold
          const overlapX = minX - dx;
          const overlapY = minY - dy;

          if (overlapX <= overlapY) {
            // Push horizontally
            b.position.x = a.position.x + (b.position.x >= a.position.x ? minX : -minX);
          } else {
            // Push vertically
            b.position.y = a.position.y + (b.position.y >= a.position.y ? minY : -minY);
          }
          moved = true;
        }
      }
    }

    // If no node moved this pass, we've converged — stop early
    if (!moved) break;
  }

  // Map results back to original node order
  const posMap = new Map(working.map(n => [n.id, n.position]));
  return nodes.map(n => ({ ...n, position: posMap.get(n.id) ?? n.position }));
}
