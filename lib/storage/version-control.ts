import type { AgentConfig } from '../types';

export interface AgentVersion {
  id: string;
  agentId: string;
  parentId: string | null;
  versionLabel: string;      // e.g. "1", "2", "2.3", "2.12"
  snapshot: AgentConfig;
  message: string;
  createdAt: string;
  author: string;
  isRevert?: boolean;
  revertTargetLabel?: string;
}

const STORAGE_KEY = 'MAP_versions';

function computeLabelFromReference(allForAgent: AgentVersion[], referenceLabel: string | null): string {
  if (!referenceLabel || !referenceLabel.includes('.')) {
    // Parent is a root version (e.g. "2") or null — bump root counter
    const rootInts = allForAgent
      .map(v => v.versionLabel)
      .filter(l => !l.includes('.'))
      .map(l => parseInt(l, 10))
      .filter(n => !isNaN(n));
    const maxRoot = rootInts.length > 0 ? Math.max(...rootInts) : 0;
    return String(maxRoot + 1);
  } else {
    // Parent is a sub-version (e.g. "2.3") — stay on same root branch
    const root = referenceLabel.split('.')[0]; // "2"
    const subInts = allForAgent
      .map(v => v.versionLabel)
      .filter(l => l.startsWith(root + '.'))
      .map(l => parseInt(l.split('.')[1], 10))
      .filter(n => !isNaN(n));
    const maxSub = subInts.length > 0 ? Math.max(...subInts) : 0;
    return `${root}.${maxSub + 1}`;
  }
}

export function saveVersion(
  agent: AgentConfig,
  message: string,
  parentId?: string | null,
  author?: string
): AgentVersion {
  const allForAgent = getAllVersions(agent.id); // sorted desc by date

  // Determine parentId
  const latestVersion = allForAgent.length > 0 ? allForAgent[0] : null;
  const finalParentId =
    parentId !== undefined
      ? parentId
      : agent.currentVersionId ?? (latestVersion ? latestVersion.id : null);

  // Determine parent label
  const parentVersion = finalParentId
    ? allForAgent.find(v => v.id === finalParentId) ?? null
    : null;
  const parentLabel = parentVersion?.versionLabel ?? null;

  const newLabel = computeLabelFromReference(allForAgent, parentLabel);

  const newVersion: AgentVersion = {
    id: `version-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    agentId: agent.id,
    parentId: finalParentId,
    versionLabel: newLabel,
    snapshot: JSON.parse(JSON.stringify({ ...agent, currentVersionId: undefined })),
    message,
    createdAt: new Date().toISOString(),
    author: author ?? 'User',
  };

  const allVersions = getAllVersionsFromStorage();
  allVersions.push(newVersion);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allVersions));

  return newVersion;
}

/** Returns what label the next commit would get given current agent state */
export function computeNextVersionLabel(agent: AgentConfig): string {
  const allForAgent = getAllVersions(agent.id);
  const currentVersion = agent.currentVersionId
    ? allForAgent.find(v => v.id === agent.currentVersionId)
    : null;
  const currentLabel = currentVersion?.versionLabel ?? null;

  return computeLabelFromReference(allForAgent, currentLabel);
}

export function getAllVersions(agentId: string): AgentVersion[] {
  const allVersions = getAllVersionsFromStorage();
  return allVersions
    .filter(v => v.agentId === agentId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getVersion(versionId: string): AgentVersion | null {
  const allVersions = getAllVersionsFromStorage();
  return allVersions.find(v => v.id === versionId) || null;
}

export function restoreVersion(versionId: string): AgentConfig | null {
  const version = getVersion(versionId);
  if (!version) return null;

  return {
    ...version.snapshot,
    currentVersionId: version.id
  };
}

function getAllVersionsFromStorage(): AgentVersion[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return [];
  try {
    const parsed = JSON.parse(data);
    // Migrate old format: version (number) → versionLabel (string)
    const migrated = parsed.map((v: any) => {
      if (v.versionLabel === undefined && v.version !== undefined) {
        const { version, ...rest } = v;
        return { ...rest, versionLabel: String(version) };
      }
      return v;
    });
    return migrated;
  } catch {
    return [];
  }
}

export function compareVersions(v1: AgentConfig, v2: AgentConfig): {
  nodesAdded: string[];
  nodesRemoved: string[];
  nodesModified: string[];
  connectionsChanged: boolean;
} {
  const v1NodeIds = new Set(v1.nodes.map(n => n.id));
  const v2NodeIds = new Set(v2.nodes.map(n => n.id));

  const nodesAdded = v2.nodes.filter(n => !v1NodeIds.has(n.id)).map(n => n.label);
  const nodesRemoved = v1.nodes.filter(n => !v2NodeIds.has(n.id)).map(n => n.label);

  const nodesModified = v2.nodes
    .filter(n2 => {
      const n1 = v1.nodes.find(n => n.id === n2.id);
      if (!n1) return false;
      return JSON.stringify(n1) !== JSON.stringify(n2);
    })
    .map(n => n.label);

  const connectionsChanged =
    JSON.stringify([...v1.connections].sort()) !== JSON.stringify([...v2.connections].sort());

  return { nodesAdded, nodesRemoved, nodesModified, connectionsChanged };
}
