import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const APP_VERSION = process.env.APP_VERSION || '0.1.0';

async function main() {
  const transport = new StreamableHTTPClientTransport(
    new URL('http://localhost:3100/mcp')
  );
  
  const client = new Client({
    name: 'test-client',
    version: APP_VERSION
  });

  await client.connect(transport);
  console.log('Connected!');

  const result = await client.callTool({ name: 'list_agents', arguments: {} });
  console.log('list_agents result:', JSON.stringify(result, null, 2));

  await client.close();
}

main().catch(console.error);
