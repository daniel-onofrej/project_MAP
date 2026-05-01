// ─────────────────────────────────────────────────────────────────────────────
// Prompt-to-Graph V6 — Shared Utilities
// Ported from V5, unchanged.
// ─────────────────────────────────────────────────────────────────────────────
import type { AgentConfig } from '../../types';

/**
 * Build a position map from an existing AgentConfig for re-sync preservation.
 * Maps node ID, logicSnippet, and label → position so that regenerated nodes
 * can be placed at the same visual position when content matches.
 */
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
