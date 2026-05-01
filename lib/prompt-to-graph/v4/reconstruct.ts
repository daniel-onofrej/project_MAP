// ─────────────────────────────────────────────────────────────────────────────
// Prompt-to-Graph V4 — Bidirectional Reconstruction
//
// graph → prompt: Reconstruct the original prompt from a graph.
// prompt → graph: Re-parse an existing compact JSON back into a GraphPlan.
//
// Each node stores its verbatim source text in config.logicSnippet.
// Reconstruction groups nodes by section and reassembles the markdown.
// ─────────────────────────────────────────────────────────────────────────────
import type { AgentConfig } from '../../types';
import type { GraphPlan, PlanNode, EdgeTuple, TypeCode, Ledger } from './types';
import { buildLedger } from './parse';

// ── graph → prompt ───────────────────────────────────────────────────────────

/**
 * Reconstruct a markdown prompt from an AgentConfig.
 *
 * Strategy:
 *  1. If the original prompt exists AND no node snippets have been edited,
 *     return the original prompt verbatim (perfect 1:1 match).
 *  2. Otherwise, reconstruct from node snippets with line-level deduplication
 *     to avoid repeating shared paragraphs.
 */
export function graphToPrompt(config: AgentConfig): string {
  const original = config.originalPrompt ?? '';

  // ── Fast path: unedited graph → return original prompt verbatim ──────────
  if (original) {
    const allUnedited = config.nodes.every(n => {
      const cfg = n.config as any;
      if (!cfg?.logicSnippet || !cfg?.origSnippet) return true;
      return cfg.logicSnippet === cfg.origSnippet;
    });
    if (allUnedited) return original;
  }

  // ── Slow path: reconstruct from snippets ─────────────────────────────────
  return reconstructFromSnippets(config, original);
}

/**
 * Rebuild the prompt from node snippets, handling edits.
 *
 * If the original prompt is available, we splice edits into it:
 *   - Find each edited node's `origSnippet` in the original
 *   - Replace it with the current `logicSnippet`
 *
 * If no original prompt, reconstruct from scratch with line-level dedup.
 */
function reconstructFromSnippets(config: AgentConfig, original: string): string {
  // ── Approach A: splice edits into original prompt ────────────────────────
  if (original) {
    let result = original;
    const sorted = [...config.nodes].sort(
      (a, b) => ((a.config as any)?.order ?? 0) - ((b.config as any)?.order ?? 0),
    );
    // Process longest origSnippets first to avoid partial-match conflicts
    const edits = sorted
      .filter(n => {
        const cfg = n.config as any;
        return cfg?.logicSnippet && cfg?.origSnippet && cfg.logicSnippet !== cfg.origSnippet;
      })
      .map(n => ({
        orig: (n.config as any).origSnippet as string,
        current: (n.config as any).logicSnippet as string,
      }))
      .sort((a, b) => b.orig.length - a.orig.length);

    const applied = new Set<string>();
    for (const edit of edits) {
      if (applied.has(edit.orig)) continue;
      // Strip heading lines from both orig and current when searching in the prompt
      const origBody = stripHeadings(edit.orig);
      const currentBody = stripHeadings(edit.current);
      if (origBody && result.includes(origBody)) {
        result = result.replace(origBody, currentBody);
        applied.add(edit.orig);
      }
    }
    return result;
  }

  // ── Approach B: full reconstruction (no original available) ──────────────
  const sorted = [...config.nodes].sort(
    (a, b) => ((a.config as any)?.order ?? 0) - ((b.config as any)?.order ?? 0),
  );

  const sectionOrder: string[] = [];
  const sectionNodes = new Map<string, typeof sorted>();

  for (const node of sorted) {
    const section: string = (node.config as any)?.sourceSection || 'General';
    if (!sectionNodes.has(section)) {
      sectionOrder.push(section);
      sectionNodes.set(section, []);
    }
    sectionNodes.get(section)!.push(node);
  }

  // Line-level deduplication: track every non-heading line we've emitted
  const emittedLines = new Set<string>();
  const lines: string[] = [];

  for (const section of sectionOrder) {
    const nodes = sectionNodes.get(section)!;

    // Check if there's a STEP entry node for this section — use its snippet as the heading
    const inputNode = nodes.find(n => n.type === 'STEP');

    // Emit section header (skip preamble/title)
    const skipHeader = section === 'Preamble' || section === config.name;
    if (!skipHeader) {
      if (inputNode) {
        const snippet: string = (inputNode.config as any)?.logicSnippet ?? '';
        // If the snippet IS a heading line, emit it directly
        if (/^#{1,6}\s+/.test(snippet.trim())) {
          lines.push(snippet.trim());
        } else {
          lines.push(`## ${section}`);
        }
      } else {
        lines.push(`## ${section}`);
      }
    }

    for (const node of nodes) {
      // Skip STEP entry nodes — their heading is already emitted above
      if (node.type === 'STEP' && node === inputNode) continue;

      const snippet: string = (node.config as any)?.logicSnippet ?? '';
      if (!snippet) continue;

      // Split snippet into individual lines, skip heading lines (already emitted as section header),
      // and deduplicate at the line level
      const snippetLines = snippet.split('\n');
      for (const line of snippetLines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Skip heading lines — they're already in section headers
        if (/^#{1,6}\s+/.test(trimmed)) continue;
        // Skip if this exact line was already emitted
        const key = trimmed.toLowerCase();
        if (emittedLines.has(key)) continue;
        emittedLines.add(key);
        lines.push(line);
      }
    }

    lines.push('');
  }

  return lines.join('\n').trim();
}

/** Strip heading lines (## ...) from a snippet for matching against the prompt body. */
function stripHeadings(text: string): string {
  return text
    .split('\n')
    .filter(l => !/^#{1,6}\s+/.test(l.trim()))
    .join('\n')
    .trim();
}

// ── compact JSON → GraphPlan ─────────────────────────────────────────────────

/**
 * Parse a compact JSON string back into a GraphPlan.
 *
 * Compact format: {"m":[...], "g":{"n":[[id,type,label,text,...]], "e":[[src,tgt,label?]]}}
 */
export function compactToGraphPlan(compactJson: string): GraphPlan {
  const data = JSON.parse(compactJson);
  const m = data.m ?? [];
  const g = data.g ?? {};

  const meta = {
    agent_id: m[0] ?? '',
    persona: m[1] ?? '',
    tone: m[2] ?? '',
    version: m[3] ?? '',
    description: m[4] ?? '',
  };

  const nodes: PlanNode[] = (g.n ?? []).map((tuple: any[]) => ({
    id: Number(tuple[0]),
    type: (tuple[1] ?? 'a') as TypeCode,
    label: tuple[2] ?? '',
    refs: [],           // Refs can be rebuilt from text via ledger
    tool: tuple[4] ?? undefined,
    outcome: tuple[5] ?? undefined,
  }));

  const edges: EdgeTuple[] = (g.e ?? []).map((tuple: any[]) =>
    tuple[2] != null
      ? [Number(tuple[0]), Number(tuple[1]), String(tuple[2])] as EdgeTuple
      : [Number(tuple[0]), Number(tuple[1])] as EdgeTuple,
  );

  return { meta, nodes, edges };
}

// ── AgentConfig → GraphPlan (for round-trip editing) ─────────────────────────

const REVERSE_TYPE: Record<string, TypeCode> = {
  START: 'st', END: 'e', INPUT: 'i', DECISION: 'd', ACTION: 'a',
  TOOL: 't', RULE: 'ru', STEP: 's', OPTION: 'o', AGENT: 'ag',
  REFERENCE: 'ref', CONFIG: 'cf', TRIGGER: 'tr', CONDITION: 'c',
  TASK: 'ta', PERSONA: 'p', MEMORY: 'm', HANDOFF: 'h',
  LOGGING: 'lg', GUARD: 'g', RESOLUTION: 'r', GROUP: 'gr',
};

/**
 * Convert an AgentConfig back into a GraphPlan for re-editing or re-generation.
 */
export function agentConfigToGraphPlan(config: AgentConfig): GraphPlan {
  const nodes: PlanNode[] = config.nodes.map(n => ({
    id: parseInt(n.id.replace(/^n/, ''), 10) || 0,
    type: REVERSE_TYPE[n.type] ?? 'a',
    label: n.label,
    refs: [],
    tool: (n.config as any)?.tool ?? undefined,
    outcome: (n.config as any)?.outcome ?? undefined,
    scope: (n.config as any)?.ruleScope === 'global' ? 'g' as const
      : (n.config as any)?.ruleScope === 'scoped' ? 's' as const
      : undefined,
    governs: ((n.config as any)?.appliesTo as string[] | null)
      ?.map(id => parseInt(id.replace(/^n/, ''), 10))
      .filter(Number.isFinite) ?? undefined,
  }));

  const edges: EdgeTuple[] = config.connections.map(c => {
    const src = parseInt(c.source.replace(/^n/, ''), 10);
    const tgt = parseInt(c.target.replace(/^n/, ''), 10);
    return c.condition ? [src, tgt, c.condition] as EdgeTuple : [src, tgt] as EdgeTuple;
  });

  return {
    meta: {
      agent_id: config.id,
      persona: config.name,
      tone: '',
      version: config.version,
      description: config.description ?? '',
    },
    nodes,
    edges,
  };
}

// ── Full round-trip: AgentConfig → prompt → AgentConfig ──────────────────────

/**
 * Rebuild a Ledger from an AgentConfig (for re-generation).
 *
 * Uses the reconstructed prompt text to build a fresh ledger,
 * enabling the full forward pipeline to rerun.
 */
export function agentConfigToLedger(config: AgentConfig): Ledger {
  const promptText = config.originalPrompt ?? graphToPrompt(config);
  return buildLedger(promptText);
}
