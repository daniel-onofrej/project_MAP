import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getAgent, saveAgent } from '../storage.js';
import { logToolCall } from '../logger.js';

export function registerSyncTools(server: McpServer) {
  // ── resync_graph_to_prompt ────────────────────────────────────────────────
  server.tool(
    'resync_graph_to_prompt',
    'Reconstruct the original prompt from the current graph state (deterministic, no AI call)',
    {
      agentId: z.string().describe('The agent ID'),
    },
    async ({ agentId }) => {
      const agent = await getAgent(agentId);
      if (!agent) {
        return { content: [{ type: 'text', text: `Error: Agent '${agentId}' not found` }], isError: true };
      }

      const { reSyncGraphToPrompt } = await import('../../../lib/graph/graph-to-prompt');
      const result = await reSyncGraphToPrompt(agent);

      logToolCall({
        tool: 'resync_graph_to_prompt',
        status: 'success',
        inputSummary: agentId,
        outputSummary: `similarity: ${(result.similarity * 100).toFixed(1)}%`,
      });

      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  // ── export_agent ──────────────────────────────────────────────────────────
  server.tool(
    'export_agent',
    'Export an agent as full JSON',
    {
      agentId: z.string().describe('The agent ID'),
    },
    async ({ agentId }) => {
      const agent = await getAgent(agentId);
      if (!agent) {
        return { content: [{ type: 'text', text: `Error: Agent '${agentId}' not found` }], isError: true };
      }
      logToolCall({ tool: 'export_agent', status: 'success', inputSummary: agentId });
      return { content: [{ type: 'text', text: JSON.stringify(agent) }] };
    }
  );

  // ── import_agent ──────────────────────────────────────────────────────────
  server.tool(
    'import_agent',
    'Import an agent from JSON data',
    {
      agentJson: z.string().describe('Full AgentConfig JSON string'),
    },
    async ({ agentJson }) => {
      try {
        const parsed = JSON.parse(agentJson);
        // Ensure required fields
        if (!parsed.id) parsed.id = crypto.randomUUID();
        if (!parsed.name) parsed.name = 'Imported Agent';
        if (!parsed.nodes) parsed.nodes = [];
        if (!parsed.connections) parsed.connections = [];
        if (!parsed.version) parsed.version = '1.0.0';
        if (!parsed.createdAt) parsed.createdAt = new Date().toISOString();
        parsed.updatedAt = new Date().toISOString();

        saveAgent(parsed);

        logToolCall({
          tool: 'import_agent',
          status: 'success',
          outputSummary: `Imported '${parsed.name}'`,
        });

        return { content: [{ type: 'text', text: JSON.stringify({ agentId: parsed.id, name: parsed.name }) }] };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
