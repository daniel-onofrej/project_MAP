#!/usr/bin/env node
/**
 * stdio → HTTP bridge for MAP MCP server.
 * Claude Desktop runs this; it forwards requests to the local HTTP MCP server
 * with the Bearer token injected.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const TOKEN = process.env.MCP_AUTH_TOKEN;
const SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3100/mcp';
const APP_VERSION = process.env.APP_VERSION || '0.1.0';

if (!TOKEN) {
  process.stderr.write(
    'MCP_AUTH_TOKEN is not set. Generate one with `openssl rand -hex 32` and ' +
    'export it (or set it in your Claude Desktop MCP config `env` block) before running this bridge.\n'
  );
  process.exit(1);
}

async function main() {
  const httpTransport = new StreamableHTTPClientTransport(new URL(SERVER_URL), {
    requestInit: {
      headers: { Authorization: `Bearer ${TOKEN}` },
    },
  });

  const client = new Client({ name: 'stdio-bridge', version: APP_VERSION });
  await client.connect(httpTransport);

  const { tools } = await client.listTools();

  const server = new Server(
    { name: 'MAP', version: APP_VERSION },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    return client.callTool({ name: req.params.name, arguments: req.params.arguments });
  });

  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
}

main().catch((err) => {
  process.stderr.write(`Bridge error: ${err.message}\n`);
  process.exit(1);
});
