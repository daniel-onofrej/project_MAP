import { GoogleGenAI } from '@google/genai';
import type { AgentConfig, AgentCapability, RiskPermission, RiskCategory, RiskLevel, NodeData } from './types';
import { DEFAULT_GEMINI_MODEL } from './types';

// ── Category display names ──────────────────────────────────────────────────

export const RISK_CATEGORY_LABELS: Record<RiskCategory, string> = {
  'api-integration':  'API & Integrations',
  'data-storage':     'Data & Storage',
  'logging-audit':    'Logging & Audit',
  'communication':    'User Communication',
  'financial':        'Financial',
  'system-infra':     'System & Infrastructure',
  'auth-permissions': 'Auth & Permissions',
  'ai-llm':           'AI & LLM Calls',
};

export const RISK_CATEGORY_ICONS: Record<RiskCategory, string> = {
  'api-integration':  '🌐',
  'data-storage':     '🗄️',
  'logging-audit':    '🗃️',
  'communication':    '📧',
  'financial':        '💰',
  'system-infra':     '💻',
  'auth-permissions': '🔑',
  'ai-llm':           '🤖',
};

// ── LLM-based risk detection ────────────────────────────────────────────────

const CANDIDATE_TYPES = new Set(['ACTION', 'TOOL', 'STEP', 'TASK', 'AGENT', 'HANDOFF']);

const RISK_SYSTEM_PROMPT = `You classify risk for AI agent graph nodes. For each node, determine if it performs a risky action.

Output ONLY a raw JSON array. No markdown, no preamble. First character must be [.

For each risky node return:
{"id":"<node_id>","category":"<cat>","risk":"<level>","reason":"<30 words max>","isWrite":<bool>}

Categories: api-integration, data-storage, logging-audit, communication, financial, system-infra, auth-permissions, ai-llm
Risk levels: high (irreversible/dangerous), medium (side effects), low (minor)
isWrite: true if the action mutates state, false if read-only

Omit non-risky nodes entirely. Return [] if nothing is risky.`;

interface LLMRiskResult {
  id: string;
  category: RiskCategory;
  risk: RiskLevel;
  reason: string;
  isWrite: boolean;
}

const VALID_CATEGORIES: RiskCategory[] = ['api-integration', 'data-storage', 'logging-audit', 'communication', 'financial', 'system-infra', 'auth-permissions', 'ai-llm'];
const VALID_LEVELS: RiskLevel[] = ['high', 'medium', 'low'];

function normalizeRiskResult(raw: any): LLMRiskResult | null {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  return {
    id: raw.id,
    category: VALID_CATEGORIES.includes(raw.category) ? raw.category : 'api-integration',
    risk: VALID_LEVELS.includes(raw.risk) ? raw.risk : 'medium',
    reason: typeof raw.reason === 'string' ? raw.reason.slice(0, 200) : '',
    isWrite: typeof raw.isWrite === 'boolean' ? raw.isWrite : true,
  };
}

export async function detectRiskPermissionsLLM(
  agent: AgentConfig,
  apiKey: string,
): Promise<RiskPermission[]> {
  // Pre-filter: only send candidate node types
  const candidates = agent.nodes.filter(n => CANDIDATE_TYPES.has(n.type));
  if (candidates.length === 0) return [];

  // Build compact input
  const compactNodes = candidates.map(n => ({
    id: n.id,
    type: n.type,
    label: n.label,
    desc: (n.description ?? n.config?.logicSnippet ?? '').slice(0, 100),
  }));

  const ai = new GoogleGenAI({ apiKey });
  let raw = '';
  const stream = await ai.models.generateContentStream({
    model: DEFAULT_GEMINI_MODEL,
    config: {
      temperature: 0,
      topP: 0,
      systemInstruction: RISK_SYSTEM_PROMPT,
    } as any,
    contents: [{
      role: 'user',
      parts: [{ text: `Classify these nodes:\n${JSON.stringify(compactNodes)}` }],
    }],
  });

  for await (const chunk of stream) {
    raw += chunk.text ?? '';
  }

  raw = raw.trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
  }

  let results: LLMRiskResult[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      results = parsed.map(normalizeRiskResult).filter(Boolean) as LLMRiskResult[];
    }
  } catch {
    return []; // LLM returned invalid JSON — no risk data
  }

  // Build RiskPermission array with guard detection
  const permissions: RiskPermission[] = [];
  for (const result of results) {
    const node = agent.nodes.find(n => n.id === result.id);
    if (!node) continue;

    const { guarded, guardNodeId } = hasGuardBefore(node.id, agent.nodes, agent.connections);
    const bypassed = guarded && guardNodeId
      ? hasGuardBypass(node.id, guardNodeId, agent.nodes, agent.connections)
      : false;

    // Read-only actions get downgraded one level
    let riskLevel = result.risk;
    if (!result.isWrite && riskLevel === 'high') riskLevel = 'medium';
    if (!result.isWrite && riskLevel === 'medium') riskLevel = 'low';

    // Guarded (without bypass) downgrades by one level
    if (guarded && !bypassed && riskLevel === 'high') riskLevel = 'medium';
    if (guarded && !bypassed && riskLevel === 'medium') riskLevel = 'low';

    permissions.push({
      id: `risk-${node.id}`,
      name: node.label,
      description: result.reason,
      nodeId: node.id,
      category: result.category,
      riskLevel,
      hasGuard: guarded,
      guardNodeId,
      reason: result.reason,
      isWrite: result.isWrite,
      guardBypassed: bypassed,
    });
  }

  return permissions;
}

// ── Multi-hop guard detection (BFS, max 3 hops) ────────────────────────────

export function hasGuardBefore(
  nodeId: string,
  nodes: NodeData[],
  connections: { source: string; target: string }[],
  maxHops: number = 3,
): { guarded: boolean; guardNodeId?: string } {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const visited = new Set<string>();
  const queue: { id: string; depth: number }[] = [{ id: nodeId, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id) || depth > maxHops) continue;
    visited.add(id);

    for (const conn of connections) {
      if (conn.target === id) {
        const sourceNode = nodeMap.get(conn.source);
        if (sourceNode?.type === 'GUARD') {
          return { guarded: true, guardNodeId: sourceNode.id };
        }
        queue.push({ id: conn.source, depth: depth + 1 });
      }
    }
  }

  return { guarded: false };
}

// ── Guard bypass detection ──────────────────────────────────────────────────

export function hasGuardBypass(
  nodeId: string,
  guardNodeId: string,
  nodes: NodeData[],
  connections: { source: string; target: string }[],
): boolean {
  // Find source nodes (no incoming edges)
  const hasIncoming = new Set(connections.map(c => c.target));
  const sourceNodes = nodes.filter(n => !hasIncoming.has(n.id));
  if (sourceNodes.length === 0) return false;

  // BFS from each source, skipping the guard node
  for (const source of sourceNodes) {
    const visited = new Set<string>();
    const queue = [source.id];
    visited.add(source.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === guardNodeId) continue; // skip guard — testing bypass
      if (current === nodeId) return true; // reached target without guard

      for (const conn of connections) {
        if (conn.source === current && !visited.has(conn.target)) {
          visited.add(conn.target);
          queue.push(conn.target);
        }
      }
    }
  }

  return false;
}

// ── Sync fallback (keyword-based, kept for backward compat) ─────────────────

const RISK_KEYWORDS: Record<RiskCategory, string[]> = {
  'api-integration': [
    'api', 'call', 'request', 'fetch', 'endpoint', 'webhook',
    'http', 'rest', 'graphql', 'integration', 'third-party', 'external',
    'oauth', 'curl', 'service', 'post', 'get', 'client',
  ],
  'data-storage': [
    'database', 'db', 'query', 'record', 'table', 'row', 'column',
    'file', 'disk', 'write', 'read', 'storage', 'memory', 'cache',
    'persist', 'save', 'load', 'retrieve', 'store', 'index',
  ],
  'logging-audit': [
    'log', 'logging', 'audit', 'trace', 'telemetry', 'metric',
    'monitor', 'observe', 'event', 'track', 'record', 'report',
    'analytics', 'insight', 'dashboard',
  ],
  'communication': [
    'email', 'send', 'notify', 'message', 'sms', 'alert', 'broadcast',
    'slack', 'notification', 'reply', 'forward', 'mail', 'chat',
    'respond', 'announce', 'publish', 'post', 'inbox',
  ],
  'financial': [
    'payment', 'charge', 'bill', 'invoice', 'refund', 'credit', 'debit',
    'transfer', 'purchase', 'price', 'cost', 'subscription', 'checkout',
    'order', 'transaction', 'balance', 'withdraw', 'deposit', 'fee',
    'discount', 'coupon', 'stripe', 'paypal',
  ],
  'system-infra': [
    'shell', 'command', 'execute', 'process', 'system', 'path',
    'install', 'deploy', 'server', 'ssh', 'sudo', 'admin', 'root',
    'permission', 'download', 'upload', 'migrate', 'script', 'binary',
  ],
  'auth-permissions': [
    'auth', 'authenticate', 'login', 'token', 'jwt', 'session',
    'role', 'permission', 'access', 'grant', 'revoke', 'scope',
    'oauth', 'saml', 'sso', 'credential', 'password', 'key',
  ],
  'ai-llm': [
    'llm', 'model', 'embedding', 'prompt', 'completion', 'inference',
    'gpt', 'claude', 'gemini', 'openai', 'anthropic', 'agent',
    'sub-agent', 'chain', 'rag', 'vector', 'semantic',
  ],
};

const HIGH_PRIORITY_CATEGORIES: RiskCategory[] = ['financial', 'system-infra', 'data-storage', 'auth-permissions'];

function getNodeText(node: NodeData): string {
  const parts = [
    node.label,
    node.description ?? '',
    node.config?.logic_snippet ?? '',
    node.config?.logicSnippet ?? '',
    node.dangerReason ?? '',
  ];
  return parts.join(' ').toLowerCase();
}

function matchCategory(text: string): RiskCategory | null {
  const matches: { category: RiskCategory; count: number }[] = [];

  for (const [category, keywords] of Object.entries(RISK_KEYWORDS) as [RiskCategory, string[]][]) {
    const count = keywords.filter(kw => text.includes(kw)).length;
    if (count > 0) {
      matches.push({ category, count });
    }
  }

  if (matches.length === 0) return null;

  for (const priority of HIGH_PRIORITY_CATEGORIES) {
    const match = matches.find(m => m.category === priority);
    if (match) return match.category;
  }

  matches.sort((a, b) => b.count - a.count);
  return matches[0].category;
}

function determineRiskLevel(
  category: RiskCategory,
  hasGuard: boolean,
  node: NodeData,
): RiskLevel {
  if (category === 'financial') return 'high';
  if (node.isDangerous) return 'high';

  if (category === 'data-storage' || category === 'system-infra' || category === 'auth-permissions') {
    return hasGuard ? 'medium' : 'high';
  }

  if (category === 'communication') {
    return 'medium';
  }

  return hasGuard ? 'low' : 'medium';
}

export function detectRiskPermissions(agent: AgentConfig): RiskPermission[] {
  const permissions: RiskPermission[] = [];

  for (const node of agent.nodes) {
    if (['START', 'END', 'GUARD', 'CONDITION', 'DECISION'].includes(node.type)) continue;

    const text = getNodeText(node);
    const category = matchCategory(text);

    if (!category) continue;

    const { guarded, guardNodeId } = hasGuardBefore(node.id, agent.nodes, agent.connections);
    const riskLevel = determineRiskLevel(category, guarded, node);

    permissions.push({
      id: `risk-${node.id}`,
      name: node.label,
      description: buildRiskDescription(node, category, guarded),
      nodeId: node.id,
      category,
      riskLevel,
      hasGuard: guarded,
      guardNodeId,
    });
  }

  return permissions;
}

function buildRiskDescription(node: NodeData, category: RiskCategory, hasGuard: boolean): string {
  const categoryLabel = RISK_CATEGORY_LABELS[category];
  const guardStatus = hasGuard ? 'Has safety guard' : 'No safety guard';
  const nodeDesc = node.description ? `: ${node.description}` : '';
  return `${categoryLabel} action${nodeDesc}. ${guardStatus}.`;
}

// ── Backward compatibility wrapper ──────────────────────────────────────────

const RISK_TO_CAPABILITY_CATEGORY: Record<RiskCategory, AgentCapability['category']> = {
  'api-integration':  'integration',
  'data-storage':     'data',
  'logging-audit':    'data',
  'communication':    'communication',
  'financial':        'logic',
  'system-infra':     'integration',
  'auth-permissions': 'logic',
  'ai-llm':           'logic',
};

export function detectBasicCapabilities(agent: AgentConfig): AgentCapability[] {
  const permissions = detectRiskPermissions(agent);

  return permissions.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    nodeId: p.nodeId,
    category: RISK_TO_CAPABILITY_CATEGORY[p.category],
  }));
}
