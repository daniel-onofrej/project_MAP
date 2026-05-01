import 'dotenv/config';
import { createServer } from 'http';
import { createMcpServer } from './server.js';
import { handleManagementRequest } from './management-api.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { logSessionStart, logSessionEnd } from './logger.js';
import { resolveTokenScopes } from './auth.js';
import { v4 as uuidv4 } from 'uuid';

// Honour MCP_ENABLED=false — exit cleanly so the container stops without crashing
if (process.env.MCP_ENABLED === 'false') {
  console.log('MCP server is disabled (MCP_ENABLED=false). Set MCP_ENABLED=true in .env to enable.');
  process.exit(0);
}

const PORT = parseInt(process.env.MCP_PORT || '3100');
const CORS_ORIGIN = process.env.MCP_CORS_ORIGIN || 'http://localhost:3000';

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set in .env');
  return key;
}

// Track transports per session for cleanup
const transports = new Map<string, StreamableHTTPServerTransport>();

const httpServer = createServer(async (req, res) => {
  // CORS headers for all requests
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Management API routes (/api/*)
  const handled = await handleManagementRequest(req, res, CORS_ORIGIN);
  if (handled) return;

  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  // MCP protocol endpoint (/mcp)
  if (url.pathname === '/mcp') {
    if (req.method === 'POST') {
      // Validate token and resolve scopes
      const scopes = await resolveTokenScopes(req.headers['authorization'] as string | undefined, req.socket.remoteAddress);
      if (!scopes) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized — provide a valid MCP API token as Bearer token' }));
        return;
      }

      // Check for existing session
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId)!;
      } else {
        // New session — create a fresh server instance per connection
        const mcpServer = createMcpServer(getApiKey, scopes);
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => uuidv4(),
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) {
            transports.delete(sid);
            logSessionEnd(sid);
          }
        };

        await mcpServer.connect(transport);
      }

      await transport.handleRequest(req, res);

      // Store session after handleRequest — sessionId is assigned during request processing
      if (!sessionId && transport.sessionId && !transports.has(transport.sessionId)) {
        transports.set(transport.sessionId, transport);
        logSessionStart(transport.sessionId);
      }
      return;
    }

    if (req.method === 'GET') {
      // SSE fallback for older clients
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        return;
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No session. Send POST to /mcp first.' }));
      return;
    }

    if (req.method === 'DELETE') {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        transports.delete(sessionId);
        logSessionEnd(sessionId);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }
  }

  // 404 for everything else
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

httpServer.listen(PORT, () => {
  console.log(`MAP MCP Server running on http://localhost:${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Management API: http://localhost:${PORT}/api/status`);
  console.log(`CORS origin: ${CORS_ORIGIN}`);
});
