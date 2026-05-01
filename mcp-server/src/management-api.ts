import type { IncomingMessage, ServerResponse } from 'http';
import { getActiveSessions, getHistory, getStats } from './logger.js';
import { getAllAgents } from './storage.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONFIG_FILE = join(__dirname, '..', 'data', 'config.json');

const startTime = Date.now();

function getConfig(): any {
  if (!existsSync(CONFIG_FILE)) return { enabledTools: [] };
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
}

function saveConfig(config: any): void {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

function sendJson(res: ServerResponse, data: any, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Invalid JSON body')); }
    });
  });
}

export async function handleManagementRequest(
  req: IncomingMessage,
  res: ServerResponse,
  corsOrigin: string,
): Promise<boolean> {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const path = url.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // Only handle /api/* routes
  if (!path.startsWith('/api/')) return false;

  if (path === '/api/status' && req.method === 'GET') {
    const agents = await getAllAgents();
    sendJson(res, {
      status: 'running',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      port: parseInt(process.env.MCP_PORT || '3100'),
      version: '1.0.0',
      agentCount: agents.length,
    });
    return true;
  }

  if (path === '/api/sessions' && req.method === 'GET') {
    const active = getActiveSessions();
    sendJson(res, { active, total: active.length });
    return true;
  }

  if (path === '/api/history' && req.method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const tool = url.searchParams.get('tool') || undefined;
    const result = getHistory(limit, offset, tool);
    sendJson(res, result);
    return true;
  }

  if (path === '/api/stats' && req.method === 'GET') {
    sendJson(res, getStats());
    return true;
  }

  if (path === '/api/tools/toggle' && req.method === 'POST') {
    const body = await parseBody(req);
    const config = getConfig();
    if (!config.enabledTools) config.enabledTools = [];

    if (body.enabled) {
      if (!config.enabledTools.includes(body.tool)) {
        config.enabledTools.push(body.tool);
      }
    } else {
      config.enabledTools = config.enabledTools.filter((t: string) => t !== body.tool);
    }
    saveConfig(config);
    sendJson(res, { tool: body.tool, enabled: body.enabled });
    return true;
  }

  sendJson(res, { error: 'Not found' }, 404);
  return true;
}
