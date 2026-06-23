-- Verto Database Schema
-- This file is run by PostgreSQL on first container start.
-- For schema changes after initial setup, use Drizzle migrations (npm run db:migrate).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'editor'
    CHECK (role IN ('admin', 'editor', 'viewer')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- ============================================================
-- GROUPS (workspaces / teams)
-- ============================================================
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- GROUP MEMBERSHIP
-- ============================================================
CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor'
    CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

-- ============================================================
-- AGENTS  (replaces localStorage + mcp-server/data/agents/*.json)
-- ============================================================
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,                        -- preserve existing string IDs
  name TEXT NOT NULL,
  description TEXT,
  original_prompt TEXT,                       -- can be 10k+ chars
  edited_prompt TEXT,
  nodes JSONB NOT NULL DEFAULT '[]',          -- NodeData[]
  connections JSONB NOT NULL DEFAULT '[]',    -- Connection[]
  annotations JSONB NOT NULL DEFAULT '[]',
  settings JSONB NOT NULL DEFAULT '{}',       -- AgentSettings (no api_key stored)
  runtime_package JSONB NOT NULL DEFAULT '{}',
  version TEXT,
  source_format TEXT,
  generated_with TEXT,
  current_version_id UUID,                    -- FK added after agent_versions table
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  is_public_in_org BOOLEAN NOT NULL DEFAULT false,
  parent_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  child_agent_ids TEXT[] NOT NULL DEFAULT '{}',
  agent_role TEXT,
  hub_meta JSONB,
  raw_llm_output TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agents_owner_id_idx ON agents(owner_id);
CREATE INDEX IF NOT EXISTS agents_group_id_idx ON agents(group_id);
CREATE INDEX IF NOT EXISTS agents_updated_at_idx ON agents(updated_at DESC);

-- ============================================================
-- PROMPT PULL TRACKING  (columns on agents — prompts are agents)
-- ============================================================
ALTER TABLE agents ADD COLUMN IF NOT EXISTS pull_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_pulled_at TIMESTAMPTZ;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_pulled_by TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS runtime_package JSONB NOT NULL DEFAULT '{}';

-- ============================================================
-- PROMPT AGENT LINKS  (which agents use which prompt-agent)
-- ============================================================
CREATE TABLE IF NOT EXISTS prompt_agent_links (
  prompt_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  consumer_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (prompt_agent_id, consumer_agent_id)
);

CREATE INDEX IF NOT EXISTS pal_prompt_agent_id_idx ON prompt_agent_links(prompt_agent_id);
CREATE INDEX IF NOT EXISTS pal_consumer_agent_id_idx ON prompt_agent_links(consumer_agent_id);

-- ============================================================
-- AGENT VERSIONS  (replaces localStorage version-control)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version_label TEXT NOT NULL,
  nodes JSONB NOT NULL,
  connections JSONB NOT NULL,
  runtime_package JSONB NOT NULL DEFAULT '{}',
  commit_message TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_version_id UUID REFERENCES agent_versions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_versions_agent_id_idx ON agent_versions(agent_id, created_at DESC);
ALTER TABLE agent_versions ADD COLUMN IF NOT EXISTS runtime_package JSONB NOT NULL DEFAULT '{}';

-- Add deferred FK from agents to agent_versions
ALTER TABLE agents
  ADD CONSTRAINT fk_current_version
  FOREIGN KEY (current_version_id) REFERENCES agent_versions(id)
  DEFERRABLE INITIALLY DEFERRED;

-- ============================================================
-- AGENT DEPLOYMENTS  (OpenShell persistent sandboxes)
-- ============================================================
CREATE TABLE IF NOT EXISTS runtime_gateways (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'custom'
    CHECK (mode IN ('local-docker', 'remote-docker', 'kubernetes', 'custom')),
  description TEXT,
  auth_mode TEXT NOT NULL DEFAULT 'local'
    CHECK (auth_mode IN ('local', 'mtls', 'token', 'custom')),
  config JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('unknown', 'ready', 'error')),
  last_verified_at TIMESTAMPTZ,
  last_error TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS runtime_gateways_created_by_idx ON runtime_gateways(created_by);
CREATE INDEX IF NOT EXISTS runtime_gateways_group_id_idx ON runtime_gateways(group_id);
CREATE INDEX IF NOT EXISTS runtime_gateways_status_idx ON runtime_gateways(status);

CREATE TABLE IF NOT EXISTS agent_deployments (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  agent_version_id UUID REFERENCES agent_versions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'provisioning', 'ready', 'stopped', 'error', 'deleting')),
  openshell_sandbox_name TEXT NOT NULL,
  runtime_kind TEXT NOT NULL DEFAULT 'custom'
    CHECK (runtime_kind IN ('codex', 'claude-code', 'opencode', 'gemini-cli', 'custom')),
  runtime_command TEXT NOT NULL,
  runtime_package JSONB NOT NULL DEFAULT '{}',
  manifest_version INTEGER NOT NULL DEFAULT 1,
  runtime_id TEXT NOT NULL DEFAULT 'custom',
  sandbox_image TEXT NOT NULL DEFAULT 'base',
  execution_mode TEXT NOT NULL DEFAULT 'oneshot',
  provider_mode TEXT NOT NULL DEFAULT 'legacy-env',
  gateway_id TEXT NOT NULL DEFAULT 'map',
  preflight_report JSONB NOT NULL DEFAULT '{}',
  policy_revision INTEGER NOT NULL DEFAULT 1,
  observed_phase TEXT,
  runtime_manifest JSONB NOT NULL DEFAULT '{}',
  policy_yaml TEXT NOT NULL,
  pinned_snapshot JSONB NOT NULL,
  pinned_prompt TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  last_error TEXT,
  last_log TEXT,
  deployed_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_deployments_agent_id_idx ON agent_deployments(agent_id);
CREATE INDEX IF NOT EXISTS agent_deployments_created_by_idx ON agent_deployments(created_by);
CREATE INDEX IF NOT EXISTS agent_deployments_group_id_idx ON agent_deployments(group_id);
CREATE INDEX IF NOT EXISTS agent_deployments_status_idx ON agent_deployments(status);
CREATE INDEX IF NOT EXISTS agent_deployments_runtime_id_idx ON agent_deployments(runtime_id);

CREATE TABLE IF NOT EXISTS deployment_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id TEXT NOT NULL REFERENCES agent_deployments(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool', 'thinking')),
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('pending', 'success', 'error')),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deployment_messages_deployment_id_idx
  ON deployment_messages(deployment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS deployment_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id TEXT NOT NULL REFERENCES agent_deployments(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'llm'
    CHECK (role IN ('llm', 'tool', 'mcp', 'source-control', 'data', 'custom')),
  credential_keys TEXT[] NOT NULL DEFAULT '{}',
  attach_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (attach_status IN ('pending', 'attached', 'detached', 'error')),
  config_snapshot JSONB NOT NULL DEFAULT '{}',
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS deployment_providers_deployment_id_idx ON deployment_providers(deployment_id);
CREATE INDEX IF NOT EXISTS deployment_providers_name_idx ON deployment_providers(provider_name);

CREATE TABLE IF NOT EXISTS deployment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id TEXT NOT NULL REFERENCES agent_deployments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS deployment_events_deployment_id_idx
  ON deployment_events(deployment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deployment_events_type_idx ON deployment_events(event_type);

-- ============================================================
-- AGENT SHARES  (explicit per-user sharing beyond group access)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_shares (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL DEFAULT 'view'
    CHECK (permission IN ('view', 'edit', 'comment')),
  shared_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (agent_id, user_id)
);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  -- event_type values:
  --   node_added, node_updated, node_removed
  --   connection_added, connection_removed
  --   agent_created, agent_deleted, prompt_updated
  --   version_committed, simulation_run, agent_shared
  event_type TEXT NOT NULL,
  diff JSONB,                         -- { before: {...}, after: {...} }
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_agent_id_idx ON audit_log(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_user_id_idx ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at DESC);

-- ============================================================
-- COMMENTS  (replaces in-memory Comment[] state)
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  node_id TEXT,                       -- NULL = graph-level comment
  content TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comments_agent_id_idx ON comments(agent_id, created_at DESC);

-- ============================================================
-- NODE LOCKS  (real-time editing — Figma lock model)
-- ============================================================
CREATE TABLE IF NOT EXISTS node_locks (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  locked_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,    -- NOW() + 30s, extended via heartbeat
  PRIMARY KEY (agent_id, node_id)
);

CREATE INDEX IF NOT EXISTS node_locks_expires_at_idx ON node_locks(expires_at);

-- ============================================================
-- GROUP API KEYS  (encrypted, per-provider — override .env keys)
-- ============================================================
CREATE TABLE IF NOT EXISTS group_api_keys (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  -- provider: 'gemini' | 'openai' | 'anthropic' | 'groq' | 'custom'
  provider TEXT NOT NULL,
  -- AES-256-GCM encrypted value — never stored in plain text
  key_enc TEXT NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, provider)
);

-- ============================================================
-- SESSIONS  (server-side auth — allows instant revocation)
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,    -- sha256(raw_token), never store raw
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,    -- DEFAULT: 7 days from creation
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

-- ============================================================
-- UPDATED_AT triggers
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_groups_updated_at
    BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_agent_deployments_updated_at
    BEFORE UPDATE ON agent_deployments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_runtime_gateways_updated_at
    BEFORE UPDATE ON runtime_gateways
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_deployment_providers_updated_at
    BEFORE UPDATE ON deployment_providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- MCP API TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS mcp_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  token_prefix TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mcp_tokens_token_hash_idx ON mcp_tokens(token_hash);
CREATE INDEX IF NOT EXISTS mcp_tokens_created_by_idx ON mcp_tokens(created_by);

-- No default admin user is seeded. Create the first admin through POST /api/users
-- while the users table is empty, then all later user creation is admin-only.
