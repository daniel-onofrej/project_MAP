import { createHash } from 'crypto';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

let _sql: ReturnType<typeof postgres> | null = null;
function getSql(): ReturnType<typeof postgres> {
  if (!_sql) {
    _sql = postgres(DATABASE_URL!, { max: 3, idle_timeout: 30 });
  }
  return _sql;
}

/**
 * Resolve a raw Bearer token to its group scopes.
 *
 * Returns:
 *   ['*']       — MCP_AUTH_TOKEN env var match (admin bypass, all groups)
 *   string[]    — array of group UUIDs from mcp_tokens table
 *   null        — invalid / expired / not found
 *
 * If neither MCP_AUTH_TOKEN nor DATABASE_URL is set (bare dev mode), returns ['*'].
 */
export async function resolveTokenScopes(authHeader: string | undefined, remoteAddress?: string): Promise<string[] | null> {
  const raw = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  // Dev mode: no auth configured at all — allow everything regardless of token
  if (!MCP_AUTH_TOKEN && !DATABASE_URL) return ['*'];

  // Localhost / Docker-internal bypass — Claude.ai web and local tools can't inject Bearer tokens.
  // Docker bridge gateway appears as 172.x.x.x from inside the container.
  if (remoteAddress) {
    const addr = remoteAddress.replace(/^::ffff:/, ''); // normalise IPv4-mapped IPv6
    if (addr === '127.0.0.1' || addr === '::1' || addr === 'localhost' || addr.startsWith('172.') || addr.startsWith('10.')) {
      return ['*'];
    }
  }

  // No token provided (but auth is configured)
  if (!raw) return null;

  // Admin env var bypass
  if (MCP_AUTH_TOKEN && raw === MCP_AUTH_TOKEN) return ['*'];

  // Per-client DB token lookup
  if (!DATABASE_URL) return null;

  const hash = createHash('sha256').update(raw).digest('hex');
  const sql = getSql();

  const rows = await sql`
    SELECT scopes, expires_at
    FROM mcp_tokens
    WHERE token_hash = ${hash}
      AND is_active = true
  `;

  if (!rows.length) return null;

  const token = rows[0];
  if (token.expires_at && new Date(token.expires_at) < new Date()) return null;

  // Stamp last_used_at — fire-and-forget, don't block the request
  sql`
    UPDATE mcp_tokens SET last_used_at = NOW() WHERE token_hash = ${hash}
  `.catch(() => {});

  return token.scopes as string[];
}
