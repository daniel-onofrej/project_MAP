/**
 * MCP Server Storage — PostgreSQL backend
 * Replaces file-based storage (data/agents/*.json)
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Lazy-init connection
let _sql: ReturnType<typeof postgres> | null = null;

function getSql(): ReturnType<typeof postgres> {
  if (!_sql) {
    _sql = postgres(DATABASE_URL!, { max: 5, idle_timeout: 30 });
  }
  return _sql;
}

// ── Auth helper ─────────────────────────────────────────────────────────────
// MCP server uses a pre-shared auth token to identify its requests.
// This is not user authentication — it's service-to-service auth.

const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

export function validateAuthToken(token: string | undefined): boolean {
  if (!MCP_AUTH_TOKEN) return true; // Not configured — allow all (dev mode)
  return token === MCP_AUTH_TOKEN;
}

// ── Agent CRUD ───────────────────────────────────────────────────────────────

export async function saveAgent(agent: any): Promise<void> {
  const sql = getSql();
  const now = new Date();

  // Sanitize: never store API key
  const settings = agent.settings ? { ...agent.settings, apiKey: '' } : {};

  await sql`
    INSERT INTO agents (
      id, name, description, original_prompt, edited_prompt,
      nodes, connections, annotations, settings,
      version, source_format, generated_with,
      owner_id, is_public_in_org, parent_agent_id, child_agent_ids, agent_role,
      created_at, updated_at
    ) VALUES (
      ${agent.id},
      ${agent.name ?? 'Unnamed Agent'},
      ${agent.description ?? null},
      ${agent.originalPrompt ?? null},
      ${agent.editedPrompt ?? null},
      ${JSON.stringify(agent.nodes ?? [])}::jsonb,
      ${JSON.stringify(agent.connections ?? [])}::jsonb,
      ${JSON.stringify(agent.annotations ?? [])}::jsonb,
      ${JSON.stringify(settings)}::jsonb,
      ${agent.version ?? null},
      ${agent.sourceFormat ?? null},
      ${agent.generatedWith ?? null},
      ${agent.ownerId ?? getMcpSystemUserId()},
      ${agent.isPublicInOrg ?? false},
      ${agent.parentAgentId ?? null},
      ${agent.childAgentIds ?? []}::text[],
      ${agent.agentRole ?? null},
      ${agent.createdAt ? new Date(agent.createdAt) : now},
      ${now}
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      original_prompt = EXCLUDED.original_prompt,
      edited_prompt = EXCLUDED.edited_prompt,
      nodes = EXCLUDED.nodes,
      connections = EXCLUDED.connections,
      annotations = EXCLUDED.annotations,
      settings = EXCLUDED.settings,
      version = EXCLUDED.version,
      source_format = EXCLUDED.source_format,
      generated_with = EXCLUDED.generated_with,
      child_agent_ids = EXCLUDED.child_agent_ids,
      agent_role = EXCLUDED.agent_role,
      updated_at = ${now}
  `;
}

export async function getAgent(id: string): Promise<any | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM agents WHERE id = ${id} LIMIT 1
  `;
  if (!rows.length) return null;
  return dbRowToAgentConfig(rows[0]);
}

export async function getAllAgents(): Promise<any[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM agents ORDER BY updated_at DESC`;
  return rows.map(dbRowToAgentConfig);
}

export async function deleteAgent(id: string): Promise<boolean> {
  const sql = getSql();
  const result = await sql`DELETE FROM agents WHERE id = ${id} RETURNING id`;
  return result.length > 0;
}

export async function deleteAgentFamily(masterId: string): Promise<number> {
  const master = await getAgent(masterId);
  if (!master) return 0;
  let count = 0;
  for (const childId of (master.childAgentIds ?? [])) {
    if (await deleteAgent(childId)) count++;
  }
  if (await deleteAgent(masterId)) count++;
  return count;
}

// ── Helper: map DB snake_case row to camelCase AgentConfig ───────────────────

function dbRowToAgentConfig(row: any): any {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    originalPrompt: row.original_prompt,
    editedPrompt: row.edited_prompt,
    nodes: row.nodes ?? [],
    connections: row.connections ?? [],
    annotations: row.annotations ?? [],
    settings: row.settings ?? {},
    version: row.version,
    sourceFormat: row.source_format,
    generatedWith: row.generated_with,
    currentVersionId: row.current_version_id,
    ownerId: row.owner_id,
    groupId: row.group_id,
    isPublicInOrg: row.is_public_in_org,
    parentAgentId: row.parent_agent_id,
    childAgentIds: row.child_agent_ids ?? [],
    agentRole: row.agent_role,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
  };
}

// ── System user for MCP-created agents ─────────────────────────────────────
// MCP server creates agents on behalf of external tools (Claude Desktop).
// These agents are assigned to a dedicated "mcp-system" user if one exists,
// otherwise to the first admin user.

let _mcpSystemUserId: string | null = null;

async function getMcpSystemUserId(): Promise<string> {
  if (_mcpSystemUserId) return _mcpSystemUserId;
  const sql = getSql();
  // Try to find admin user
  const rows = await sql`
    SELECT id FROM users WHERE role = 'admin' AND is_active = true LIMIT 1
  `;
  if (rows.length) {
    _mcpSystemUserId = rows[0].id;
    return _mcpSystemUserId!;
  }
  throw new Error('No admin user found. Run db/seed.ts to create the first admin user.');
}

// ── Prompt helpers ───────────────────────────────────────────────────────────

export async function listPrompts(scopes: string[] = ['*']): Promise<Array<{
  id: string;
  name: string;
  description: string | null;
  pullCount: number;
  lastPulledAt: string | null;
  lastPulledBy: string | null;
  agentCount: number;
}>> {
  const sql = getSql();

  const rows = scopes.includes('*')
    ? await sql`
        SELECT
          a.id,
          a.name,
          a.description,
          a.pull_count AS "pullCount",
          a.last_pulled_at AS "lastPulledAt",
          a.last_pulled_by AS "lastPulledBy",
          COUNT(pal.consumer_agent_id)::int AS "agentCount"
        FROM agents a
        LEFT JOIN prompt_agent_links pal ON pal.prompt_agent_id = a.id
        WHERE a.original_prompt IS NOT NULL OR a.edited_prompt IS NOT NULL
        GROUP BY a.id
        ORDER BY a.updated_at DESC
      `
    : await sql`
        SELECT
          a.id,
          a.name,
          a.description,
          a.pull_count AS "pullCount",
          a.last_pulled_at AS "lastPulledAt",
          a.last_pulled_by AS "lastPulledBy",
          COUNT(pal.consumer_agent_id)::int AS "agentCount"
        FROM agents a
        LEFT JOIN prompt_agent_links pal ON pal.prompt_agent_id = a.id
        WHERE (a.original_prompt IS NOT NULL OR a.edited_prompt IS NOT NULL)
          AND a.group_id = ANY(${scopes}::uuid[])
        GROUP BY a.id
        ORDER BY a.updated_at DESC
      `;

  return rows as any[];
}

export async function getPromptContent(agentId: string, scopes: string[] = ['*']): Promise<{
  id: string;
  name: string;
  content: string;
} | null> {
  const sql = getSql();

  const rows = scopes.includes('*')
    ? await sql`
        SELECT id, name, COALESCE(edited_prompt, original_prompt, '') AS content
        FROM agents
        WHERE id = ${agentId}
          AND (original_prompt IS NOT NULL OR edited_prompt IS NOT NULL)
      `
    : await sql`
        SELECT id, name, COALESCE(edited_prompt, original_prompt, '') AS content
        FROM agents
        WHERE id = ${agentId}
          AND (original_prompt IS NOT NULL OR edited_prompt IS NOT NULL)
          AND group_id = ANY(${scopes}::uuid[])
      `;

  if (!rows.length) return null;
  return rows[0] as any;
}

export async function recordPromptPull(agentId: string, clientName: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE agents
    SET
      pull_count = pull_count + 1,
      last_pulled_at = NOW(),
      last_pulled_by = ${clientName}
    WHERE id = ${agentId}
  `;
}
