import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getAgent } from '../storage.js';
import { logToolCall } from '../logger.js';

export function registerAnalysisTools(server: McpServer, getApiKey: () => string) {
  // ── validate_agent ────────────────────────────────────────────────────────
  server.tool(
    'validate_agent',
    'Run rule-based validation on an agent graph (instant, no AI call)',
    {
      agentId: z.string().describe('The agent ID'),
    },
    async ({ agentId }) => {
      const agent = await getAgent(agentId);
      if (!agent) {
        return { content: [{ type: 'text', text: `Error: Agent '${agentId}' not found` }], isError: true };
      }

      const { validateAgentConfig } = await import('../../../lib/validation');
      const issues = validateAgentConfig(agent);
      const errorCount = issues.filter((i: any) => i.type === 'error').length;
      const warningCount = issues.filter((i: any) => i.type === 'warning').length;

      logToolCall({ tool: 'validate_agent', status: 'success', inputSummary: agentId });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ issues, errorCount, warningCount, total: issues.length }),
        }],
      };
    }
  );

  // ── analyze_conflicts ─────────────────────────────────────────────────────
  server.tool(
    'analyze_conflicts',
    'Run AI-powered conflict detection on an agent graph (uses Gemini)',
    {
      agentId: z.string().describe('The agent ID'),
    },
    async ({ agentId }) => {
      const start = Date.now();
      try {
        const agent = await getAgent(agentId);
        if (!agent) {
          return { content: [{ type: 'text', text: `Error: Agent '${agentId}' not found` }], isError: true };
        }

        const { analyzeGraphConflicts } = await import('../../../lib/ai/ai-conflict-analyzer');
        const issues = await analyzeGraphConflicts(agent, getApiKey());

        logToolCall({
          tool: 'analyze_conflicts',
          status: 'success',
          duration: Date.now() - start,
          inputSummary: agentId,
          outputSummary: `${issues.length} issues found`,
        });

        return { content: [{ type: 'text', text: JSON.stringify({ issues }) }] };
      } catch (err: any) {
        logToolCall({ tool: 'analyze_conflicts', status: 'error', duration: Date.now() - start, error: err.message });
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── get_complexity_metrics ────────────────────────────────────────────────
  server.tool(
    'get_complexity_metrics',
    'Compute complexity metrics for an agent graph (instant, no AI call)',
    {
      agentId: z.string().describe('The agent ID'),
    },
    async ({ agentId }) => {
      const agent = await getAgent(agentId);
      if (!agent) {
        return { content: [{ type: 'text', text: `Error: Agent '${agentId}' not found` }], isError: true };
      }

      const { calculateComplexity } = await import('../../../lib/complexity-metrics');
      const metrics = calculateComplexity(agent);

      logToolCall({ tool: 'get_complexity_metrics', status: 'success', inputSummary: agentId });
      return { content: [{ type: 'text', text: JSON.stringify(metrics) }] };
    }
  );
}
