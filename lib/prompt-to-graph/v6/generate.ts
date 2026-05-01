// ─────────────────────────────────────────────────────────────────────────────
// Prompt-to-Graph V6 — Pipeline Orchestrator
//
// Clean single-call pipeline with pre-processing and type classification:
//   Stage -1 (code)  parseFrontmatter + condenseCodeBlocks
//   Stage 0  (code)  parse prompt → Ledger
//   Stage 0.5(LLM)   classifyPromptType → PromptType
//   Stage 1  (LLM)   single call with specialized system prompt → GraphPlan
//   Stage 2  (code)  validate + fix cycles (loop-aware)
//   Stage 3  (code)  materialize  → AgentConfig + compact JSON
//   Stage 3.5(code)  analyzePermissions → permissionsManifest
//
// V6 improvements over V5:
//  1. Pre-processing (parseFrontmatter + condenseCodeBlocks)
//  2. Prompt type classification → 4 specialized system prompts
//  3. Loop-aware removeCycles (back-edges to lp=loop nodes are kept)
//  4. UNEXITED_LOOP validation + auto-repair
//  5. New TYPE_MAP entries: sk=SKILL, lp=LOOP, wp=WARNING
//  6. SKILL/LOOP/WARNING node config enrichment
//  7. Stage 3.5 analyzePermissions → agentConfig.permissionsManifest
//  8. promptCategory + generatedWith stored on agentConfig
// ─────────────────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';
import type { AgentConfig, NodeData, Connection } from '../../types';
import { DEFAULT_GEMINI_MODEL } from '../../types';
import { applyAutoLayout } from '../../graph/auto-layout';
import { buildLedger, formatLedger, resolveRefs } from './parse';
import { parseFrontmatter, condenseCodeBlocks } from './preprocess';
import { classifyPromptType } from './classify';
import { analyzePermissions } from './analyze-permissions';
import { BUSINESS_FLOW_PROMPT } from './prompts/business-flow';
import { SKILL_WORKFLOW_PROMPT } from './prompts/skill-workflow';
import { AGENT_SPEC_PROMPT } from './prompts/agent-spec';
import { LOOP_PATTERN_PROMPT } from './prompts/loop-pattern';
import { REPAIR_PROMPT_V6 } from './prompts/base';
import type {
  EdgeTuple,
  GraphPlan,
  Ledger,
  PlanNode,
  TokenUsage,
  TypeCode,
  V6Options,
  V6Result,
  PromptType,
} from './types';

export const V6_MODEL = DEFAULT_GEMINI_MODEL;

// ── Type code → display type ──────────────────────────────────────────────────

const TYPE_MAP: Record<TypeCode, string> = {
  st: 'START', e: 'END', i: 'INPUT', d: 'DECISION', a: 'ACTION',
  t: 'TOOL', ru: 'RULE', s: 'STEP', o: 'OPTION', ag: 'AGENT',
  ref: 'REFERENCE', cf: 'CONFIG', tr: 'TRIGGER', c: 'CONDITION',
  ta: 'TASK', p: 'PERSONA', m: 'MEMORY', h: 'HANDOFF',
  lg: 'LOGGING', g: 'GUARD', r: 'RESOLUTION', gr: 'GROUP',
  // V6 additions
  sk: 'SKILL', lp: 'LOOP', wp: 'WARNING',
};

const VALID_CODES = new Set(Object.keys(TYPE_MAP));

/** Deterministic hash → hex string for generating stable child agent IDs. */
function djb2Hex(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

// ── JSON parsing ──────────────────────────────────────────────────────────────

function parseJson<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned) as T;
}

// ── Normalization ─────────────────────────────────────────────────────────────

function normType(val: unknown): TypeCode {
  if (typeof val === 'string' && VALID_CODES.has(val)) return val as TypeCode;
  return 'a';
}

function normRefs(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String).filter(s => /^§/.test(s) || /^\d+$/.test(s));
  if (typeof val === 'string') return val.split(/[\s,]+/).filter(s => /^§/.test(s) || /^\d+$/.test(s));
  return [];
}

function normPlan(raw: any): GraphPlan {
  const meta = raw?.meta ?? {};
  const nodes: PlanNode[] = (Array.isArray(raw?.nodes) ? raw.nodes : []).map((n: any, i: number) => ({
    id: Math.max(1, Math.trunc(Number(n?.id ?? i + 1))),
    type: normType(n?.type),
    label: typeof n?.label === 'string' ? n.label : `Node ${i + 1}`,
    refs: normRefs(n?.refs),
    tool: typeof n?.tool === 'string' ? n.tool : undefined,
    outcome: typeof n?.outcome === 'string' ? n.outcome : undefined,
    scope: n?.scope === 'g' || n?.scope === 's' ? n.scope : undefined,
    governs: Array.isArray(n?.governs) ? n.governs.map(Number).filter(Number.isFinite) : undefined,
    desc: typeof n?.desc === 'string' ? n.desc : undefined,
  }));

  const edges: EdgeTuple[] = (Array.isArray(raw?.edges) ? raw.edges : [])
    .map((e: any): EdgeTuple | null => {
      if (Array.isArray(e)) {
        const src = Math.trunc(Number(e[0]));
        const tgt = Math.trunc(Number(e[1]));
        if (!Number.isFinite(src) || !Number.isFinite(tgt) || src < 1 || tgt < 1) return null;
        return [src, tgt, e[2] != null ? String(e[2]) : undefined];
      }
      return null;
    })
    .filter((e: EdgeTuple | null): e is EdgeTuple => e !== null);

  return {
    meta: {
      agent_id: typeof meta.agent_id === 'string' ? meta.agent_id : '',
      persona: typeof meta.persona === 'string' ? meta.persona : '',
      tone: typeof meta.tone === 'string' ? meta.tone : '',
      version: typeof meta.version === 'string' ? meta.version : '',
      description: typeof meta.description === 'string' ? meta.description : '',
    },
    nodes,
    edges,
  };
}

// ── Rule-reference edge detection ─────────────────────────────────────────────

/**
 * An edge is a rule-reference (cross-rule jump) if its label mentions applying,
 * going to, or referencing another rule/step section. These should be preserved
 * across cycle removal even when they form a topological back-edge, because
 * "Rule C exception: apply Rule B instead" is a legitimate delegation.
 */
const RULE_REF_LABEL_RE = /\b(apply|go to|see|per|use|jump to)\s+(rule|step)\s+[A-Z0-9]/i;
const RULE_REF_TARGET_HINT_RE = /\(rule\s+[A-Z0-9]\)/i;

function isRuleRefEdge(edge: EdgeTuple): boolean {
  const label = edge[2];
  if (!label) return false;
  return RULE_REF_LABEL_RE.test(label) || RULE_REF_TARGET_HINT_RE.test(label);
}

// ── Cycle detection + removal (loop-aware) ────────────────────────────────────

export function removeCycles(plan: GraphPlan): GraphPlan {
  const adj = new Map<number, number[]>();
  for (const [src, tgt] of plan.edges) {
    if (!adj.has(src)) adj.set(src, []);
    adj.get(src)!.push(tgt);
  }

  // Build set of lp=loop node ids
  const loopNodeIds = new Set(plan.nodes.filter(n => n.type === 'lp').map(n => n.id));

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<number, number>();
  const backEdges = new Set<string>();

  for (const n of plan.nodes) color.set(n.id, WHITE);

  function dfs(u: number) {
    color.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      if (color.get(v) === GRAY) backEdges.add(`${u}->${v}`);
      else if (color.get(v) === WHITE) dfs(v);
    }
    color.set(u, BLACK);
  }

  const start = plan.nodes.find(n => n.type === 'st');
  if (start) dfs(start.id);
  for (const n of plan.nodes) {
    if (color.get(n.id) === WHITE) dfs(n.id);
  }

  if (backEdges.size === 0) return plan;

  const terminal = plan.nodes.find(n => n.type === 'h')
    ?? plan.nodes.find(n => n.type === 'e')
    ?? plan.nodes.find(n => n.type === 'r');
  const reroutedSources = new Set<number>();

  const filtered: EdgeTuple[] = [];
  for (const edge of plan.edges) {
    const key = `${edge[0]}->${edge[1]}`;
    if (backEdges.has(key)) {
      // EXCEPTION: back-edge that points TO an lp=loop node → KEEP (intentional loop-back)
      if (loopNodeIds.has(edge[1])) {
        filtered.push(edge);
        continue;
      }
      // EXCEPTION: rule-reference edge ("apply Rule B") → KEEP (cross-rule delegation)
      if (isRuleRefEdge(edge)) {
        filtered.push(edge);
        continue;
      }
      // All other back-edges: remove and reroute to terminal
      if (terminal && !reroutedSources.has(edge[0]) && edge[0] !== terminal.id) {
        filtered.push([edge[0], terminal.id, 'Escalate (cycle removed)']);
        reroutedSources.add(edge[0]);
      }
      continue;
    }
    filtered.push(edge);
  }

  return { ...plan, edges: filtered };
}

// ── Connectivity enforcement ──────────────────────────────────────────────────

const ANNOTATION_TYPES = new Set<TypeCode>(['p', 'ru', 'cf', 'g', 'ref', 'tr', 'm']);

/** Priority order for picking a section's logical entry node (higher index first). */
const ENTRY_TYPE_PRIORITY: TypeCode[] = ['s', 'd', 'ru', 'a', 't'];

function entryTypeRank(t: TypeCode): number {
  const i = ENTRY_TYPE_PRIORITY.indexOf(t);
  return i === -1 ? ENTRY_TYPE_PRIORITY.length : i;
}

/** Return the section name that a PlanNode is bound to, via its first ref. */
function nodeSection(node: PlanNode, ledger: Ledger): string | null {
  for (const ref of node.refs) {
    const p = ledger.paragraphs.find(lp => lp.ref === ref);
    if (p) return p.section;
  }
  return null;
}

/**
 * Given a section name, pick its logical entry node by type priority + ref order.
 * Prefers `s` step headers, then `d` decisions, then `ru` rules.
 */
function pickSectionEntry(section: string, plan: GraphPlan, ledger: Ledger): PlanNode | null {
  const inSection = plan.nodes.filter(n => nodeSection(n, ledger) === section && n.type !== 'st');
  if (inSection.length === 0) return null;
  return inSection.slice().sort((a, b) => {
    const ra = entryTypeRank(a.type);
    const rb = entryTypeRank(b.type);
    if (ra !== rb) return ra - rb;
    return a.id - b.id;
  })[0];
}

/**
 * Ensure the start node has exactly one default outgoing edge to the first
 * trigger node (if any). Stray default edges from start to non-trigger flow
 * nodes are removed (they were added by blind orphan wiring in an earlier pass).
 * Governs / annotation edges are left alone.
 */
function wireStartToTrigger(plan: GraphPlan): GraphPlan {
  const start = plan.nodes.find(n => n.type === 'st');
  if (!start) return plan;
  const trigger = plan.nodes.find(n => n.type === 'tr');
  if (!trigger) return plan;

  const hasTriggerEdge = plan.edges.some(([s, t]) => s === start.id && t === trigger.id);

  const filtered = plan.edges.filter(([s, t, label]) => {
    if (s !== start.id) return true;
    // Keep annotation-style edges (Governs, etc.) untouched
    if (label && /govern/i.test(label)) return true;
    // Keep edge to the trigger
    if (t === trigger.id) return true;
    // Drop stray default edges from start → non-trigger flow nodes
    const target = plan.nodes.find(n => n.id === t);
    if (target && !ANNOTATION_TYPES.has(target.type)) return false;
    return true;
  });

  const edges: EdgeTuple[] = hasTriggerEdge
    ? filtered
    : [...filtered, [start.id, trigger.id, 'default']];

  return { ...plan, edges };
}

/**
 * Scan node labels/refs for cross-rule references ("apply Rule B", "(Rule C)")
 * and add explicit edges to the referenced rule/step section's entry node.
 * Also retargets decision-branch edges whose label hints at a rule but whose
 * current target is not that rule's entry node.
 */
export function wireRuleReferences(plan: GraphPlan, ledger: Ledger): GraphPlan {
  const RULE_MENTION_RE = /\b(?:apply|go to|see|per|use|jump to)\s+(?:rule|step)\s+([A-Z0-9])\b/gi;
  const BRANCH_HINT_RE = /\((?:rule|step)\s+([A-Z0-9])\)/i;

  // Build a map: rule letter ("B", "C", ...) → entry node id
  const ruleEntryByLetter = new Map<string, number>();
  for (const section of new Set(ledger.paragraphs.map(p => p.section))) {
    const m = section.match(/^\s*(?:Rule|Step)\s+([A-Z0-9])\b/i);
    if (!m) continue;
    const letter = m[1].toUpperCase();
    const entry = pickSectionEntry(section, plan, ledger);
    if (entry) ruleEntryByLetter.set(letter, entry.id);
  }

  // Also fall back to matching node labels like "Rule B — Standard Window Check"
  for (const n of plan.nodes) {
    const m = n.label.match(/^\s*(?:Rule|Step)\s+([A-Z0-9])\b/i);
    if (!m) continue;
    const letter = m[1].toUpperCase();
    if (!ruleEntryByLetter.has(letter)) ruleEntryByLetter.set(letter, n.id);
  }

  if (ruleEntryByLetter.size === 0) return plan;

  const existing = new Set(plan.edges.map(([s, t]) => `${s}->${t}`));
  const extra: EdgeTuple[] = [];

  // Retarget decision branches whose label hints at a rule but targets elsewhere.
  const retargeted: EdgeTuple[] = plan.edges.map((edge) => {
    const [src, tgt, label] = edge;
    if (!label) return edge;
    const m = label.match(BRANCH_HINT_RE);
    if (!m) return edge;
    const letter = m[1].toUpperCase();
    const entryId = ruleEntryByLetter.get(letter);
    if (!entryId || entryId === tgt) return edge;
    // Only retarget edges coming from decision or action nodes
    const srcNode = plan.nodes.find(n => n.id === src);
    if (!srcNode || (srcNode.type !== 'd' && srcNode.type !== 'a' && srcNode.type !== 's')) return edge;
    return [src, entryId, label];
  });

  // Add missing "apply Rule X" edges from node refs/snippets.
  for (const node of plan.nodes) {
    if (ANNOTATION_TYPES.has(node.type)) continue;
    const haystack = [node.label, node.desc ?? '', resolveRefs(ledger, node.refs)].join(' ');
    RULE_MENTION_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = RULE_MENTION_RE.exec(haystack)) !== null) {
      const letter = match[1].toUpperCase();
      const entryId = ruleEntryByLetter.get(letter);
      if (!entryId || entryId === node.id) continue;
      const key = `${node.id}->${entryId}`;
      if (existing.has(key)) continue;
      existing.add(key);
      extra.push([node.id, entryId, `apply Rule ${letter}`]);
    }
  }

  return { ...plan, edges: [...retargeted, ...extra] };
}

/**
 * Semantic-aware orphan connection.
 *
 * Priority for resolving a disconnected flow node:
 *   1. Annotation node (persona/rule/config/guard/ref/trigger/memory) →
 *      attach "Governs" edge to its `governs` targets or START.
 *   2. Flow node that belongs to a section → find a node in the same section
 *      that already has an incoming cross-section edge; wire from that same
 *      source, preserving the decision→section semantics.
 *   3. Flow node inside a rule section → leave for wireRuleReferences() to
 *      handle via cross-rule references.
 *   4. Fallback → attach to START with a "// TODO:unresolved-orphan" label
 *      so the bug is visible in the rendered graph and eval scripts can
 *      count it.
 */
export function ensureConnected(plan: GraphPlan, ledger?: Ledger): GraphPlan {
  const connected = new Set<number>();
  for (const [src, tgt] of plan.edges) {
    connected.add(src);
    connected.add(tgt);
  }

  const orphans = plan.nodes.filter(n => !connected.has(n.id));
  if (orphans.length === 0) return plan;

  const startId = plan.nodes.find(n => n.type === 'st')?.id ?? 1;
  const extra: EdgeTuple[] = [];

  // Precompute: per-section, any node that already has an incoming cross-section edge
  const sectionOfNode = new Map<number, string>();
  if (ledger) {
    for (const n of plan.nodes) {
      const s = nodeSection(n, ledger);
      if (s) sectionOfNode.set(n.id, s);
    }
  }

  const crossSectionSourceForSection = new Map<string, { src: number; label?: string }>();
  if (ledger) {
    for (const [src, tgt, label] of plan.edges) {
      const srcSection = sectionOfNode.get(src);
      const tgtSection = sectionOfNode.get(tgt);
      if (tgtSection && tgtSection !== srcSection) {
        if (!crossSectionSourceForSection.has(tgtSection)) {
          crossSectionSourceForSection.set(tgtSection, { src, label });
        }
      }
    }
  }

  for (const node of orphans) {
    if (ANNOTATION_TYPES.has(node.type)) {
      const targets = node.governs?.length ? node.governs : [startId];
      for (const t of targets) extra.push([node.id, t, 'Governs']);
      continue;
    }

    // Try ref-based section lookup
    const section = ledger ? sectionOfNode.get(node.id) : undefined;
    if (section) {
      const incoming = crossSectionSourceForSection.get(section);
      if (incoming && incoming.src !== node.id) {
        extra.push([incoming.src, node.id, incoming.label]);
        continue;
      }
    }

    // Fallback: attach to START with visible TODO label
    extra.push([startId, node.id, '// TODO:unresolved-orphan']);
  }

  return { ...plan, edges: [...plan.edges, ...extra] };
}

// ── Branch duplication (visual clarity) ──────────────────────────────────────
//
// When a shared flow node (e.g. a Tool like "Membership Check") is reached by
// multiple branches, converging all branches into one node creates crossing
// edges and a tangled graph. We instead duplicate the shared node per
// additional incoming branch and tag each clone with `duplicateOf` so the UI
// can render it as a logical re-use (dotted border, linked hover, etc.)
// while keeping each branch readable top-to-bottom.
//
// Rules:
//   - Only duplicate flow nodes: t, a, d, s, ru, lg, sk, lp, wp.
//     Terminals (e, r, h) and annotations (p, cf, g, ref, tr, m) are NEVER
//     duplicated — they're legitimate convergence points.
//   - Only duplicate if the node has ≥2 incoming default edges.
//   - The FIRST incoming edge keeps the original node; each additional
//     incoming edge gets a fresh clone with duplicateOf set to the original.
//   - The clone inherits the original's outgoing edges (so each branch reads
//     top-to-bottom with the same downstream logic).
//   - If an outgoing target is itself a non-terminal flow node, the clone
//     points at a NEW clone of that target (subtree duplication, capped at
//     depth 3 to prevent runaway graphs on cyclic references).

const DUPLICABLE_TYPES = new Set<TypeCode>(['t', 'a', 'd', 's', 'ru', 'lg', 'sk', 'lp', 'wp']);
const NEVER_DUPLICATE_TYPES = new Set<TypeCode>(['st', 'e', 'r', 'h', 'p', 'cf', 'g', 'ref', 'tr', 'm']);
const MAX_DUPLICATION_DEPTH = 3;

export function duplicateSharedBranchNodes(plan: GraphPlan): GraphPlan {
  // Incoming count per node (ignoring annotation "Governs" edges)
  const incomingBySources = new Map<number, EdgeTuple[]>();
  for (const edge of plan.edges) {
    const label = edge[2];
    if (label && /govern/i.test(label)) continue;
    const list = incomingBySources.get(edge[1]) ?? [];
    list.push(edge);
    incomingBySources.set(edge[1], list);
  }

  const nodeById = new Map(plan.nodes.map(n => [n.id, n]));
  let maxId = Math.max(...plan.nodes.map(n => n.id), 0);

  const newNodes: PlanNode[] = [...plan.nodes];
  const newEdges: EdgeTuple[] = [];

  // Track edges to drop (the extra incoming edges we're rerouting to clones)
  const droppedEdgeKeys = new Set<string>();

  // Memoize subtree clones: (originalId|depth|branchTag) → cloneId
  function cloneSubtree(
    originalId: number,
    depth: number,
    seen: Set<number>,
  ): number {
    const original = nodeById.get(originalId);
    if (!original) return originalId;
    if (depth >= MAX_DUPLICATION_DEPTH) return originalId;
    if (NEVER_DUPLICATE_TYPES.has(original.type)) return originalId;
    if (!DUPLICABLE_TYPES.has(original.type)) return originalId;
    if (seen.has(originalId)) return originalId; // cycle guard

    maxId++;
    const cloneId = maxId;
    const clone: PlanNode = {
      ...original,
      id: cloneId,
      duplicateOf: original.duplicateOf ?? original.id,
    };
    newNodes.push(clone);
    nodeById.set(cloneId, clone);

    const nextSeen = new Set(seen);
    nextSeen.add(originalId);

    // Recreate outgoing edges from the clone
    for (const edge of plan.edges) {
      if (edge[0] !== originalId) continue;
      const label = edge[2];
      if (label && /govern/i.test(label)) continue;
      const originalTarget = edge[1];
      const targetNode = nodeById.get(originalTarget);
      if (!targetNode) {
        newEdges.push([cloneId, originalTarget, label]);
        continue;
      }
      // Terminals stay shared (approve/deny/end/handoff are convergence points)
      if (NEVER_DUPLICATE_TYPES.has(targetNode.type) || !DUPLICABLE_TYPES.has(targetNode.type)) {
        newEdges.push([cloneId, originalTarget, label]);
        continue;
      }
      // Clone the downstream node too (subtree duplication)
      const clonedTargetId = cloneSubtree(originalTarget, depth + 1, nextSeen);
      newEdges.push([cloneId, clonedTargetId, label]);
    }

    return cloneId;
  }

  for (const [targetId, incoming] of incomingBySources) {
    if (incoming.length < 2) continue;
    const targetNode = nodeById.get(targetId);
    if (!targetNode) continue;
    if (!DUPLICABLE_TYPES.has(targetNode.type)) continue;
    if (NEVER_DUPLICATE_TYPES.has(targetNode.type)) continue;

    // Keep the first incoming as-is; clone for the rest.
    const [, ...extras] = incoming;
    for (const edge of extras) {
      const key = `${edge[0]}->${edge[1]}::${edge[2] ?? ''}`;
      droppedEdgeKeys.add(key);
      const cloneId = cloneSubtree(targetId, 0, new Set());
      newEdges.push([edge[0], cloneId, edge[2]]);
    }
  }

  if (newEdges.length === 0 && newNodes.length === plan.nodes.length) return plan;

  const keptEdges = plan.edges.filter(e =>
    !droppedEdgeKeys.has(`${e[0]}->${e[1]}::${e[2] ?? ''}`),
  );

  return { ...plan, nodes: newNodes, edges: [...keptEdges, ...newEdges] };
}

// ── Validation ────────────────────────────────────────────────────────────────

interface Violation { code: string; message: string }

function validate(plan: GraphPlan, ledger: Ledger): Violation[] {
  const violations: Violation[] = [];

  if (!plan.nodes.some(n => n.type === 'st')) {
    violations.push({ code: 'NO_START', message: 'No st=start node' });
  }

  const claimed = new Set(plan.nodes.flatMap(n => n.refs));
  const unclaimed = ledger.refs.filter(r => !claimed.has(r));
  if (unclaimed.length > 0) {
    violations.push({ code: 'UNCOVERED', message: `Uncovered: ${unclaimed.join(', ')}` });
  }

  const connected = new Set<number>();
  for (const [src, tgt] of plan.edges) { connected.add(src); connected.add(tgt); }
  const orphans = plan.nodes.filter(n => !connected.has(n.id));
  if (orphans.length > 0) {
    violations.push({ code: 'ORPHAN', message: `Orphan nodes: ${orphans.map(n => n.id).join(', ')}` });
  }

  // V5: warn about tool nodes missing the `tool` field
  const missingTool = plan.nodes.filter(n => n.type === 't' && !n.tool);
  if (missingTool.length > 0) {
    violations.push({ code: 'MISSING_TOOL', message: `t=tool nodes without tool field: ${missingTool.map(n => n.id).join(', ')}` });
  }

  // V6: every lp=loop node must have at least one exit edge (edge that does NOT go to itself or back to it)
  const loopNodes = plan.nodes.filter(n => n.type === 'lp');
  for (const loopNode of loopNodes) {
    const outgoingEdges = plan.edges.filter(e => e[0] === loopNode.id);
    // An exit edge is one whose target is NOT a descendant of this loop that back-edges here
    // Simple check: at least one outgoing edge that is NOT the back-edge (i.e. target != loopNode.id and not a back-edge pointing to loopNode)
    const hasExit = outgoingEdges.some(e => e[1] !== loopNode.id);
    if (!hasExit) {
      violations.push({ code: 'UNEXITED_LOOP', message: `lp=loop node ${loopNode.id} has no exit edge` });
    }
  }

  return violations;
}

// ── Inject missing INPUT nodes for section headings ───────────────────────────

function injectSectionInputs(plan: GraphPlan, ledger: Ledger): GraphPlan {
  plan = {
    ...plan,
    nodes: plan.nodes.map(n => n.type === 'i' ? { ...n, type: 's' as TypeCode } : n),
  };

  const headingParagraphs = ledger.paragraphs.filter(p =>
    /^#{1,6}\s+/.test(p.text.trim()) && p.section !== 'Preamble',
  );

  const sectionToRef = new Map<string, string>();
  for (const p of headingParagraphs) {
    sectionToRef.set(p.section, p.ref);
  }

  const sectionsWithInput = new Set<string>();
  for (const n of plan.nodes) {
    if (n.type === 's') {
      for (const ref of n.refs) {
        const p = ledger.paragraphs.find(lp => lp.ref === ref);
        if (p) sectionsWithInput.add(p.section);
      }
      for (const [section] of sectionToRef) {
        const labelLower = n.label.toLowerCase();
        const sectionLower = section.toLowerCase();
        if (labelLower.includes(sectionLower) || sectionLower.includes(labelLower)) {
          sectionsWithInput.add(section);
        }
        const labelWords = labelLower.split(/[\s—\-:]+/).filter(w => w.length > 1);
        const sectionWords = sectionLower.split(/[\s—\-:]+/).filter(w => w.length > 1);
        const overlap = labelWords.filter(w => sectionWords.includes(w));
        if (overlap.length >= 2) sectionsWithInput.add(section);
      }
    }
  }

  let maxId = Math.max(...plan.nodes.map(n => n.id), 0);
  const newNodes: PlanNode[] = [];
  const newEdges: EdgeTuple[] = [];

  for (const [section, ref] of sectionToRef) {
    if (sectionsWithInput.has(section)) continue;

    const para = ledger.paragraphs.find(p => p.ref === ref);
    if (!para) continue;
    const headingText = para.text.replace(/^#{1,6}\s+/, '').trim();
    if (para.index <= 1) continue;

    maxId++;
    const inputNode: PlanNode = {
      id: maxId,
      type: 's',
      label: headingText,
      refs: [ref],
    };
    newNodes.push(inputNode);

    const sectionNodes = plan.nodes.filter(n => {
      if (n.type === 'st') return false;
      return n.refs.some(r => {
        const p = ledger.paragraphs.find(lp => lp.ref === r);
        return p?.section === section;
      });
    });

    if (sectionNodes.length > 0) {
      const sectionIds = new Set(sectionNodes.map(n => n.id));

      // Skip injection if a section node's label already matches the heading —
      // avoid wrapping "Rule B — Standard Window Check" in another STEP header.
      const headingLower = headingText.toLowerCase();
      const alreadyHasHeader = sectionNodes.some(n => {
        const labelLower = n.label.toLowerCase();
        return labelLower === headingLower
          || labelLower.startsWith(headingLower)
          || headingLower.startsWith(labelLower);
      });
      if (alreadyHasHeader) {
        maxId--; // roll back the id we reserved
        newNodes.pop();
        continue;
      }

      // Prefer an existing cross-section entry; else pick by type priority.
      const crossSectionEntry = sectionNodes.find(n =>
        plan.edges.some(([src, tgt]) => tgt === n.id && !sectionIds.has(src)),
      );
      const rankedEntry = sectionNodes.slice().sort((a, b) => {
        const ra = entryTypeRank(a.type);
        const rb = entryTypeRank(b.type);
        if (ra !== rb) return ra - rb;
        return a.id - b.id;
      })[0];
      const entryNode = crossSectionEntry ?? rankedEntry;

      // When rerouting cross-section edges, drop ones whose source is itself
      // a section header (prevents header→header chains).
      const rerouted = plan.edges.flatMap((e): EdgeTuple[] => {
        if (e[1] === entryNode.id && !sectionIds.has(e[0])) {
          const srcNode = plan.nodes.find(n => n.id === e[0]);
          if (srcNode?.type === 's' && srcNode.label.trim().startsWith('Rule')) {
            return []; // drop header→header edge
          }
          return [[e[0], maxId, e[2]]];
        }
        return [e];
      });
      plan = { ...plan, edges: rerouted };

      newEdges.push([maxId, entryNode.id, 'Proceed']);
    }
  }

  if (newNodes.length === 0) return plan;

  return {
    ...plan,
    nodes: [...plan.nodes, ...newNodes],
    edges: [...plan.edges, ...newEdges],
  };
}

// ── Promote sub-agent tool nodes to agent nodes ──────────────────────────────

function promoteSubAgents(plan: GraphPlan, ledger: Ledger): GraphPlan {
  const registryNames = new Set<string>();
  const registryRe = /(?:you have access to|available agents?|subagents?|sub-agents?|sub agents?):\s*/i;

  for (const para of ledger.paragraphs) {
    if (registryRe.test(para.text)) {
      const lines = para.text.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*(?:\d+\.|[-*])\s+(\S+)/);
        if (match) {
          registryNames.add(match[1].toLowerCase());
        }
      }
    }
  }

  const agentNameRe = /^(\w+Agent|Agent\w+|\w+_Agent|Agent_\w+|\w+-Agent|Agent-\w+)$/i;

  const nodes = plan.nodes.map(n => {
    if (n.type !== 't') return n;
    const labelLower = n.label.toLowerCase().trim();
    const isRegistered = registryNames.has(labelLower);
    const isAgentName = agentNameRe.test(n.label.trim());
    if (isRegistered || isAgentName) {
      return { ...n, type: 'ag' as TypeCode };
    }
    return n;
  });

  return { ...plan, nodes };
}

// ── V5: Description extraction from snippet ────────────────────────────────────

/**
 * Extract a short description from the node's logicSnippet.
 * Takes the first sentence (up to the first . ! ? or newline), capped at 120 chars.
 * Falls back to first 80 chars if the sentence is too long.
 */
function extractDescription(snippet: string): string {
  if (!snippet) return '';
  // Strip XML tags for the first-sentence extraction
  const plain = snippet.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  // Take up to first sentence-ending punctuation or newline
  const match = plain.match(/^(.+?[.!?])\s/);
  if (match && match[1].length <= 120) return match[1].trim();
  // Fallback: first 80 chars
  const firstLine = plain.split('\n')[0].trim();
  if (firstLine.length <= 120) return firstLine;
  return plain.slice(0, 80).trimEnd() + '…';
}

// ── V5: Source format detection from snippet ───────────────────────────────────

/**
 * Detect whether a snippet's content is:
 *   'xml'      — contains XML-style tags like <triggering>, <execution>, <output>
 *   'markdown' — contains markdown headings (## ...)
 *   'prose'    — plain prose
 */
function detectSourceFormat(snippet: string): 'prose' | 'xml' | 'markdown' {
  if (/<(triggering|execution|output|context|rules?|instructions?)\b/i.test(snippet)) return 'xml';
  if (/^#{1,6}\s/m.test(snippet)) return 'markdown';
  return 'prose';
}

// ── V5: Infer tool name from label (fallback when LLM omitted it) ─────────────

/**
 * Best-effort tool name inference from a TOOL node's label when the LLM
 * forgot to set the `tool` field. Checks common patterns before giving up.
 */
function inferToolName(label: string): string | undefined {
  const l = label.toLowerCase();
  if (l.includes('python') || l.includes('execution') || l.includes('compute')) {
    return 'container.python_execution';
  }
  if (l.includes('browser') || l.includes('web search') || l.includes('web/news')) {
    return 'http://browser.search';
  }
  if (l.includes('social') || l.includes('content_search') || l.includes('meta_1p')) {
    return 'meta_1p.content_search';
  }
  if (l.includes('create image') || l.includes('image from text')) return 'media.create_image';
  if (l.includes('edit image')) return 'media.edit_image';
  if (l.includes('animate')) return 'media.animate_image';
  if (l.includes('create video') || l.includes('video from text')) return 'media.create_video';
  if (l.includes('edit video')) return 'media.edit_video';
  if (l.includes('audio') || l.includes('music') || l.includes('tts')) return 'media.get_audio';
  if (l.includes('reference image') || l.includes('likeness')) return 'media.get_reference_image';
  return undefined;
}

// ── V5: Branch topology → column + branchGroup ────────────────────────────────

/**
 * For each DECISION node with 2+ outgoing branches, assign `column` ('left',
 * 'center', 'right') and `branchGroup` to the immediate branch-target nodes.
 * This gives the canvas layout engine structured hints for side-by-side rendering.
 */
function assignBranchTopology(plan: GraphPlan, nodes: NodeData[]): void {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Collect outgoing targets per decision node
  const decisionTargets = new Map<number, number[]>();
  for (const [src, tgt] of plan.edges) {
    const srcNode = plan.nodes.find(n => n.id === src);
    if (srcNode?.type === 'd') {
      if (!decisionTargets.has(src)) decisionTargets.set(src, []);
      // Avoid duplicates
      if (!decisionTargets.get(src)!.includes(tgt)) {
        decisionTargets.get(src)!.push(tgt);
      }
    }
  }

  for (const [decId, targets] of decisionTargets) {
    if (targets.length < 2) continue;
    const bgId = `bg_n${decId}`;

    targets.forEach((tgtId, idx) => {
      const node = nodeMap.get(`n${tgtId}`);
      if (!node) return;

      let col: 'left' | 'center' | 'right';
      if (targets.length === 2) {
        col = idx === 0 ? 'left' : 'right';
      } else {
        if (idx === 0) col = 'left';
        else if (idx === targets.length - 1) col = 'right';
        else col = 'center';
      }

      node.config = {
        ...node.config,
        column: col,
        branchGroup: bgId,
      };
    });
  }
}

// ── Materialization (GraphPlan → AgentConfig) ─────────────────────────────────

export function materialize(
  plan: GraphPlan,
  ledger: Ledger,
  options: V6Options,
  modelName: string,
  promptType: PromptType,
): { agentConfig: AgentConfig; compactJson: string } {
  const claimedRefs = new Set<string>();

  const nodes: NodeData[] = plan.nodes.map(n => {
    const freshRefs = n.refs.filter(r => !claimedRefs.has(r));
    for (const r of n.refs) claimedRefs.add(r);

    const snippet = freshRefs.length > 0
      ? resolveRefs(ledger, freshRefs)
      : resolveRefs(ledger, n.refs);

    const section = n.refs.length > 0
      ? ledger.paragraphs.find(p => p.ref === n.refs[0])?.section ?? ''
      : '';

    // V5: auto-populate description from snippet
    const description = n.desc ?? extractDescription(snippet);

    // V5: detect source format from snippet content
    const sourceFormat = detectSourceFormat(snippet);

    // V5: use LLM-provided tool or infer from label
    const toolName = n.type === 't' ? (n.tool ?? inferToolName(n.label) ?? null) : null;

    const nodeConfig: Record<string, any> = {
      logicSnippet: snippet,
      origSnippet: snippet,
      sourceSection: section,
      sourceFormat,
      order: n.id,
      tool: toolName,
      value: null,
      outcome: n.outcome ?? null,
      inputRequired: n.type === 'i' ? true : null,
      ruleScope: n.scope === 'g' ? 'global' : n.scope === 's' ? 'scoped' : null,
      appliesTo: n.governs?.map(v => `n${v}`) ?? null,
      personaScope: n.type === 'p' ? 'agent' : null,
      column: 'center',    // will be overridden by assignBranchTopology
      branchGroup: null,   // will be overridden by assignBranchTopology
    };

    // V6: SKILL node config
    if (n.type === 'sk') {
      nodeConfig.skillName = n.label;
      nodeConfig.skillRef = n.label.toLowerCase().replace(/\s+skill$/i, '').replace(/\s+/g, '-');
      nodeConfig.pfgType = 'skill';
    }

    // V6: LOOP node config
    if (n.type === 'lp') {
      // Find phase nodes that are downstream of this loop (edges from loopNode.id)
      const loopPhaseIds = plan.edges
        .filter(e => e[0] === n.id && !e[2]?.includes('Loop Back'))
        .map(e => e[1]);
      nodeConfig.loopPhases = loopPhaseIds.map(id => `n${id}`);
      nodeConfig.exitCondition = null;
      nodeConfig.pfgType = 'loop';
    }

    // V6: branch-duplication marker — clone of another node for visual clarity
    if (n.duplicateOf != null) {
      nodeConfig.duplicateOf = `n${n.duplicateOf}`;
      nodeConfig.isDuplicate = true;
    }

    // V6: WARNING node config
    if (n.type === 'wp') {
      const label = n.label.toLowerCase();
      const severity = label.includes('never') || label.includes('critical') ? 'critical'
        : label.includes('avoid') || label.includes('don\'t') || label.includes('do not') ? 'warning'
        : 'note';
      nodeConfig.severity = severity;
      nodeConfig.pfgType = 'warning';
    }

    return {
      id: `n${n.id}`,
      type: TYPE_MAP[n.type] as any,
      label: n.label,
      description,
      config: nodeConfig,
      position: { x: 0, y: 0 },
    };
  });

  // Promote business-outcome END nodes to RESOLUTION
  const BIZ_RE = /\b(approv|deny|refund|credit|partial|reject|grant|reimburse|compensat)/i;
  for (const node of nodes) {
    if (node.type === 'END' && BIZ_RE.test(`${node.label} ${(node.config as any)?.outcome ?? ''}`)) {
      (node as any).type = 'RESOLUTION';
      node.config.pfgType = 'resolution';
    }
  }

  // Enrich AGENT nodes with linkedAgentId, agentRole, description
  const childAgentIds: string[] = [];
  for (const node of nodes) {
    if (node.type !== 'AGENT') continue;
    const role = node.label.trim();
    const childId = `agent-${djb2Hex(role)}`;
    childAgentIds.push(childId);
    node.description = node.description || `Sub-agent: ${role}`;
    node.config = {
      ...node.config,
      linkedAgentId: childId,
      agentRole: role,
      pfgType: 'agent',
    };
  }

  // Build connections
  const connections: Connection[] = plan.edges.map((e, i) => ({
    id: `e${i + 1}`,
    source: `n${e[0]}`,
    target: `n${e[1]}`,
    condition: e[2] ?? undefined,
  }));

  // V5: assign column/branchGroup from branch topology (before layout)
  assignBranchTopology(plan, nodes);

  // Layout
  const layoutted = (!options.skipLayout && !options.existingPositions)
    ? applyAutoLayout(nodes, connections)
    : nodes;

  // Compact JSON
  const compact = JSON.stringify({
    m: [plan.meta.agent_id, plan.meta.persona, plan.meta.tone, plan.meta.version, plan.meta.description, ledger.format],
    g: {
      n: plan.nodes.map(n => {
        const tuple: any[] = [n.id, n.type, n.label, resolveRefs(ledger, n.refs)];
        if (n.tool) tuple.push(n.tool);
        return tuple;
      }),
      e: plan.edges.map(e => e[2] ? [e[0], e[1], e[2]] : [e[0], e[1]]),
    },
  });

  const masterRole = plan.meta.persona || plan.meta.agent_id || '';

  const agentConfig: AgentConfig = {
    id: plan.meta.agent_id || `agent_${Date.now()}`,
    name: plan.meta.persona || 'Agent',
    description: plan.meta.description,
    originalPrompt: ledger.prompt,
    nodes: layoutted,
    connections,
    version: plan.meta.version || '1.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceFormat: 'json-compact',
    rawLlmOutput: compact,
    ...(childAgentIds.length > 0 ? { childAgentIds, agentRole: masterRole } : {}),
    settings: {
      llmProvider: 'gemini',
      apiKey: '',
      model: modelName,
      temperature: 0,
    },
    generatedWith: 'v6',
    promptCategory: promptType,
  } as AgentConfig & { generatedWith: string; promptCategory: PromptType };

  return { agentConfig, compactJson: compact };
}

// ── LLM call ──────────────────────────────────────────────────────────────────

function isTransient(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /fetch failed|timeout|429|503|temporarily unavailable/i.test(msg);
}

async function callLlm(
  systemPrompt: string,
  userMessage: string,
  options: V6Options,
): Promise<{ text: string; usage?: TokenUsage }> {
  const ai = new GoogleGenAI({ apiKey: options.apiKey });
  const model = options.model ?? V6_MODEL;

  let response: any;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      response = await ai.models.generateContent({
        model,
        config: {
          temperature: 0,
          topP: 0,
          thinkingConfig: { thinkingLevel: 'MINIMAL' } as any,
          maxOutputTokens: 32768,
          responseMimeType: 'application/json',
          systemInstruction: systemPrompt,
        } as any,
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      });
      break;
    } catch (error) {
      if (attempt >= 3 || !isTransient(error)) throw error;
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }

  if (!response) throw new Error('LLM call failed');
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const text = response.text?.trim() ?? '';
  options.onChunk?.(text);

  const u = (response as any).usageMetadata;
  const usage: TokenUsage | undefined = u ? {
    promptTokens: u.promptTokenCount ?? 0,
    responseTokens: u.candidatesTokenCount ?? 0,
    thoughtsTokens: u.thoughtsTokenCount ?? 0,
    totalTokens: u.totalTokenCount ?? 0,
  } : undefined;

  return { text, usage };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Convert a prompt to a graph using V6 pipeline.
 * Returns an AgentConfig ready for the canvas.
 */
export async function promptToGraphV6(
  rawPrompt: string,
  options: V6Options,
): Promise<AgentConfig> {
  const result = await promptToGraphV6Detailed(rawPrompt, options);
  return result.agentConfig;
}

/**
 * Full pipeline with all intermediate artifacts (V6).
 */
export async function promptToGraphV6Detailed(
  rawPrompt: string,
  options: V6Options,
): Promise<V6Result> {
  const modelName = options.model ?? V6_MODEL;

  // ── Stage -1: Pre-process ─────────────────────────────────────────────────
  options.onPhaseChange?.(0, 'Pre-process', 'started');
  const { meta: frontmatterMeta, body: cleanedBody } = parseFrontmatter(rawPrompt);
  const condensedPrompt = condenseCodeBlocks(cleanedBody);
  options.onPhaseChange?.(0, 'Pre-process', 'done');

  // ── Stage 0: Parse ────────────────────────────────────────────────────────
  options.onPhaseChange?.(1, 'Parse prompt', 'started');
  const ledger = buildLedger(condensedPrompt);
  // store original for AgentConfig (so round-trips work correctly)
  const effectivePrompt = rawPrompt;
  options.onPhaseChange?.(1, 'Parse prompt', 'done');

  // ── Stage 0.5: Classify ───────────────────────────────────────────────────
  options.onPhaseChange?.(2, 'Classify prompt type', 'started');
  const { type: promptType } = await classifyPromptType(ledger, options);
  options.onPhaseChange?.(2, 'Classify prompt type', 'done');

  // Select specialized system prompt
  const systemPromptMap: Record<PromptType, string> = {
    'business-flow': BUSINESS_FLOW_PROMPT,
    'skill-workflow': SKILL_WORKFLOW_PROMPT,
    'agent-spec': AGENT_SPEC_PROMPT,
    'loop-pattern': LOOP_PATTERN_PROMPT,
  };
  const systemPrompt = systemPromptMap[promptType];

  // ── Stage 1: Single LLM call ──────────────────────────────────────────────
  options.onPhaseChange?.(3, 'Generate graph', 'started');

  const userMessage = `Paragraph ledger:\n${formatLedger(ledger)}`;
  const { text: rawText, usage } = await callLlm(systemPrompt, userMessage, options);
  if (usage) options.onUsage?.(usage);

  let plan = normPlan(parseJson(rawText));

  options.onPhaseChange?.(3, 'Generate graph', 'done');

  // ── Stage 2: Validate + fix ───────────────────────────────────────────────
  options.onPhaseChange?.(4, 'Validate & fix', 'started');

  plan = wireStartToTrigger(plan);
  plan = removeCycles(plan);
  plan = ensureConnected(plan, ledger);

  let violations = validate(plan, ledger);

  if (violations.length > 0) {
    try {
      const repairMsg = [
        `Original plan:\n${JSON.stringify(plan)}`,
        `\nViolations:\n${violations.map(v => `- ${v.code}: ${v.message}`).join('\n')}`,
        `\nParagraph ledger:\n${formatLedger(ledger)}`,
      ].join('\n');

      const { text: repairText, usage: repairUsage } = await callLlm(REPAIR_PROMPT_V6, repairMsg, options);
      if (repairUsage && usage) {
        const combined: TokenUsage = {
          promptTokens: usage.promptTokens + repairUsage.promptTokens,
          responseTokens: usage.responseTokens + repairUsage.responseTokens,
          thoughtsTokens: (usage.thoughtsTokens ?? 0) + (repairUsage.thoughtsTokens ?? 0),
          totalTokens: usage.totalTokens + repairUsage.totalTokens,
        };
        options.onUsage?.(combined);
      }

      let repaired = normPlan(parseJson(repairText));
      repaired = wireStartToTrigger(repaired);
      repaired = removeCycles(repaired);
      repaired = ensureConnected(repaired, ledger);

      const newViolations = validate(repaired, ledger);
      if (newViolations.length < violations.length) {
        plan = repaired;
        violations = newViolations;
      }
    } catch {
      // Repair failed — use original plan (best effort)
    }
  }

  // V6: auto-repair UNEXITED_LOOP violations
  const loopViolations = violations.filter(v => v.code === 'UNEXITED_LOOP');
  for (const lv of loopViolations) {
    const loopNodeId = parseInt(lv.message.match(/node (\d+)/)?.[1] ?? '0', 10);
    const loopNode = plan.nodes.find(n => n.id === loopNodeId);
    if (!loopNode) continue;

    // Find or create a terminal to exit to
    let exitTarget = plan.nodes.find(n => n.type === 'e')?.id
      ?? plan.nodes.find(n => n.type === 'h')?.id;

    if (!exitTarget) {
      const maxId = Math.max(...plan.nodes.map(n => n.id), 0) + 1;
      const exitNode: PlanNode = { id: maxId, type: 'e', label: 'End', refs: [], desc: 'Loop exit terminal.' };
      plan = { ...plan, nodes: [...plan.nodes, exitNode] };
      exitTarget = maxId;
    }

    // Add a decision node for "Continue?"
    const maxId2 = Math.max(...plan.nodes.map(n => n.id), 0) + 1;
    const decisionNode: PlanNode = { id: maxId2, type: 'd', label: 'Continue?', refs: [], desc: 'Decide whether to continue the loop or exit.' };
    plan = {
      ...plan,
      nodes: [...plan.nodes, decisionNode],
      edges: [
        ...plan.edges,
        [loopNodeId, maxId2],                        // loop → decision
        [maxId2, loopNodeId, 'Yes'],                 // decision → loop (back-edge, intentional)
        [maxId2, exitTarget, 'No'],                  // decision → exit
      ],
    };
  }

  plan = removeCycles(plan);
  plan = promoteSubAgents(plan, ledger);
  plan = injectSectionInputs(plan, ledger);
  plan = wireRuleReferences(plan, ledger);
  plan = ensureConnected(plan, ledger);
  plan = duplicateSharedBranchNodes(plan);

  options.onPhaseChange?.(4, 'Validate & fix', 'done');

  // ── Stage 3: Materialize ──────────────────────────────────────────────────
  options.onPhaseChange?.(5, 'Materialize', 'started');

  const { agentConfig, compactJson } = materialize(plan, ledger, options, modelName, promptType);

  // Ensure originalPrompt is set to rawPrompt (original, before pre-processing)
  (agentConfig as any).originalPrompt = rawPrompt;

  options.onPhaseChange?.(5, 'Materialize', 'done');

  // ── Stage 3.5: Analyze Permissions ───────────────────────────────────────
  options.onPhaseChange?.(6, 'Analyze permissions', 'started');
  const permissionsManifest = analyzePermissions(agentConfig);
  (agentConfig as any).permissionsManifest = permissionsManifest;
  options.onPhaseChange?.(6, 'Analyze permissions', 'done');

  return { agentConfig, plan, ledger, compactJson, promptType };
}
