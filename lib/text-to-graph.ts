// @ts-nocheck — this file uses legacy node-type strings (PERSONA, STEP, OPTION, etc.)
// that pre-date the current NodeType union. Tracked in: https://github.com/YOUR_ORG/MAP/issues
import type { AgentConfig, NodeData, NodeType } from './types';

export interface NodeLineMapping {
  nodeId: string;
  startLine: number;
  endLine: number;
}

/**
 * Generates a mapping of lines to node IDs for the text view.
 * Useful for highlighting nodes and bidirectional selection.
 */
export function getNodeLineMapping(text: string): NodeLineMapping[] {
  const lines = text.split('\n');
  const mappings: NodeLineMapping[] = [];

  // Pattern-based matching for the new "Skill Prompt" format
  let currentNodeId: string | null = null;
  let startLine = -1;

  lines.forEach((line, index) => {
    // Look for section headers or labeled lines that map to specific nodes
    if (line.match(/^(Role Definition|When to Use This Skill|Core Workflow|Reference Guide|Constraints|Output Templates|Knowledge Reference)/)) {
      if (currentNodeId && startLine >= 0) {
        mappings.push({ nodeId: currentNodeId, startLine, endLine: index - 1 });
      }
      startLine = index;
    }
  });

  return mappings;
}

/**
 * Formats an AgentConfig into the "Premium Skill Prompt" format.
 * This format is human-readable and matches professional agent/skill definitions.
 */
export function agentToText(agent: AgentConfig): string {
  // If the agent is simple or doesn't follow the Skill pattern, use a basic format
  const hasPersona = agent.nodes.some(n => n.type === 'PERSONA');
  const hasWorkflow = agent.nodes.some(n => n.type === 'STEP');

  if (!hasPersona && !hasWorkflow) {
    return basicAgentToText(agent);
  }

  // 1. Metadata Block (TSV Format requested)
  let text = `name\tdescription\tlicense\tmetadata\n`;
  const agentId = agent.id.replace('agent-', '');
  const agentDescHeader = agent.nodes.find(n => n.type === 'AGENT')?.data?.logic_snippet || agent.description || '';
  const license = agent.nodes.find(n => n.type === 'CONFIG')?.data?.license || 'MIT';

  text += `${agentId}\n`;
  text += `${agentDescHeader}\n`;
  text += `${license}\n`;

  // 2. Sub-Metadata
  const config = agent.nodes.find(n => n.type === 'CONFIG');
  const related = agent.nodes.find(n => n.label === 'Related Skills' || n.id === 'n47');

  text += `author\tversion\tdomain\ttriggers\trole\tscope\toutput-format\trelated-skills\n`;
  text += `${agent.author || 'unknown'}\n`;
  text += `${agent.version || '1.0.0'}\n`;
  text += `${config?.data?.domain || 'infrastructure'}\n`;
  text += `${(agent as any).triggers?.join(', ') || 'none'}\n`;
  text += `${config?.data?.role || 'architect'}\n`;
  text += `${config?.data?.scope || 'infrastructure'}\n`;
  text += `${config?.data?.output_format || 'architecture'}\n`;
  text += `${related?.data?.logic_snippet?.replace('related-skills: ', '') || 'none'}\n\n`;

  // 3. Title & Description
  text += `${agent.name}\n`;
  text += `${agent.description || ''}\n\n`;

  // 4. Role Definition (Persona)
  const persona = agent.nodes.find(n => n.type === 'PERSONA');
  if (persona) {
    text += `Role Definition\n`;
    text += `${persona.data?.logic_snippet || persona.description || ''}\n\n`;
  }

  // 5. When to Use This Skill (Options)
  const options = agent.nodes.filter(n => n.type === 'OPTION');
  if (options.length > 0) {
    text += `When to Use This Skill\n`;
    options.forEach(opt => {
      text += `${opt.data?.logic_snippet || opt.label}\n`;
    });
    text += '\n';
  }

  // 6. Core Workflow (Steps)
  const steps = agent.nodes.filter(n => n.type === 'STEP');
  if (steps.length > 0) {
    text += `Core Workflow\n`;
    steps.forEach(step => {
      const desc = step.data?.logic_snippet || step.description || '';
      if (desc.includes(' - ')) {
        text += `${desc}\n`;
      } else {
        text += `${step.label} - ${desc}\n`;
      }
    });
    text += '\n';
  }

  // 7. Reference Guide (Table)
  const refs = agent.nodes.filter(n => n.type === 'REFERENCE' && n.label !== 'Related Skills');
  if (refs.length > 0) {
    text += `Reference Guide\n`;
    text += `Load detailed guidance based on context:\n\n`;
    text += `Topic\tReference\tLoad When\n`;
    refs.forEach(ref => {
      // Try to parse out the fields from logic_snippet "Topic | Ref | When"
      const parts = (ref.data?.logic_snippet || '').split(' | ');
      if (parts.length >= 3) {
        text += `${parts[0]}\t${parts[1]}\t${parts[2]}\n`;
      } else {
        text += `${ref.label}\t${ref.label}.md\tAlways\n`;
      }
    });
    text += '\n';
  }

  // 8. Constraints
  const rules = agent.nodes.filter(n => n.type === 'RULE');
  if (rules.length > 0) {
    text += `Constraints\n`;

    // MUST DO
    const mustDos = rules.filter(r => r.label.toUpperCase().includes('MUST:') || r.data?.source_section?.includes('MUST DO'));
    if (mustDos.length > 0) {
      text += `MUST DO\n`;
      mustDos.forEach(r => {
        text += `${r.data?.logic_snippet || r.label.replace('MUST: ', '')}\n`;
      });
    }

    // MUST NOT DO
    const mustNotDos = rules.filter(r => r.label.toUpperCase().includes('MUST NOT:') || r.data?.source_section?.includes('MUST NOT DO'));
    if (mustNotDos.length > 0) {
      text += `MUST NOT DO\n`;
      mustNotDos.forEach(r => {
        text += `${r.data?.logic_snippet || r.label.replace('MUST NOT: ', '')}\n`;
      });
    }
    text += '\n';
  }

  // 9. Output Templates (Actions)
  const actions = agent.nodes.filter(n => n.type === 'ACTION');
  if (actions.length > 0) {
    text += `Output Templates\n`;
    const endNode = agent.nodes.find(n => n.type === 'END');
    if (endNode) {
      text += `When designing cloud architecture, provide:\n\n`;
    }
    actions.forEach(act => {
      text += `${act.data?.logic_snippet || act.label}\n`;
    });
    text += '\n';
  }

  // 10. Knowledge Reference (Footer)
  const knowledge = agent.nodes.find(n => n.label === 'Knowledge Reference');
  if (knowledge) {
    text += `Knowledge Reference\n`;
    text += `${knowledge.data?.logic_snippet || knowledge.description || ''}\n`;
  }

  return text;
}

/**
 * Basic fallback formatter
 */
function basicAgentToText(agent: AgentConfig): string {
  let text = `# ${agent.name}\n\n`;
  if (agent.description) text += `${agent.description}\n\n`;
  text += `## Nodes\n\n`;
  agent.nodes.forEach(node => {
    text += `### [${node.id}] ${node.type}: ${node.label}\n`;
    if (node.description) text += `${node.description}\n`;
    text += '\n';
  });
  text += `## Connections\n\n`;
  agent.connections.forEach(conn => {
    const s = agent.nodes.find(n => n.id === conn.source);
    const t = agent.nodes.find(n => n.id === conn.target);
    text += `- ${s?.label || conn.source} → ${t?.label || conn.target}\n`;
  });
  return text;
}

/**
 * Parses a "Premium Skill Prompt" string back into an AgentConfig.
 * Note: This is a complex parser that maps sections back to specific node types.
 */
export function textToAgent(text: string, existingAgent: AgentConfig): AgentConfig {
  // If the text starts with the legacy format, use legacy parser
  if (text.startsWith('# ') || text.includes('## Nodes')) {
    return legacyTextToAgent(text, existingAgent);
  }

  // Implement specialized parser for the "Skill Prompt" format
  // For now, we'll return the existing agent but mark it as updated.
  // In a real implementation, we'd regex out each section and update corresponding nodes.

  console.log("Parsing Premium Skill Prompt...");
  return {
    ...existingAgent,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Legacy parser for basic format
 */
function legacyTextToAgent(text: string, existingAgent: AgentConfig): AgentConfig {
  const lines = text.split('\n');
  const nodes: NodeData[] = [];
  let currentNode: Partial<NodeData> | null = null;
  let section: 'none' | 'nodes' | 'connections' = 'none';

  for (const line of lines) {
    if (line.startsWith('## Nodes')) { section = 'nodes'; continue; }
    if (line.startsWith('## Connections')) { section = 'connections'; if (currentNode?.id) nodes.push(currentNode as NodeData); continue; }

    if (section === 'nodes' && line.startsWith('### ')) {
      if (currentNode?.id) nodes.push(currentNode as NodeData);
      const match = line.match(/\[([^\]]+)\]\s+(\w+):\s*(.+)/);
      if (match) {
        const [, id, type, label] = match;
        const existing = existingAgent.nodes.find(n => n.id === id);
        currentNode = {
          id, type: type as NodeType, label: label.trim(),
          description: '', config: existing?.config || {},
          position: existing?.position || { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
        };
      }
    } else if (section === 'nodes' && currentNode && line.trim() && !line.startsWith('Config:')) {
      currentNode.description = (currentNode.description || '') + line.trim() + ' ';
    }
  }

  if (currentNode?.id) nodes.push(currentNode as NodeData);

  return {
    ...existingAgent,
    nodes: nodes.length > 0 ? nodes : existingAgent.nodes,
    updatedAt: new Date().toISOString(),
  };
}
