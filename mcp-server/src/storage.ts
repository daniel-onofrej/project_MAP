/**
 * MCP Server Storage — PostgreSQL backend
 * Replaces file-based storage (data/agents/*.json)
 */
import { createHash, randomBytes } from 'node:crypto';
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

// ── Deployment helpers ──────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function groupScopes(scopes: string[]): string[] {
  return scopes.filter((scope) => UUID_RE.test(scope));
}

function dbRowToDeployment(row: any): any {
  return {
    id: row.id,
    name: row.name,
    agentId: row.agent_id,
    agentName: row.agent_name,
    status: row.status,
    openshellSandboxName: row.openshell_sandbox_name,
    runtimeKind: row.runtime_kind,
    runtimeCommand: row.runtime_command,
    runtimePackage: row.runtime_package ?? {},
    manifestVersion: row.manifest_version ?? 1,
    runtimeId: row.runtime_id ?? row.runtime_kind,
    sandboxImage: row.sandbox_image ?? 'base',
    executionMode: row.execution_mode ?? 'oneshot',
    providerMode: row.provider_mode ?? 'legacy-env',
    gatewayId: row.gateway_id ?? 'map',
    preflightReport: row.preflight_report ?? {},
    policyRevision: row.policy_revision ?? 1,
    observedPhase: row.observed_phase ?? null,
    runtimeManifest: row.runtime_manifest ?? {},
    groupId: row.group_id,
    lastError: row.last_error,
    lastLog: row.last_log,
    deployedAt: row.deployed_at?.toISOString?.() ?? null,
    stoppedAt: row.stopped_at?.toISOString?.() ?? null,
    createdAt: row.created_at?.toISOString?.() ?? null,
    updatedAt: row.updated_at?.toISOString?.() ?? null,
    policyYaml: row.policy_yaml,
    pinnedPrompt: row.pinned_prompt,
  };
}

export async function listDeployments(scopes: string[] = ['*']): Promise<any[]> {
  const sql = getSql();
  const groups = groupScopes(scopes);
  const rows = scopes.includes('*')
    ? await sql`
        SELECT d.*, a.name AS agent_name
        FROM agent_deployments d
        INNER JOIN agents a ON a.id = d.agent_id
        ORDER BY d.updated_at DESC
      `
    : groups.length === 0
      ? []
      : await sql`
          SELECT d.*, a.name AS agent_name
          FROM agent_deployments d
          INNER JOIN agents a ON a.id = d.agent_id
          WHERE d.group_id = ANY(${groups}::uuid[])
          ORDER BY d.updated_at DESC
        `;
  return rows.map(dbRowToDeployment);
}

export async function getDeployment(deploymentId: string, scopes: string[] = ['*']): Promise<any | null> {
  const sql = getSql();
  const groups = groupScopes(scopes);
  const rows = scopes.includes('*')
    ? await sql`
        SELECT d.*, a.name AS agent_name
        FROM agent_deployments d
        INNER JOIN agents a ON a.id = d.agent_id
        WHERE d.id = ${deploymentId}
        LIMIT 1
      `
    : groups.length === 0
      ? []
      : await sql`
          SELECT d.*, a.name AS agent_name
          FROM agent_deployments d
          INNER JOIN agents a ON a.id = d.agent_id
          WHERE d.id = ${deploymentId}
            AND d.group_id = ANY(${groups}::uuid[])
          LIMIT 1
        `;
  if (!rows.length) return null;
  return dbRowToDeployment(rows[0]);
}

export async function createScopedMcpToken(name: string, scopes: string[] = ['*']): Promise<string> {
  const sql = getSql();
  const token = `verto_${randomBytes(16).toString('hex')}`;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const tokenPrefix = token.slice(0, 8);
  await sql`
    INSERT INTO mcp_tokens (name, token_hash, token_prefix, scopes, created_by)
    VALUES (
      ${name},
      ${tokenHash},
      ${tokenPrefix},
      ${scopes},
      ${await getMcpSystemUserId()}
    )
  `;
  return token;
}

export async function createDeploymentRecord(params: {
  id: string;
  agent: any;
  name: string;
  sandboxName: string;
  runtimeKind: string;
  runtimeCommand: string;
  manifest: any;
  preflightReport: any;
}): Promise<any> {
  const sql = getSql();
  const currentVersionId = typeof params.agent.currentVersionId === 'string' && UUID_RE.test(params.agent.currentVersionId)
    ? params.agent.currentVersionId
    : null;
  const pinnedPrompt = params.agent.editedPrompt ?? params.agent.originalPrompt ?? '';
  const groupId = params.agent.groupId && UUID_RE.test(params.agent.groupId) ? params.agent.groupId : null;
  const createdBy = await getMcpSystemUserId();
  const [row] = await sql`
    INSERT INTO agent_deployments (
      id,
      agent_id,
      agent_version_id,
      name,
      status,
      openshell_sandbox_name,
      runtime_kind,
      runtime_command,
      runtime_package,
      manifest_version,
      runtime_id,
      sandbox_image,
      execution_mode,
      provider_mode,
      gateway_id,
      preflight_report,
      policy_revision,
      observed_phase,
      runtime_manifest,
      policy_yaml,
      pinned_snapshot,
      pinned_prompt,
      created_by,
      group_id
    ) VALUES (
      ${params.id},
      ${params.agent.id},
      ${currentVersionId},
      ${params.name},
      'pending',
      ${params.sandboxName},
      ${params.runtimeKind},
      ${params.runtimeCommand},
      ${JSON.stringify(params.manifest.package ?? {})}::jsonb,
      2,
      ${params.manifest.runtime?.id ?? params.runtimeKind},
      ${params.manifest.runtime?.image ?? 'base'},
      ${params.manifest.runtime?.executionMode ?? 'oneshot'},
      ${params.manifest.security?.providerMode ?? 'providers-v2'},
      ${params.manifest.gateway?.id ?? 'map'},
      ${JSON.stringify(params.preflightReport)}::jsonb,
      1,
      'pending',
      ${JSON.stringify(params.manifest)}::jsonb,
      ${params.manifest.policy?.yaml ?? ''},
      ${JSON.stringify(params.agent)}::jsonb,
      ${pinnedPrompt},
      ${createdBy},
      ${groupId}
    )
    RETURNING *
  `;

  for (const provider of params.manifest.providers ?? []) {
    await sql`
      INSERT INTO deployment_providers (
        deployment_id,
        provider_name,
        provider_type,
        role,
        credential_keys,
        attach_status,
        config_snapshot
      ) VALUES (
        ${params.id},
        ${provider.name},
        ${provider.type},
        ${provider.role ?? 'llm'},
        ${provider.credentialKeys ?? []},
        'pending',
        ${JSON.stringify({
          id: provider.id,
          mode: provider.mode,
          env: provider.env,
          config: provider.config,
          sourceEnv: provider.sourceEnv,
          endpoints: provider.endpoints,
          attach: provider.attach,
          useForInference: provider.useForInference,
        })}::jsonb
      )
      ON CONFLICT (deployment_id, provider_name) DO UPDATE SET
        provider_type = EXCLUDED.provider_type,
        role = EXCLUDED.role,
        credential_keys = EXCLUDED.credential_keys,
        config_snapshot = EXCLUDED.config_snapshot,
        updated_at = NOW()
    `;
  }

  await sql`
    INSERT INTO deployment_events (deployment_id, event_type, message, metadata)
    VALUES
      (${params.id}, 'created', 'Deployment created through MCP.', ${JSON.stringify({ runtimeId: params.manifest.runtime?.id })}::jsonb),
      (${params.id}, 'preflight', 'Preflight passed through MCP.', ${JSON.stringify({ checks: params.preflightReport.checks ?? [] })}::jsonb)
  `;

  return dbRowToDeployment({ ...row, agent_name: params.agent.name });
}

export async function addDeploymentMessage(params: {
  deploymentId: string;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'thinking';
  content: string;
  status?: 'pending' | 'success' | 'error';
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO deployment_messages (deployment_id, role, content, status, metadata)
    VALUES (
      ${params.deploymentId},
      ${params.role},
      ${params.content},
      ${params.status ?? 'success'},
      ${JSON.stringify(params.metadata ?? {})}::jsonb
    )
  `;
}
