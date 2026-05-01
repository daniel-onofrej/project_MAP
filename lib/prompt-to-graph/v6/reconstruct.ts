// ─────────────────────────────────────────────────────────────────────────────
// Prompt-to-Graph V6 — Bidirectional Reconstruction
// V6 additions: SKILL, LOOP, WARNING reverse-type mappings.
// ─────────────────────────────────────────────────────────────────────────────
import type { AgentConfig } from '../../types';
import type { GraphPlan, PlanNode, EdgeTuple, TypeCode, Ledger } from './types';
import { buildLedger } from './parse';

export function graphToPrompt(config: AgentConfig): string {
  const original = config.originalPrompt ?? '';
  if (original) {
    const allUnedited = config.nodes.every(n => {
      const cfg = n.config as any;
      if (!cfg?.logicSnippet || !cfg?.origSnippet) return true;
      return cfg.logicSnippet === cfg.origSnippet;
    });
    if (allUnedited) return original;
  }
  return reconstructFromSnippets(config, original);
}

function reconstructFromSnippets(config: AgentConfig, original: string): string {
  if (original) {
    let result = original;
    const sorted = [...config.nodes].sort(
      (a, b) => ((a.config as any)?.order ?? 0) - ((b.config as any)?.order ?? 0),
    );
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
      const origBody = stripHeadings(edit.orig);
      const currentBody = stripHeadings(edit.current);
      if (origBody && result.includes(origBody)) {
        result = result.replace(origBody, currentBody);
        applied.add(edit.orig);
      }
    }
    return result;
  }

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

  const emittedLines = new Set<string>();
  const lines: string[] = [];

  for (const section of sectionOrder) {
    const nodes = sectionNodes.get(section)!;
    const inputNode = nodes.find(n => n.type === 'STEP');
    const skipHeader = section === 'Preamble' || section === config.name;
    if (!skipHeader) {
      if (inputNode) {
        const snippet: string = (inputNode.config as any)?.logicSnippet ?? '';
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
      if (node.type === 'STEP' && node === inputNode) continue;
      const snippet: string = (node.config as any)?.logicSnippet ?? '';
      if (!snippet) continue;
      const snippetLines = snippet.split('\n');
      for (const line of snippetLines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (/^#{1,6}\s+/.test(trimmed)) continue;
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

function stripHeadings(text: string): string {
  return text
    .split('\n')
    .filter(l => !/^#{1,6}\s+/.test(l.trim()))
    .join('\n')
    .trim();
}

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
    refs: [],
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

const REVERSE_TYPE: Record<string, TypeCode> = {
  START: 'st', END: 'e', INPUT: 'i', DECISION: 'd', ACTION: 'a',
  TOOL: 't', RULE: 'ru', STEP: 's', OPTION: 'o', AGENT: 'ag',
  REFERENCE: 'ref', CONFIG: 'cf', TRIGGER: 'tr', CONDITION: 'c',
  TASK: 'ta', PERSONA: 'p', MEMORY: 'm', HANDOFF: 'h',
  LOGGING: 'lg', GUARD: 'g', RESOLUTION: 'r', GROUP: 'gr',
  // V6 additions
  SKILL: 'sk', LOOP: 'lp', WARNING: 'wp',
};

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

export function agentConfigToLedger(config: AgentConfig): Ledger {
  const promptText = config.originalPrompt ?? graphToPrompt(config);
  return buildLedger(promptText);
}
