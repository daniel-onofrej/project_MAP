import type { AgentConfig } from '../../types';
import { scoreRoleMatch } from './role-matching';

export type CrossAgentWarningType =
  | 'orphaned_agent_node'    // AGENT node in master with no matching sub-agent
  | 'missing_agent_node'     // Sub-agent exists but has no AGENT node in master
  | 'role_mismatch'          // AGENT node label doesn't match sub-agent role
  | 'broken_link';           // linkedAgentId points to non-existent sub-agent

export interface CrossAgentWarning {
  type: CrossAgentWarningType;
  message: string;
  nodeId?: string;
  agentId?: string;
  severity: 'error' | 'warning';
}

/**
 * Validate cross-agent fidelity between a master agent and its sub-agents.
 *
 * Checks:
 * 1. Every AGENT node in master has a valid linkedAgentId → existing sub-agent
 * 2. Every sub-agent has a corresponding AGENT node in master
 * 3. AGENT node labels still match sub-agent roles (role name consistency)
 */
export function validateCrossAgentFidelity(
  master: AgentConfig,
  subAgents: AgentConfig[]
): { warnings: CrossAgentWarning[] } {
  const warnings: CrossAgentWarning[] = [];
  const subAgentMap = new Map(subAgents.map(s => [s.id, s]));
  const subAgentRoles = new Map(subAgents.map(s => [s.id, s.agentRole || s.name]));
  const matchedSubAgentIds = new Set<string>();

  // Check 1: Every AGENT node should link to a valid sub-agent
  for (const node of master.nodes) {
    if (node.type !== 'AGENT') continue;

    const linkedId = node.config?.linkedAgentId as string | undefined;

    if (!linkedId) {
      warnings.push({
        type: 'orphaned_agent_node',
        message: `AGENT node "${node.label}" has no linked sub-agent`,
        nodeId: node.id,
        severity: 'warning',
      });
      continue;
    }

    const linkedAgent = subAgentMap.get(linkedId);
    if (!linkedAgent) {
      warnings.push({
        type: 'broken_link',
        message: `AGENT node "${node.label}" links to non-existent sub-agent ID "${linkedId}"`,
        nodeId: node.id,
        severity: 'error',
      });
      continue;
    }

    matchedSubAgentIds.add(linkedId);

    // Check 3: Role name consistency
    const nodeRole = node.label || (node.config?.agentRole as string) || '';
    const subRole = linkedAgent.agentRole || linkedAgent.name || '';
    const matchScore = scoreRoleMatch(nodeRole, subRole);

    if (matchScore < 0.5) {
      warnings.push({
        type: 'role_mismatch',
        message: `AGENT node "${nodeRole}" has low match (${Math.round(matchScore * 100)}%) with linked sub-agent role "${subRole}". The role may have been renamed.`,
        nodeId: node.id,
        agentId: linkedId,
        severity: 'warning',
      });
    }
  }

  // Check 2: Every sub-agent should have a corresponding AGENT node
  for (const sub of subAgents) {
    if (!matchedSubAgentIds.has(sub.id)) {
      warnings.push({
        type: 'missing_agent_node',
        message: `Sub-agent "${sub.agentRole || sub.name}" (${sub.id}) has no AGENT node in the master graph`,
        agentId: sub.id,
        severity: 'warning',
      });
    }
  }

  return { warnings };
}
