import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { saveAgent, getAgent, getAllAgents, deleteAgentFamily } from '../storage.js';
import { logToolCall } from '../logger.js';

export function registerAgentCrudTools(server: McpServer, getApiKey: () => string) {
  // ── create_agent_from_prompt ──────────────────────────────────────────────
  server.tool(
    'create_agent_from_prompt',
    'Create a new agent graph from a natural language prompt using Gemini AI',
    {
      prompt: z.string().describe('The natural language prompt describing the agent'),
      name: z.string().optional().describe('Optional name for the agent'),
    },
    async ({ prompt, name }) => {
      const start = Date.now();
      try {
        // Dynamic import for the lib/ prompt-to-graph module
        const mod = await import('../../../lib/prompt-to-graph/v4/index.js' as string);
        const promptToGraph = mod.promptToGraph ?? mod.default;
        const agent = await promptToGraph(prompt, { apiKey: getApiKey() });
        if (name) agent.name = name;
        await saveAgent(agent);

        logToolCall({
          tool: 'create_agent_from_prompt',
          status: 'success',
          duration: Date.now() - start,
          inputSummary: prompt.slice(0, 100),
          outputSummary: `Created agent '${agent.name}' with ${agent.nodes.length} nodes`,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              agentId: agent.id,
              name: agent.name,
              nodeCount: agent.nodes.length,
              connectionCount: agent.connections.length,
              description: agent.description || '',
            }),
          }],
        };
      } catch (err: any) {
        logToolCall({
          tool: 'create_agent_from_prompt',
          status: 'error',
          duration: Date.now() - start,
          inputSummary: prompt.slice(0, 100),
          error: err.message,
        });
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── list_agents ───────────────────────────────────────────────────────────
  server.tool(
    'list_agents',
    'List all saved agents with their summaries',
    {},
    async () => {
      const agents = await getAllAgents();
      const summaries = agents.map((a: any) => ({
        id: a.id,
        name: a.name,
        description: a.description || '',
        nodeCount: a.nodes?.length || 0,
        updatedAt: a.updatedAt,
      }));

      logToolCall({ tool: 'list_agents', status: 'success' });
      return { content: [{ type: 'text', text: JSON.stringify(summaries) }] };
    }
  );

  // ── get_agent ─────────────────────────────────────────────────────────────
  server.tool(
    'get_agent',
    'Get the full agent configuration by ID',
    {
      agentId: z.string().describe('The agent ID'),
    },
    async ({ agentId }) => {
      const agent = await getAgent(agentId);
      if (!agent) {
        return { content: [{ type: 'text', text: `Error: Agent '${agentId}' not found` }], isError: true };
      }
      logToolCall({ tool: 'get_agent', status: 'success', inputSummary: agentId });
      return { content: [{ type: 'text', text: JSON.stringify(agent) }] };
    }
  );

  // ── update_agent ──────────────────────────────────────────────────────────
  server.tool(
    'update_agent',
    'Update agent metadata (name, description)',
    {
      agentId: z.string().describe('The agent ID'),
      name: z.string().optional().describe('New name'),
      description: z.string().optional().describe('New description'),
    },
    async ({ agentId, name, description }) => {
      const agent = await getAgent(agentId);
      if (!agent) {
        return { content: [{ type: 'text', text: `Error: Agent '${agentId}' not found` }], isError: true };
      }
      if (name) agent.name = name;
      if (description) agent.description = description;
      agent.updatedAt = new Date().toISOString();
      await saveAgent(agent);

      logToolCall({ tool: 'update_agent', status: 'success', inputSummary: agentId });
      return { content: [{ type: 'text', text: JSON.stringify({ id: agent.id, name: agent.name, description: agent.description }) }] };
    }
  );

  // ── delete_agent ──────────────────────────────────────────────────────────
  server.tool(
    'delete_agent',
    'Delete an agent and all its subagents',
    {
      agentId: z.string().describe('The agent ID to delete'),
    },
    async ({ agentId }) => {
      const count = await deleteAgentFamily(agentId);
      if (count === 0) {
        return { content: [{ type: 'text', text: `Error: Agent '${agentId}' not found` }], isError: true };
      }
      logToolCall({ tool: 'delete_agent', status: 'success', inputSummary: agentId });
      return { content: [{ type: 'text', text: JSON.stringify({ deleted: true, deletedCount: count }) }] };
    }
  );
}
