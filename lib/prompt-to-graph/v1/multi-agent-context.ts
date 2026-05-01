import type { AgentConfig } from '../../types';

/**
 * Build a structured context summary from the master agent's graph.
 * This is injected into each sub-agent's Gemini prompt so sub-agents
 * understand their place in the multi-agent system.
 *
 * Deterministic — no API calls. Extracts info from the master's parsed graph.
 */
export function buildSubAgentContext(
  master: AgentConfig,
  currentRole: string,
  allRoles: string[]
): string {
  const masterRole = master.agentRole || master.name || 'Master';

  // Find sibling roles (all roles except current)
  const siblings = allRoles.filter(r => r.toUpperCase() !== currentRole.toUpperCase());

  // Extract calling conditions from DECISION nodes that reference the current role
  const callingConditions: string[] = [];
  for (const node of master.nodes) {
    if (node.type !== 'DECISION') continue;
    // Check if any outgoing edge from this decision leads to an AGENT node matching currentRole
    const outEdges = master.connections.filter(c => c.source === node.id);
    for (const edge of outEdges) {
      const targetNode = master.nodes.find(n => n.id === edge.target);
      if (targetNode?.type === 'AGENT') {
        const agentRole = (targetNode.config?.agentRole as string) || targetNode.label || '';
        if (agentRole.toUpperCase().includes(currentRole.toUpperCase()) ||
            currentRole.toUpperCase().includes(agentRole.toUpperCase().replace(/_AGENT$/, ''))) {
          callingConditions.push(edge.condition || node.label || 'unknown condition');
        }
      }
    }
  }

  // Extract shared rules from RULE nodes
  const sharedRules: string[] = [];
  for (const node of master.nodes) {
    if (node.type !== 'RULE') continue;
    const snippet = (node.config?.logicSnippet as string) || node.label;
    if (snippet) sharedRules.push(snippet);
  }

  // Build the context string
  const lines: string[] = [
    'SYSTEM CONTEXT (from Master Agent):',
    `- Master Role: ${masterRole}`,
    `- Your Role: ${currentRole}`,
    `- Sibling Agents (for reference only, do NOT create graph nodes for these): [${siblings.join(', ')}]`,
  ];

  if (callingConditions.length > 0) {
    lines.push(`- You are called when: ${callingConditions.join('; ')}`);
  }

  if (sharedRules.length > 0) {
    const rulesStr = sharedRules.slice(0, 5).join('; '); // cap at 5 to save tokens
    lines.push(`- Shared Rules: ${rulesStr}`);
  }

  return lines.join('\n');
}

/**
 * Extract interface contract hints from the master graph for a specific sub-agent.
 * Looks at edges into/out of the AGENT node to infer expected inputs and outputs.
 */
export function extractInterfaceContract(
  master: AgentConfig,
  agentNodeId: string
): { expectedInput: string[]; expectedOutput: string[] } {
  const expectedInput: string[] = [];
  const expectedOutput: string[] = [];

  // Incoming edges to the AGENT node → hints about expected input
  const inEdges = master.connections.filter(c => c.target === agentNodeId);
  for (const edge of inEdges) {
    const sourceNode = master.nodes.find(n => n.id === edge.source);
    if (sourceNode) {
      if (edge.condition) {
        expectedInput.push(edge.condition);
      } else if (sourceNode.type === 'DECISION') {
        expectedInput.push(`decision: ${sourceNode.label}`);
      } else if (sourceNode.type === 'ACTION' || sourceNode.type === 'STEP') {
        expectedInput.push(`from: ${sourceNode.label}`);
      }
    }
  }

  // Outgoing edges from the AGENT node → hints about expected output
  const outEdges = master.connections.filter(c => c.source === agentNodeId);
  for (const edge of outEdges) {
    const targetNode = master.nodes.find(n => n.id === edge.target);
    if (targetNode) {
      if (edge.condition) {
        expectedOutput.push(edge.condition);
      } else if (targetNode.type === 'ACTION' || targetNode.type === 'STEP') {
        expectedOutput.push(`to: ${targetNode.label}`);
      } else if (targetNode.type === 'END') {
        expectedOutput.push('final result');
      }
    }
  }

  return { expectedInput, expectedOutput };
}
