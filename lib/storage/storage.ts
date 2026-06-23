/**
 * Storage layer — replaces localStorage with API calls.
 * GraphRuleSettings and ProviderConfig remain in localStorage (UI preferences, not user data).
 * All agent CRUD goes through /api/agents.
 */
import type { AgentConfig, GraphRuleSettings, ProviderConfig } from '../types';
import { DEFAULT_GRAPH_RULE_SETTINGS, DEFAULT_PROVIDER_CONFIG } from '../types';
import { normalizeRuntimePackage } from '../runtime-assets';

// ── Agent CRUD (API-backed) ───────────────────────────────────────────────────

export async function saveAgent(agent: AgentConfig): Promise<void> {
  // Strip API key before sending to server (company keys are in .env)
  const sanitized = {
    ...agent,
    settings: agent.settings ? { ...agent.settings, apiKey: '' } : undefined,
    runtimePackage: normalizeRuntimePackage(agent.runtimePackage),
  };

  const res = await fetch(`/api/agents/${agent.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sanitized),
  });

  if (res.status === 404) {
    // Agent doesn't exist yet — create it
    await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sanitized),
    });
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Failed to save agent: ${res.status}`);
  }
}

export async function getAllAgents(): Promise<AgentConfig[]> {
  const res = await fetch('/api/agents');
  if (!res.ok) {
    console.error('[storage] Failed to load agents:', res.status);
    return [];
  }
  const data = await res.json();
  return data.agents ?? [];
}

export async function getAgent(id: string): Promise<AgentConfig | null> {
  const res = await fetch(`/api/agents/${id}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.agent ?? null;
}

export async function deleteAgent(id: string): Promise<void> {
  await fetch(`/api/agents/${id}`, { method: 'DELETE' });
}

export async function deleteAgentFamily(masterId: string): Promise<void> {
  const agent = await getAgent(masterId);
  if (!agent) return;
  const childIds = agent.childAgentIds ?? [];
  await Promise.all([
    deleteAgent(masterId),
    ...childIds.map((cid: string) => deleteAgent(cid)),
  ]);
}

export async function getAgentFamily(agentId: string): Promise<AgentConfig[]> {
  const agent = await getAgent(agentId);
  if (!agent) return [];
  const masterId = agent.parentAgentId ?? (agent.childAgentIds?.length ? agent.id : null);
  if (!masterId) return [agent];
  const all = await getAllAgents();
  return all.filter(a => a.id === masterId || a.parentAgentId === masterId);
}

// ── Export / Import (client-side only, no API needed) ────────────────────────

export function exportAgent(agent: AgentConfig): void {
  const dataStr = JSON.stringify(agent, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${agent.name.replace(/\s+/g, '-').toLowerCase()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function importAgent(file: File): Promise<AgentConfig> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const agent = normalizeAgentConfig(data);
        resolve(agent);
      } catch {
        reject(new Error('Invalid JSON file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export function normalizeAgentConfig(data: any): AgentConfig {
  if (data.nodes && data.connections && data.id && data.name) {
    return {
      ...data,
      runtimePackage: normalizeRuntimePackage(data.runtimePackage),
    } as AgentConfig;
  }

  if (data.metadata && data.graph) {
    const { metadata, graph } = data;
    return {
      id: metadata.agent_id || `agent-${Date.now()}`,
      name: metadata.persona || 'New Agent',
      description: metadata.description || '',
      version: metadata.version || '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: (graph.nodes || []).map((node: any) => ({
        id: node.id,
        type: (node.type || 'AGENT').toUpperCase() as any,
        label: node.data?.label || node.label || 'New Node',
        description: node.data?.description || node.description || '',
        position: node.position || { x: 0, y: 0 },
        config: { ...(node.data || {}), label: undefined, description: undefined },
      })),
      connections: (graph.edges || []).map((edge: any) => ({
        id: edge.id || `${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        condition: edge.label || edge.data?.condition,
      })),
      author: metadata.author,
      settings: {
        llmProvider: 'gemini',
        apiKey: '',
        model: metadata.model || 'gemini-3-flash-preview',
        temperature: 0,
      },
      runtimePackage: normalizeRuntimePackage(data.runtimePackage),
    };
  }

  return {
    ...data,
    runtimePackage: normalizeRuntimePackage(data.runtimePackage),
  } as AgentConfig;
}

export function incrementForkCount(_agentId: string): void {
  // No-op: fork counts now tracked server-side via hubMeta in agents table
}

// ── Graph Rule Settings (localStorage — UI preferences only) ─────────────────

const GRAPH_RULES_KEY = 'MAP-graph-rules';

export function getGraphRuleSettings(): GraphRuleSettings {
  if (typeof window === 'undefined') return DEFAULT_GRAPH_RULE_SETTINGS;
  try {
    const stored = localStorage.getItem(GRAPH_RULES_KEY);
    return stored ? { ...DEFAULT_GRAPH_RULE_SETTINGS, ...JSON.parse(stored) } : DEFAULT_GRAPH_RULE_SETTINGS;
  } catch {
    return DEFAULT_GRAPH_RULE_SETTINGS;
  }
}

export function saveGraphRuleSettings(settings: GraphRuleSettings): void {
  localStorage.setItem(GRAPH_RULES_KEY, JSON.stringify(settings));
}

// ── Provider Config (localStorage — UI preferences only) ─────────────────────

const PROVIDER_CONFIG_KEY = 'verto_provider_config';

export function getProviderConfig(): ProviderConfig {
  if (typeof window === 'undefined') return DEFAULT_PROVIDER_CONFIG;
  try {
    const stored = localStorage.getItem(PROVIDER_CONFIG_KEY);
    return stored ? { ...DEFAULT_PROVIDER_CONFIG, ...JSON.parse(stored) } : DEFAULT_PROVIDER_CONFIG;
  } catch {
    return DEFAULT_PROVIDER_CONFIG;
  }
}

export function saveProviderConfig(config: ProviderConfig): void {
  localStorage.setItem(PROVIDER_CONFIG_KEY, JSON.stringify(config));
}
