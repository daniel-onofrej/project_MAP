import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAgentCrudTools } from './tools/agent-crud.js';
import { registerGraphEditingTools } from './tools/graph-editing.js';
import { registerExecutionTools } from './tools/execution.js';
import { registerAnalysisTools } from './tools/analysis.js';
import { registerSyncTools } from './tools/sync.js';
import { registerPromptTools } from './tools/prompts.js';

export function createMcpServer(getApiKey: () => string, scopes: string[] = ['*']): McpServer {
  const server = new McpServer({
    name: 'MAP-agent-architect',
    version: '1.0.0',
  });

  registerAgentCrudTools(server, getApiKey);
  registerGraphEditingTools(server);
  registerExecutionTools(server, getApiKey);
  registerAnalysisTools(server, getApiKey);
  registerSyncTools(server);
  registerPromptTools(server, scopes);

  return server;
}
