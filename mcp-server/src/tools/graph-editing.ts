import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { saveAgent, getAgent } from '../storage.js';
import { logToolCall } from '../logger.js';

const NODE_TYPE_ENUM = z.enum([
  'AGENT', 'RULE', 'TASK', 'HANDOFF', 'TOOL', 'MEMORY', 'GUARD',
  'TRIGGER', 'CONDITION', 'RESOLUTION', 'START', 'PERSONA', 'CONFIG',
  'DECISION', 'OPTION', 'STEP', 'REFERENCE', 'ACTION', 'END', 'INPUT', 'LOGGING',
]);

export function registerGraphEditingTools(server: McpServer) {
  // ── add_node ──────────────────────────────────────────────────────────────
  server.tool(
    'add_node',
    'Add a new node to an agent graph',
    {
      agentId: z.string().describe('The agent ID'),
      type: NODE_TYPE_ENUM.describe('The node type'),
      label: z.string().describe('Display label for the node'),
      description: z.string().optional().describe('Node description'),
    },
    async ({ agentId, type, label, description }) => {
      const agent = await getAgent(agentId);
      if (!agent) {
        return { content: [{ type: 'text', text: `Error: Agent '${agentId}' not found` }], isError: true };
      }

      const nodeId = uuidv4();
      const newNode = {
        id: nodeId,
        type,
        label,
        description: description || '',
        config: {},
        position: { x: 300, y: (agent.nodes.length + 1) * 100 },
      };

      agent.nodes.push(newNode);
      agent.updatedAt = new Date().toISOString();

      // Apply auto-layout
      try {
        const { applyAutoLayout } = await import('../../../lib/graph/auto-layout');
        agent.nodes = applyAutoLayout(agent.nodes, agent.connections);
      } catch { /* layout is optional, continue without it */ }

      await saveAgent(agent);

      logToolCall({ tool: 'add_node', status: 'success', inputSummary: `${type}: ${label}` });
      return { content: [{ type: 'text', text: JSON.stringify({ nodeId, agentId, nodeCount: agent.nodes.length }) }] };
    }
  );

  // ── remove_node ───────────────────────────────────────────────────────────
  server.tool(
    'remove_node',
    'Remove a node and its connections from an agent graph',
    {
      agentId: z.string().describe('The agent ID'),
      nodeId: z.string().describe('The node ID to remove'),
    },
    async ({ agentId, nodeId }) => {
      const agent = await getAgent(agentId);
      if (!agent) {
        return { content: [{ type: 'text', text: `Error: Agent '${agentId}' not found` }], isError: true };
      }

      const nodeIndex = agent.nodes.findIndex((n: any) => n.id === nodeId);
      if (nodeIndex === -1) {
        return { content: [{ type: 'text', text: `Error: Node '${nodeId}' not found` }], isError: true };
      }

      agent.nodes.splice(nodeIndex, 1);
      const connsBefore = agent.connections.length;
      agent.connections = agent.connections.filter(
        (c: any) => c.source !== nodeId && c.target !== nodeId
      );
      const connsRemoved = connsBefore - agent.connections.length;
      agent.updatedAt = new Date().toISOString();
      await saveAgent(agent);

      logToolCall({ tool: 'remove_node', status: 'success', inputSummary: nodeId });
      return { content: [{ type: 'text', text: JSON.stringify({ removed: true, connectionsRemoved: connsRemoved }) }] };
    }
  );

  // ── add_connection ────────────────────────────────────────────────────────
  server.tool(
    'add_connection',
    'Add a directed edge between two nodes',
    {
      agentId: z.string().describe('The agent ID'),
      sourceNodeId: z.string().describe('Source node ID'),
      targetNodeId: z.string().describe('Target node ID'),
      type: z.enum(['default', 'handoff', 'escalation', 'callback']).optional().describe('Connection type'),
      condition: z.string().optional().describe('Condition label for the edge'),
    },
    async ({ agentId, sourceNodeId, targetNodeId, type: connType, condition }) => {
      const agent = await getAgent(agentId);
      if (!agent) {
        return { content: [{ type: 'text', text: `Error: Agent '${agentId}' not found` }], isError: true };
      }

      const sourceExists = agent.nodes.some((n: any) => n.id === sourceNodeId);
      const targetExists = agent.nodes.some((n: any) => n.id === targetNodeId);
      if (!sourceExists || !targetExists) {
        return { content: [{ type: 'text', text: 'Error: Source or target node not found' }], isError: true };
      }

      const connectionId = uuidv4();
      agent.connections.push({
        id: connectionId,
        source: sourceNodeId,
        target: targetNodeId,
        type: connType || 'default',
        condition,
      });
      agent.updatedAt = new Date().toISOString();
      await saveAgent(agent);

      logToolCall({ tool: 'add_connection', status: 'success', inputSummary: `${sourceNodeId} → ${targetNodeId}` });
      return { content: [{ type: 'text', text: JSON.stringify({ connectionId }) }] };
    }
  );

  // ── remove_connection ─────────────────────────────────────────────────────
  server.tool(
    'remove_connection',
    'Remove a connection from an agent graph',
    {
      agentId: z.string().describe('The agent ID'),
      connectionId: z.string().describe('The connection ID to remove'),
    },
    async ({ agentId, connectionId }) => {
      const agent = await getAgent(agentId);
      if (!agent) {
        return { content: [{ type: 'text', text: `Error: Agent '${agentId}' not found` }], isError: true };
      }

      const before = agent.connections.length;
      agent.connections = agent.connections.filter((c: any) => c.id !== connectionId);
      if (agent.connections.length === before) {
        return { content: [{ type: 'text', text: `Error: Connection '${connectionId}' not found` }], isError: true };
      }

      agent.updatedAt = new Date().toISOString();
      await saveAgent(agent);

      logToolCall({ tool: 'remove_connection', status: 'success', inputSummary: connectionId });
      return { content: [{ type: 'text', text: JSON.stringify({ removed: true }) }] };
    }
  );
}
