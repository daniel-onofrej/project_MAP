import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listPrompts, getPromptContent, recordPromptPull } from '../storage.js';
import { logToolCall } from '../logger.js';

export function registerPromptTools(server: McpServer, scopes: string[] = ['*']) {
  // ── list_prompts ─────────────────────────────────────────────────────────────
  server.tool(
    'list_prompts',
    'List all available prompts in the MAP prompt library with usage statistics',
    {},
    async () => {
      const start = Date.now();
      try {
        const prompts = await listPrompts(scopes);
        logToolCall({
          tool: 'list_prompts',
          status: 'success',
          duration: Date.now() - start,
          outputSummary: `Listed ${prompts.length} prompts`,
        });
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(prompts, null, 2),
          }],
        };
      } catch (err: any) {
        logToolCall({ tool: 'list_prompts', status: 'error', duration: Date.now() - start, error: err.message });
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── pull_prompt ───────────────────────────────────────────────────────────────
  server.tool(
    'pull_prompt',
    'Pull the full content of a prompt by its agent ID. Records the pull for tracking in the Agent Hub.',
    {
      promptId: z.string().describe('The agent ID of the prompt to pull'),
      clientName: z.string().optional().describe('Name of the client pulling the prompt (e.g. "claude-code")'),
    },
    async ({ promptId, clientName }) => {
      const start = Date.now();
      const caller = clientName ?? 'mcp-client';
      try {
        const prompt = await getPromptContent(promptId, scopes);
        if (!prompt) {
          return { content: [{ type: 'text' as const, text: `Error: Prompt '${promptId}' not found or not accessible` }], isError: true };
        }
        await recordPromptPull(promptId, caller);
        logToolCall({
          tool: 'pull_prompt',
          status: 'success',
          duration: Date.now() - start,
          inputSummary: `${promptId} by ${caller}`,
          outputSummary: `Pulled '${prompt.name}' (${prompt.content.length} chars)`,
        });
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ id: prompt.id, name: prompt.name, content: prompt.content }),
          }],
        };
      } catch (err: any) {
        logToolCall({ tool: 'pull_prompt', status: 'error', duration: Date.now() - start, error: err.message });
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
