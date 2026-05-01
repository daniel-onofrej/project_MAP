import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getAgent } from '../storage.js';
import { logToolCall } from '../logger.js';

export function registerExecutionTools(server: McpServer, getApiKey: () => string) {
  server.tool(
    'run_agent',
    'Execute an agent graph with input text and return execution trace. Requires Gemini API key configured on the server.',
    {
      agentId: z.string().describe('The agent ID to run'),
      input: z.string().describe('The input text to process'),
      maxSteps: z.number().int().min(1).max(100).optional().describe('Max execution steps (default 50)'),
    },
    async ({ agentId, input, maxSteps }) => {
      const start = Date.now();
      try {
        const agent = await getAgent(agentId);
        if (!agent) {
          return { content: [{ type: 'text', text: `Error: Agent '${agentId}' not found` }], isError: true };
        }

        // Inject API key into agent settings for execution
        agent.settings = {
          ...agent.settings,
          llmProvider: 'gemini',
          apiKey: getApiKey(),
          model: agent.settings?.model || 'gemini-3-flash-preview',
          temperature: agent.settings?.temperature ?? 0,
        };

        const { AgentRunner } = await import('../../../lib/agent-runner');
        const runner = new AgentRunner(agent, input);

        const steps: any[] = [];
        let totalTokens = 0;
        let finalStatus = 'completed';
        let stepCount = 0;
        const limit = maxSteps || 50;

        for await (const step of runner.run()) {
          steps.push({
            nodeId: step.nodeId,
            nodeType: step.nodeType,
            nodeLabel: step.nodeLabel,
            status: step.status,
            input: step.input?.slice(0, 500),
            output: step.output?.slice(0, 500),
            tokenCount: step.tokenCount || 0,
          });
          totalTokens += step.tokenCount || 0;
          stepCount++;

          if (step.status === 'error') {
            finalStatus = 'error';
            break;
          }
          if (stepCount >= limit) break;
        }

        logToolCall({
          tool: 'run_agent',
          status: 'success',
          duration: Date.now() - start,
          inputSummary: `${agent.name}: ${input.slice(0, 80)}`,
          outputSummary: `${steps.length} steps, ${totalTokens} tokens`,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ steps, totalTokens, status: finalStatus, stepCount }),
          }],
        };
      } catch (err: any) {
        logToolCall({
          tool: 'run_agent',
          status: 'error',
          duration: Date.now() - start,
          error: err.message,
        });
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
