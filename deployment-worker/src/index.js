import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import postgres from 'postgres'

const PORT = Number(process.env.DEPLOYMENT_WORKER_PORT || 3200)
const DATABASE_URL = process.env.DATABASE_URL
const OPENSHELL_GATEWAY_URL = process.env.OPENSHELL_GATEWAY_URL || 'http://openshell-gateway:8080'
const WORKSPACE = process.env.DEPLOYMENT_WORKSPACE || '/var/lib/map-deployments'
const COMMAND_TIMEOUT_MS = Number(process.env.DEPLOYMENT_COMMAND_TIMEOUT_MS || 120000)
const APP_VERSION = process.env.APP_VERSION || '0.1.0'
const OPENSHELL_RUNTIME_ENABLED = process.env.OPENSHELL_RUNTIME_ENABLED !== 'false'
const OPENSHELL_RUNTIME_V2_ENABLED = process.env.OPENSHELL_RUNTIME_V2_ENABLED !== 'false'
const OPENSHELL_ALLOW_LEGACY_SECRET_ENV = process.env.OPENSHELL_ALLOW_LEGACY_SECRET_ENV === 'true'
const OPENSHELL_ALLOW_RAW_CLI = process.env.OPENSHELL_ALLOW_RAW_CLI === 'true'
const OPENSHELL_RUNTIME_DISABLED_MESSAGE =
  'OpenShell runtime is disabled. Set OPENSHELL_RUNTIME_ENABLED=true to enable sandbox operations.'
const RUNTIME_TRACE_PREFIX = '__MAP_RUNTIME_TRACE__'
const ANSI_PATTERN = /[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g
const OSC_PATTERN = /\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g
const OPENSHELL_TIMESTAMP_PATTERN = /\[(\d{10})(?:\.(\d{1,6}))?\]/g

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required')
}

const sql = postgres(DATABASE_URL, { max: 5, idle_timeout: 30 })

async function ensureDeploymentSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS runtime_gateways (
      id text PRIMARY KEY,
      name text NOT NULL,
      endpoint text NOT NULL,
      mode text NOT NULL DEFAULT 'custom' CHECK (mode IN ('local-docker', 'remote-docker', 'kubernetes', 'custom')),
      description text,
      auth_mode text NOT NULL DEFAULT 'local' CHECK (auth_mode IN ('local', 'mtls', 'token', 'custom')),
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'ready', 'error')),
      last_verified_at timestamptz,
      last_error text,
      is_default boolean NOT NULL DEFAULT false,
      created_by uuid REFERENCES users(id) ON DELETE set null,
      group_id uuid REFERENCES groups(id) ON DELETE set null,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS agent_deployments (
      id text PRIMARY KEY,
      agent_id text NOT NULL REFERENCES agents(id) ON DELETE cascade,
      agent_version_id uuid REFERENCES agent_versions(id) ON DELETE set null,
      name text NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'provisioning', 'ready', 'stopped', 'error', 'deleting')),
      openshell_sandbox_name text NOT NULL,
      runtime_kind text NOT NULL DEFAULT 'custom' CHECK (runtime_kind IN ('codex', 'claude-code', 'opencode', 'gemini-cli', 'custom')),
      runtime_command text NOT NULL,
      runtime_package jsonb NOT NULL DEFAULT '{}'::jsonb,
      manifest_version integer NOT NULL DEFAULT 1,
      runtime_id text NOT NULL DEFAULT 'custom',
      sandbox_image text NOT NULL DEFAULT 'base',
      execution_mode text NOT NULL DEFAULT 'oneshot',
      provider_mode text NOT NULL DEFAULT 'legacy-env',
      gateway_id text NOT NULL DEFAULT 'map',
      preflight_report jsonb NOT NULL DEFAULT '{}'::jsonb,
      policy_revision integer NOT NULL DEFAULT 1,
      observed_phase text,
      runtime_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
      policy_yaml text NOT NULL,
      pinned_snapshot jsonb NOT NULL,
      pinned_prompt text NOT NULL,
      created_by uuid NOT NULL REFERENCES users(id) ON DELETE cascade,
      group_id uuid REFERENCES groups(id) ON DELETE set null,
      last_error text,
      last_log text,
      deployed_at timestamptz,
      stopped_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS deployment_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      deployment_id text NOT NULL REFERENCES agent_deployments(id) ON DELETE cascade,
      role text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool', 'thinking')),
      content text NOT NULL,
      status text NOT NULL DEFAULT 'success' CHECK (status IN ('pending', 'success', 'error')),
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS deployment_providers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      deployment_id text NOT NULL REFERENCES agent_deployments(id) ON DELETE cascade,
      provider_name text NOT NULL,
      provider_type text NOT NULL,
      role text NOT NULL DEFAULT 'llm',
      credential_keys text[] NOT NULL DEFAULT '{}',
      attach_status text NOT NULL DEFAULT 'pending' CHECK (attach_status IN ('pending', 'attached', 'detached', 'error')),
      config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
      last_verified_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (deployment_id, provider_name)
    )
  `
  await sql`ALTER TABLE deployment_providers ADD COLUMN IF NOT EXISTS credential_keys text[] NOT NULL DEFAULT '{}'`
  await sql`
    UPDATE deployment_providers
    SET credential_keys = COALESCE(
      (
        SELECT array_agg(value)
        FROM jsonb_array_elements_text(credential_key_names) AS value
      ),
      '{}'::text[]
    )
    WHERE credential_keys = '{}'
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'deployment_providers'
          AND column_name = 'credential_key_names'
      )
  `.catch(() => {})
  await sql`
    CREATE TABLE IF NOT EXISTS deployment_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      deployment_id text NOT NULL REFERENCES agent_deployments(id) ON DELETE cascade,
      event_type text NOT NULL,
      message text NOT NULL,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS agent_deployments_agent_id_idx ON agent_deployments(agent_id)`
  await sql`CREATE INDEX IF NOT EXISTS runtime_gateways_created_by_idx ON runtime_gateways(created_by)`
  await sql`CREATE INDEX IF NOT EXISTS runtime_gateways_group_id_idx ON runtime_gateways(group_id)`
  await sql`CREATE INDEX IF NOT EXISTS runtime_gateways_status_idx ON runtime_gateways(status)`
  await sql`ALTER TABLE deployment_messages DROP CONSTRAINT IF EXISTS deployment_messages_role_check`
  await sql`
    ALTER TABLE deployment_messages
    ADD CONSTRAINT deployment_messages_role_check
    CHECK (role IN ('user', 'assistant', 'system', 'tool', 'thinking'))
  `
  await sql`ALTER TABLE agent_deployments DROP CONSTRAINT IF EXISTS agent_deployments_runtime_kind_check`
  await sql`
    ALTER TABLE agent_deployments
    ADD CONSTRAINT agent_deployments_runtime_kind_check
    CHECK (runtime_kind IN ('codex', 'claude-code', 'opencode', 'gemini-cli', 'custom'))
  `
  await sql`ALTER TABLE agent_deployments ADD COLUMN IF NOT EXISTS runtime_package jsonb NOT NULL DEFAULT '{}'::jsonb`
  await sql`ALTER TABLE agent_deployments ADD COLUMN IF NOT EXISTS manifest_version integer NOT NULL DEFAULT 1`
  await sql`ALTER TABLE agent_deployments ADD COLUMN IF NOT EXISTS runtime_id text NOT NULL DEFAULT 'custom'`
  await sql`ALTER TABLE agent_deployments ADD COLUMN IF NOT EXISTS sandbox_image text NOT NULL DEFAULT 'base'`
  await sql`ALTER TABLE agent_deployments ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'oneshot'`
  await sql`ALTER TABLE agent_deployments ADD COLUMN IF NOT EXISTS provider_mode text NOT NULL DEFAULT 'legacy-env'`
  await sql`ALTER TABLE agent_deployments ADD COLUMN IF NOT EXISTS gateway_id text NOT NULL DEFAULT 'map'`
  await sql`ALTER TABLE agent_deployments ADD COLUMN IF NOT EXISTS preflight_report jsonb NOT NULL DEFAULT '{}'::jsonb`
  await sql`ALTER TABLE agent_deployments ADD COLUMN IF NOT EXISTS policy_revision integer NOT NULL DEFAULT 1`
  await sql`ALTER TABLE agent_deployments ADD COLUMN IF NOT EXISTS observed_phase text`
  await sql`ALTER TABLE agent_deployments ADD COLUMN IF NOT EXISTS runtime_manifest jsonb NOT NULL DEFAULT '{}'::jsonb`
  await sql`
    UPDATE agent_deployments
    SET runtime_id = COALESCE(NULLIF(runtime_id, ''), runtime_kind),
        sandbox_image = COALESCE(NULLIF(sandbox_image, ''), 'base'),
        execution_mode = COALESCE(NULLIF(execution_mode, ''), 'oneshot'),
        provider_mode = COALESCE(NULLIF(provider_mode, ''), 'legacy-env'),
        gateway_id = COALESCE(NULLIF(gateway_id, ''), 'map'),
        policy_revision = COALESCE(policy_revision, 1)
  `
  await sql`CREATE INDEX IF NOT EXISTS agent_deployments_created_by_idx ON agent_deployments(created_by)`
  await sql`CREATE INDEX IF NOT EXISTS agent_deployments_group_id_idx ON agent_deployments(group_id)`
  await sql`CREATE INDEX IF NOT EXISTS agent_deployments_status_idx ON agent_deployments(status)`
  await sql`CREATE INDEX IF NOT EXISTS agent_deployments_runtime_id_idx ON agent_deployments(runtime_id)`
  await sql`CREATE INDEX IF NOT EXISTS deployment_messages_deployment_id_idx ON deployment_messages(deployment_id, created_at)`
  await sql`CREATE INDEX IF NOT EXISTS deployment_providers_deployment_id_idx ON deployment_providers(deployment_id)`
  await sql`CREATE INDEX IF NOT EXISTS deployment_events_deployment_id_idx ON deployment_events(deployment_id, created_at)`
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
  })
}

function formatOpenShellTimestamp(secondsText, fractionText = '') {
  const seconds = Number(secondsText)
  if (!Number.isFinite(seconds)) return null

  const milliseconds = Math.round(Number(`0.${fractionText || '0'}`) * 1000)
  const date = new Date((seconds * 1000) + milliseconds)
  const year = date.getUTCFullYear()
  if (year < 2000 || year > 2100) return null

  return date.toISOString().replace('T', ' ').replace('Z', 'Z')
}

function removeBackspaceSequences(value) {
  let output = value
  while (output.includes('\b')) {
    const next = output.replace(/[^\n]\b/g, '').replace(/^\b/gm, '')
    if (next === output) return next.replace(/\b/g, '')
    output = next
  }
  return output
}

function cleanTerminalOutput(value) {
  if (!value) return ''
  return removeBackspaceSequences(String(value))
    .replace(OSC_PATTERN, '')
    .replace(ANSI_PATTERN, '')
    .replace(/\r\n?/g, '\n')
    .replace(OPENSHELL_TIMESTAMP_PATTERN, (match, secondsText, fractionText) => {
      const formatted = formatOpenShellTimestamp(secondsText, fractionText)
      return formatted ? `[${formatted}]` : match
    })
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '')
    .trim()
}

function limitedTraceString(value, maxLength) {
  if (value === undefined || value === null) return undefined
  const text = String(value).trim()
  return text ? text.slice(0, maxLength) : undefined
}

function parseRuntimeTraces(rawOutput) {
  const traces = []
  const visibleLines = []

  for (const line of String(rawOutput || '').split(/\r?\n/)) {
    const markerIndex = line.indexOf(RUNTIME_TRACE_PREFIX)
    if (markerIndex < 0) {
      visibleLines.push(line)
      continue
    }

    const beforeMarker = line.slice(0, markerIndex).trim()
    if (beforeMarker) visibleLines.push(beforeMarker)

    const payloadText = line.slice(markerIndex + RUNTIME_TRACE_PREFIX.length).trim()
    try {
      const payload = JSON.parse(payloadText)
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        traces.push({
          type: limitedTraceString(payload.type, 40) || 'thinking',
          message: limitedTraceString(payload.message, 1000) || 'Runtime activity',
          toolName: limitedTraceString(payload.toolName, 120),
          command: limitedTraceString(payload.command, 500),
          sourcePath: limitedTraceString(payload.sourcePath, 500),
          output: limitedTraceString(payload.output, 4000),
          durationMs: Number.isFinite(Number(payload.durationMs)) ? Number(payload.durationMs) : undefined,
        })
      }
    } catch {
      visibleLines.push(line)
    }
  }

  return {
    output: cleanTerminalOutput(visibleLines.join('\n')),
    traces,
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const gatewayUrl = options.gatewayUrl || OPENSHELL_GATEWAY_URL
    const child = spawn(command, args, {
      env: {
        ...process.env,
        OPENSHELL_GATEWAY_URL: gatewayUrl,
        OPENSHELL_GATEWAY_ENDPOINT: gatewayUrl,
        MCP_AUTH_TOKEN: process.env.MCP_AUTH_TOKEN || '',
        MCP_INTERNAL_URL: process.env.MCP_INTERNAL_URL || 'http://mcp-server:3100/mcp',
        ...(options.env || {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Command timed out after ${options.timeoutMs ?? COMMAND_TIMEOUT_MS}ms: ${command} ${args.join(' ')}`))
    }, options.timeoutMs ?? COMMAND_TIMEOUT_MS)

    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const cleanStdout = cleanTerminalOutput(stdout)
      const cleanStderr = cleanTerminalOutput(stderr)
      const output = [cleanStdout, cleanStderr].filter(Boolean).join('\n').trim()
      if (code === 0) {
        resolve({ stdout: cleanStdout, stderr: cleanStderr, output })
      } else {
        reject(new Error(output || `${command} exited with code ${code}`))
      }
    })

    if (options.input) child.stdin.write(options.input)
    child.stdin.end()
  })
}

async function bestEffort(command, args, options = {}) {
  try {
    const result = await run(command, args, options)
    return { ...result, ok: true }
  } catch (err) {
    return { stdout: '', stderr: '', output: cleanTerminalOutput(err instanceof Error ? err.message : String(err)), ok: false }
  }
}

function fallbackGateway() {
  return {
    id: 'map',
    name: 'Local MAP gateway',
    endpoint: OPENSHELL_GATEWAY_URL,
    mode: 'local-docker',
    auth_mode: 'local',
  }
}

async function getGateway(id = 'map') {
  if (!id || id === 'map') return fallbackGateway()
  const rows = await sql`
    SELECT *
    FROM runtime_gateways
    WHERE id = ${id}
    LIMIT 1
  `
  return rows[0] ?? fallbackGateway()
}

async function ensureGateway(gatewayOrId = 'map') {
  const gateway = typeof gatewayOrId === 'string' ? await getGateway(gatewayOrId) : gatewayOrId
  const gatewayName = String(gateway.id || 'map')
  const endpoint = String(gateway.endpoint || OPENSHELL_GATEWAY_URL)
  const addArgs = ['gateway', 'add', endpoint, '--name', gatewayName]
  if (gateway.mode === 'local-docker') addArgs.push('--local')
  await bestEffort('openshell', addArgs, {
    timeoutMs: 30000,
    gatewayUrl: endpoint,
  })
  const selected = await bestEffort('openshell', ['gateway', 'select', gatewayName], {
    timeoutMs: 30000,
    gatewayUrl: endpoint,
  })
  return { ...gateway, id: gatewayName, endpoint, output: selected.output }
}

async function verifyGateway(gatewayId) {
  const gateway = await ensureGateway(gatewayId)
  const result = await bestEffort('openshell', ['gateway', 'list'], {
    timeoutMs: 30000,
    gatewayUrl: gateway.endpoint,
  })
  const auth = await bestEffort('openshell', ['gateway', 'auth', 'status'], {
    timeoutMs: 30000,
    gatewayUrl: gateway.endpoint,
  })
  const providers = await bestEffort('openshell', ['provider', 'list-profiles', '-o', 'json'], {
    timeoutMs: 30000,
    gatewayUrl: gateway.endpoint,
  })
  const images = await bestEffort('openshell', ['sandbox', 'image', 'list', '-o', 'json'], {
    timeoutMs: 30000,
    gatewayUrl: gateway.endpoint,
  })
  const inference = await bestEffort('openshell', ['inference', 'get', '-o', 'json'], {
    timeoutMs: 30000,
    gatewayUrl: gateway.endpoint,
  })
  const status = result.ok ? 'ready' : 'error'
  if (gateway.id !== 'map') {
    await sql`
      UPDATE runtime_gateways
      SET status = ${status},
          last_verified_at = NOW(),
          last_error = ${result.ok ? null : result.output || 'Gateway verification failed'},
          updated_at = NOW()
      WHERE id = ${gateway.id}
    `.catch(() => {})
  }
  return {
    gatewayId: gateway.id,
    endpoint: gateway.endpoint,
    status,
    output: result.output,
    checks: [
      { id: 'gateway', label: 'Gateway connectivity', status: result.ok ? 'pass' : 'fail', output: result.output },
      { id: 'gateway-auth', label: 'Gateway auth boundary', status: auth.ok ? 'pass' : 'warn', output: auth.output },
      { id: 'provider-profiles', label: 'Provider profiles', status: providers.ok ? 'pass' : 'warn', output: providers.output },
      { id: 'sandbox-images', label: 'Sandbox images', status: images.ok ? 'pass' : 'warn', output: images.output },
      { id: 'inference-local-route', label: 'inference.local route', status: inference.ok ? 'pass' : 'warn', output: inference.output },
    ],
    auth: { status: auth.ok ? 'ready' : 'unknown', output: auth.output },
    providerProfiles: { status: providers.ok ? 'ready' : 'unknown', output: providers.output },
    images: { status: images.ok ? 'ready' : 'unknown', output: images.output },
    inferenceRoute: { status: inference.ok ? 'ready' : 'unknown', output: inference.output, route: asObject(inference.output) },
  }
}

async function getDeployment(id) {
  const rows = await sql`
    SELECT *
    FROM agent_deployments
    WHERE id = ${id}
    LIMIT 1
  `
  return rows[0] ?? null
}

async function getDeploymentProviders(id) {
  return await sql`
    SELECT *
    FROM deployment_providers
    WHERE deployment_id = ${id}
    ORDER BY created_at ASC
  `
}

async function addEvent(id, eventType, message, metadata = {}) {
  await sql`
    INSERT INTO deployment_events (deployment_id, event_type, message, metadata)
    VALUES (${id}, ${eventType}, ${message}, ${sql.json(metadata)})
  `.catch(() => {})
}

async function updateProviderStatus(id, providerName, attachStatus, metadata = {}) {
  await sql`
    UPDATE deployment_providers
    SET attach_status = ${attachStatus},
        last_verified_at = CASE WHEN ${attachStatus} = 'attached' THEN NOW() ELSE last_verified_at END,
        config_snapshot = config_snapshot || ${sql.json(metadata)},
        updated_at = NOW()
    WHERE deployment_id = ${id}
      AND provider_name = ${providerName}
  `.catch(() => {})
}

async function setProvisioning(id) {
  await sql`
    UPDATE agent_deployments
    SET status = 'provisioning', observed_phase = 'Provisioning', last_error = NULL, last_log = NULL, updated_at = NOW()
    WHERE id = ${id}
  `
  await addEvent(id, 'worker_action', 'Provisioning started')
}

async function setReady(id, log) {
  const cleanLog = cleanTerminalOutput(log)
  await sql`
    UPDATE agent_deployments
    SET status = 'ready', observed_phase = 'Ready', deployed_at = NOW(), stopped_at = NULL, last_error = NULL,
        last_log = ${cleanLog || null}, updated_at = NOW()
    WHERE id = ${id}
  `
  await addEvent(id, 'status_changed', 'Sandbox is ready', { phase: 'Ready' })
}

async function setStopped(id, log) {
  const cleanLog = cleanTerminalOutput(log)
  await sql`
    UPDATE agent_deployments
    SET status = 'stopped', observed_phase = 'Stopped', stopped_at = NOW(), last_log = ${cleanLog || null}, updated_at = NOW()
    WHERE id = ${id}
  `
  await addEvent(id, 'status_changed', 'Sandbox stopped', { phase: 'Stopped' })
}

async function setError(id, error) {
  const cleanError = cleanTerminalOutput(error)
  await sql`
    UPDATE agent_deployments
    SET status = 'error', observed_phase = 'Error', last_error = ${cleanError}, last_log = ${cleanError}, updated_at = NOW()
    WHERE id = ${id}
  `
  await addEvent(id, 'error', 'Deployment worker failed', { error: cleanError })
}

async function setLastLog(id, log) {
  const cleanLog = cleanTerminalOutput(log)
  await sql`
    UPDATE agent_deployments
    SET last_log = ${cleanLog}, updated_at = NOW()
    WHERE id = ${id}
  `
}

function deploymentDir(id) {
  return join(WORKSPACE, id)
}

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function manifestOf(deployment) {
  const manifest = asObject(deployment.runtime_manifest)
  if (manifest.version === 2) return manifest

  return {
    version: 2,
    gateway: {
      id: deployment.gateway_id || 'map',
    },
    runtime: {
      id: deployment.runtime_id || deployment.runtime_kind || 'custom',
      command: deployment.runtime_command,
      image: deployment.sandbox_image || 'base',
      executionMode: deployment.execution_mode || 'oneshot',
      workdir: '/sandbox',
    },
    providers: [],
    package: asObject(deployment.runtime_package),
    policy: { yaml: deployment.policy_yaml || '' },
    security: {
      providerMode: deployment.provider_mode || 'legacy-env',
      legacySecretEnvAllowed: OPENSHELL_ALLOW_LEGACY_SECRET_ENV,
    },
    resources: {},
    labels: {
      'map.deployment': deployment.id,
      'map.agent': deployment.agent_id,
      'map.runtime': deployment.runtime_id || deployment.runtime_kind || 'custom',
    },
  }
}

function runtimePackage(deployment) {
  const manifest = manifestOf(deployment)
  const pkg = asObject(manifest.package && Object.keys(asObject(manifest.package)).length ? manifest.package : deployment.runtime_package)
  return {
    env: asObject(pkg.env),
    secretEnv: asObject(pkg.secretEnv),
    tools: asArray(pkg.tools),
    scripts: asArray(pkg.scripts),
    files: asArray(pkg.files),
    ports: asArray(pkg.ports),
    connections: asArray(pkg.connections),
    securityNotes: asArray(pkg.securityNotes),
  }
}

function cleanEnvName(value) {
  return String(value || '').replace(/[^A-Z0-9_]/gi, '_')
}

function runtimeCommandTemplate(deployment) {
  const manifest = manifestOf(deployment)
  return String(manifest.runtime?.command || deployment.runtime_command || '')
}

function runtimeId(deployment) {
  const manifest = manifestOf(deployment)
  return String(manifest.runtime?.id || deployment.runtime_id || deployment.runtime_kind || '').trim()
}

function runtimeBinary(deployment) {
  const binaries = {
    'claude-code': 'claude',
    codex: 'codex',
    opencode: 'opencode',
    'gemini-cli': 'gemini',
  }
  const manifest = manifestOf(deployment)
  const id = runtimeId(deployment)
  return String(manifest.runtime?.binary || binaries[id] || '').trim()
}

function sandboxImage(deployment) {
  const manifest = manifestOf(deployment)
  return String(manifest.runtime?.image || deployment.sandbox_image || 'base')
}

function sandboxWorkdir(deployment) {
  const manifest = manifestOf(deployment)
  return String(manifest.runtime?.workdir || '/sandbox')
}

function providerMode(deployment) {
  const manifest = manifestOf(deployment)
  return String(manifest.security?.providerMode || deployment.provider_mode || 'legacy-env')
}

function legacySecretEnvAllowed(deployment) {
  const manifest = manifestOf(deployment)
  return OPENSHELL_ALLOW_LEGACY_SECRET_ENV || manifest.security?.legacySecretEnvAllowed === true
}

const OPEN_NETWORK_POLICY_BLOCK = `network_policies:
  llm_and_map_services:
    name: llm-and-map-services
    endpoints:
      - host: api.openai.com
        port: 443
        protocol: rest
        enforcement: enforce
        access: full
      - host: api.anthropic.com
        port: 443
        protocol: rest
        enforcement: enforce
        access: full
      - host: generativelanguage.googleapis.com
        port: 443
        protocol: rest
        enforcement: enforce
        access: full
      - host: integrate.api.nvidia.com
        port: 443
        protocol: rest
        enforcement: enforce
        access: full
      - host: mcp-server
        port: 3100
        protocol: rest
        enforcement: enforce
        access: full
    binaries:
      - path: /usr/bin/curl
      - path: /usr/local/bin/curl
      - path: /usr/bin/node
      - path: /usr/local/bin/node
      - path: /usr/bin/python3
      - path: /usr/local/bin/python3
      - path: /usr/bin/codex
      - path: /usr/local/bin/codex
      - path: /usr/bin/claude
      - path: /usr/local/bin/claude
      - path: /usr/bin/opencode
      - path: /usr/local/bin/opencode
      - path: /usr/bin/gemini
      - path: /usr/local/bin/gemini`

function normalizeOpenShellPolicyYaml(value) {
  const yaml = String(value || '').trimEnd()
  const legacyOpenNetworkPattern = /network_policies:\s*\n\s+default:\s*\n\s+outbound:\s*allow\s*$/i
  if (legacyOpenNetworkPattern.test(yaml)) {
    return `${yaml.replace(legacyOpenNetworkPattern, OPEN_NETWORK_POLICY_BLOCK)}\n`
  }
  return `${yaml}\n`
}

function manifestPolicyYaml(deployment) {
  const manifest = manifestOf(deployment)
  return normalizeOpenShellPolicyYaml(manifest.policy?.yaml || deployment.policy_yaml || '')
}

function manifestLabels(deployment) {
  const manifest = manifestOf(deployment)
  return asObject(manifest.labels)
}

function manifestResources(deployment) {
  const manifest = manifestOf(deployment)
  return asObject(manifest.resources)
}

function safePackagePath(path, fallback) {
  const clean = String(path || fallback)
    .replace(/^\/+/, '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/')
  return clean || fallback
}

async function writeDeploymentFiles(deployment, inputText = null, history = [], providerCredentialValues = {}) {
  const dir = deploymentDir(deployment.id)
  await mkdir(dir, { recursive: true })
  const policyPath = join(dir, 'policy.yaml')
  const promptPath = join(dir, 'prompt.md')
  const inputPath = join(dir, 'input.txt')
  const historyPath = join(dir, 'history.json')
  const packagePath = join(dir, 'runtime-package.json')
  const envPath = join(dir, 'env.sh')
  await writeFile(policyPath, manifestPolicyYaml(deployment), 'utf8')
  await writeFile(promptPath, deployment.pinned_prompt, 'utf8')
  if (inputText !== null) await writeFile(inputPath, inputText, 'utf8')
  const safeHistory = Array.isArray(history)
    ? history
      .slice(-24)
      .map((entry) => ({
        role: String(entry?.role || '').slice(0, 32),
        content: String(entry?.content || '').slice(0, 4000),
        createdAt: String(entry?.createdAt || '').slice(0, 80),
      }))
      .filter((entry) => entry.role && entry.content)
    : []
  await writeFile(historyPath, JSON.stringify(safeHistory, null, 2), 'utf8')

  const pkg = runtimePackage(deployment)
  await writeFile(packagePath, JSON.stringify(pkg, null, 2), 'utf8')
  const runtimeEnv = {
    ...pkg.env,
    MAP_PROMPT_PATH: '/sandbox/map/prompt.md',
    MAP_INPUT_PATH: '/sandbox/map/input.txt',
    MAP_HISTORY_PATH: '/sandbox/map/history.json',
    MCP_INTERNAL_URL: process.env.MCP_INTERNAL_URL || pkg.env.MCP_INTERNAL_URL || 'http://mcp-server:3100/mcp',
  }
  const envLines = Object.entries(runtimeEnv).map(([key, value]) => {
    const name = cleanEnvName(key)
    return `export ${name}=${quoteShellPath(String(value))}`
  })
  const canUseLegacySecrets = providerMode(deployment) === 'legacy-env' && legacySecretEnvAllowed(deployment)
  const secretEnvLines = Object.entries(pkg.secretEnv).map(([runtimeKey, sourceKey]) => {
    const runtimeName = cleanEnvName(runtimeKey)
    const sourceName = cleanEnvName(sourceKey)
    if (!runtimeName || !sourceName) return ''
    if (!canUseLegacySecrets) {
      return `# MAP secret ${runtimeName} is managed by OpenShell provider attachment (${sourceName})`
    }
    const value = process.env[sourceName]
    if (!value) return `# MAP secret ${runtimeName} not injected: worker env ${sourceName} is not set`
    return `export ${runtimeName}=${quoteShellPath(String(value))}`
  }).filter(Boolean)
  const providerSecretLines = []
  const providerRows = Object.keys(providerCredentialValues).length > 0
    ? await getDeploymentProviders(deployment.id)
    : []
  for (const provider of providerRows) {
    const env = providerCredentialEnv(provider, providerCredentialValues)
    for (const [key, value] of Object.entries(env)) {
      const name = cleanEnvName(key)
      if (name && value) providerSecretLines.push(`export ${name}=${quoteShellPath(String(value))}`)
    }
  }
  await writeFile(envPath, `${[...envLines, ...secretEnvLines, ...providerSecretLines].join('\n')}\n`, 'utf8')

  const packageUploads = [
    { localPath: packagePath, remotePath: '/sandbox/map/runtime-package.json' },
    { localPath: envPath, remotePath: '/sandbox/map/env.sh' },
    { localPath: historyPath, remotePath: '/sandbox/map/history.json' },
  ]

  for (const [index, script] of pkg.scripts.entries()) {
    const relativePath = safePackagePath(script.path, `scripts/script-${index + 1}.sh`)
    const localPath = join(dir, relativePath)
    await mkdir(dirname(localPath), { recursive: true }).catch(() => {})
    await writeFile(localPath, String(script.content || ''), 'utf8')
    packageUploads.push({ localPath, remotePath: `/sandbox/map/${relativePath}` })
  }

  for (const [index, file] of pkg.files.entries()) {
    const relativePath = safePackagePath(file.path, `files/file-${index + 1}.txt`)
    const localPath = join(dir, relativePath)
    await mkdir(dirname(localPath), { recursive: true }).catch(() => {})
    await writeFile(localPath, String(file.content || ''), 'utf8')
    packageUploads.push({ localPath, remotePath: `/sandbox/map/${relativePath}` })
  }

  return { dir, policyPath, promptPath, inputPath, historyPath, packagePath, envPath, packageUploads, pkg }
}

async function cleanupSensitiveFiles(files) {
  await unlink(files.envPath).catch(() => {})
}

async function sandboxExists(name, gateway) {
  try {
    await run('openshell', ['sandbox', 'get', name], { timeoutMs: 30000, gatewayUrl: gateway?.endpoint })
    return true
  } catch {
    return false
  }
}

async function waitForSandboxReady(name, gateway, timeoutMs = 120000) {
  const startedAt = Date.now()
  let lastOutput = ''

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await run('openshell', ['sandbox', 'get', name], { timeoutMs: 30000, gatewayUrl: gateway?.endpoint })
      lastOutput = result.output
      if (cleanTerminalOutput(result.output).includes('Phase: Ready')) return result.output
    } catch (err) {
      lastOutput = err instanceof Error ? err.message : String(err)
    }

    await sleep(1000)
  }

  throw new Error(`Sandbox ${name} did not reach Ready. Last output:\n${lastOutput}`)
}

async function deleteSandbox(name, gateway) {
  if (!(await sandboxExists(name, gateway))) return `Sandbox ${name} was already absent.`
  const result = await run('openshell', ['sandbox', 'delete', name], { timeoutMs: 120000, gatewayUrl: gateway?.endpoint })
  return result.output
}

function providerSnapshot(provider) {
  return asObject(provider.config_snapshot)
}

function isMapMcpProvider(provider) {
  const snapshot = providerSnapshot(provider)
  return snapshot.id === 'map-mcp' || String(provider.provider_name || '').startsWith('map-mcp-')
}

function providerCredentialKeys(provider) {
  if (isMapMcpProvider(provider)) return ['MCP_AUTH_TOKEN']
  return asArray(provider.credential_keys ?? provider.credential_key_names)
    .map((key) => cleanEnvName(key))
    .filter(Boolean)
}

function providerConfigValues(provider) {
  const snapshot = providerSnapshot(provider)
  const config = asObject(snapshot.config)
  return Object.fromEntries(
    Object.entries(config)
      .map(([key, value]) => [cleanEnvName(key), String(value || '').trim()])
      .filter(([key, value]) => key && value),
  )
}

function providerSecretBag(provider, providerCredentialValues = {}) {
  const snapshot = providerSnapshot(provider)
  const candidates = [
    provider.provider_name,
    snapshot.id,
    snapshot.type,
    provider.provider_type,
  ].filter(Boolean).map(String)

  for (const candidate of candidates) {
    const match = providerCredentialValues[candidate]
    if (match && typeof match === 'object' && !Array.isArray(match)) return match
  }

  return {}
}

function providerCredentialEnv(provider, providerCredentialValues = {}) {
  const snapshot = providerSnapshot(provider)
  const sourceEnv = asObject(snapshot.sourceEnv)
  const secrets = providerSecretBag(provider, providerCredentialValues)
  const env = {}

  for (const credentialKey of providerCredentialKeys(provider)) {
    const sourceKey = cleanEnvName(sourceEnv[credentialKey] || credentialKey)
    const value = secrets[credentialKey] || secrets[sourceKey] || process.env[sourceKey] || process.env[credentialKey]
    if (value) env[credentialKey] = String(value)
  }

  return env
}

function providerCreateOrUpdateArgs(provider, exists, hasExplicitCredentials) {
  const name = String(provider.provider_name)
  const type = String(provider.provider_type || providerSnapshot(provider).id || 'custom-api')
  const args = exists
    ? ['provider', 'update', name]
    : ['provider', 'create', '--name', name, '--type', type]

  const config = providerConfigValues(provider)
  for (const [key, value] of Object.entries(config)) {
    args.push('--config', `${key}=${value}`)
  }

  const credentialKeys = providerCredentialKeys(provider)
  if (credentialKeys.length > 0 && hasExplicitCredentials) {
    for (const key of credentialKeys) args.push('--credential', key)
  } else if (!exists) {
    if (type === 'generic') return null
    args.push('--from-existing')
  }

  return args
}

function missingProviderCredentialMessage(provider) {
  const keys = providerCredentialKeys(provider)
  const snapshot = providerSnapshot(provider)
  const sourceEnv = asObject(snapshot.sourceEnv)
  const sources = keys
    .map((key) => cleanEnvName(sourceEnv[key] || key))
    .filter(Boolean)
  const visibleSources = Array.from(new Set([...sources, ...keys]))
  return `Provider ${provider.provider_name} needs credentials before OpenShell can create it. Set one of these env vars on deployment-worker or submit a one-time secret: ${visibleSources.join(', ')}.`
}

async function ensureProvidersV2Enabled(gateway) {
  if (!OPENSHELL_RUNTIME_V2_ENABLED) return ''
  const result = await bestEffort('openshell', [
    'settings',
    'set',
    '--global',
    '--key',
    'providers_v2_enabled',
    '--value',
    'true',
    '--yes',
  ], { timeoutMs: 30000, gatewayUrl: gateway?.endpoint })
  return result.output
}

async function ensureOpenShellProviders(deployment, providerCredentialValues = {}, gateway) {
  const mode = providerMode(deployment)
  if (!OPENSHELL_RUNTIME_V2_ENABLED || mode === 'legacy-env' || mode === 'direct') return []

  await ensureProvidersV2Enabled(gateway)
  const providers = await getDeploymentProviders(deployment.id)
  const attached = []

  for (const provider of providers) {
    const snapshot = providerSnapshot(provider)
    if (snapshot.attach === false) continue

    const env = providerCredentialEnv(provider, providerCredentialValues)
    const hasExplicitCredentials = Object.keys(env).length > 0
    const existing = await bestEffort('openshell', ['provider', 'get', provider.provider_name], { timeoutMs: 30000, gatewayUrl: gateway?.endpoint })
    const args = providerCreateOrUpdateArgs(provider, existing.ok, hasExplicitCredentials)
    if (!args) {
      const message = missingProviderCredentialMessage(provider)
      await updateProviderStatus(deployment.id, provider.provider_name, 'error', { lastError: message })
      await addEvent(deployment.id, 'preflight', message, {
        providerType: provider.provider_type,
        credentialKeys: providerCredentialKeys(provider),
      })
      continue
    }
    const result = await bestEffort('openshell', args, { timeoutMs: 60000, env, gatewayUrl: gateway?.endpoint })

    if (result.ok || existing.ok) {
      attached.push(provider.provider_name)
      await updateProviderStatus(deployment.id, provider.provider_name, 'attached', {
        lastWorkerAction: args.slice(0, 3).join(' '),
      })
      await addEvent(deployment.id, 'provider_attached', `Provider ${provider.provider_name} is ready for attachment.`, {
        providerType: provider.provider_type,
      })
    } else {
      await updateProviderStatus(deployment.id, provider.provider_name, 'error', { lastError: result.output })
      await addEvent(deployment.id, 'preflight', `Provider ${provider.provider_name} could not be created. Sandbox will continue without attaching it.`, {
        providerType: provider.provider_type,
        output: result.output,
      })
    }
  }

  return attached
}

async function configureInferenceRouting(deployment, providerNames, gateway) {
  if (providerMode(deployment) !== 'inference-local' || providerNames.length === 0) return ''
  const providers = await getDeploymentProviders(deployment.id)
  const provider = providers.find((row) => providerNames.includes(row.provider_name) && providerSnapshot(row).useForInference !== false)
  if (!provider) return ''

  const snapshot = providerSnapshot(provider)
  const env = asObject(snapshot.env)
  const config = asObject(snapshot.config)
  const model = String(env.OPENAI_MODEL || env.ANTHROPIC_MODEL || env.GEMINI_MODEL || config.MODEL || config.OPENAI_MODEL || '').trim()
  if (!model) return ''

  const result = await bestEffort('openshell', [
    'inference',
    'set',
    '--provider',
    provider.provider_name,
    '--model',
    model,
    '--no-verify',
  ], { timeoutMs: 60000, gatewayUrl: gateway?.endpoint })

  await addEvent(deployment.id, 'provider_updated', `Inference routing pointed at ${provider.provider_name}.`, {
    model,
    output: result.output,
  })
  return result.output
}

function sandboxCreateArgs(deployment, files, providerNames) {
  const args = [
    'sandbox',
    'create',
    '--name',
    deployment.openshell_sandbox_name,
    '--policy',
    files.policyPath,
  ]

  for (const [key, value] of Object.entries(manifestLabels(deployment))) {
    if (!key || value === undefined || value === null || value === '') continue
    args.push('--label', `${key}=${String(value)}`)
  }

  for (const providerName of providerNames) {
    args.push('--provider', providerName)
  }

  const resources = manifestResources(deployment)
  if (resources.cpu) args.push('--cpu', String(resources.cpu))
  if (resources.memory) args.push('--memory', String(resources.memory))
  if (resources.gpu) args.push('--gpu')

  args.push('--from', sandboxImage(deployment), '--no-tty', '--', 'true')
  return args
}

async function verifyRuntimeBinary(deployment, gateway) {
  const binary = runtimeBinary(deployment)
  if (!binary) return ''
  const result = await bestEffort('openshell', [
    'sandbox',
    'exec',
    '-n',
    deployment.openshell_sandbox_name,
    '--workdir',
    sandboxWorkdir(deployment),
    '--',
    '/bin/sh',
    '-lc',
    `command -v ${quoteShellPath(binary)} || true`,
  ], { timeoutMs: 30000, gatewayUrl: gateway?.endpoint })
  return result.output
}

async function exposePackageServices(deployment, ports, gateway) {
  const outputs = []
  for (const port of ports) {
    const containerPort = Number(port.containerPort || port.port)
    if (!Number.isFinite(containerPort) || containerPort <= 0) continue
    const name = String(port.name || '').trim()
    const args = ['service', 'expose', deployment.openshell_sandbox_name, String(containerPort)]
    if (name) args.push(name)
    const result = await bestEffort('openshell', args, { timeoutMs: 60000, gatewayUrl: gateway?.endpoint })
    if (result.output) outputs.push(result.output)
  }
  return outputs.join('\n')
}

async function provisionDeployment(id, options = {}) {
  const deployment = await getDeployment(id)
  if (!deployment) throw new Error('Deployment not found')

  await setProvisioning(id)
  const gateway = await ensureGateway(deployment.gateway_id || manifestOf(deployment).gateway?.id || 'map')
  const files = await writeDeploymentFiles(deployment)
  const providerNames = await ensureOpenShellProviders(deployment, options.providerCredentialValues || {}, gateway)
  const inferenceOutput = await configureInferenceRouting(deployment, providerNames, gateway)

  if (await sandboxExists(deployment.openshell_sandbox_name, gateway)) {
    await deleteSandbox(deployment.openshell_sandbox_name, gateway)
  }

  let createOutput = ''
  try {
    const createArgs = sandboxCreateArgs(deployment, files, providerNames)
    await addEvent(deployment.id, 'worker_action', 'Creating OpenShell sandbox.', {
      sandbox: deployment.openshell_sandbox_name,
      args: createArgs,
    })
    const result = await run('openshell', createArgs, { timeoutMs: 180000, gatewayUrl: gateway.endpoint })
    createOutput = result.output
  } catch (err) {
    const errorOutput = err instanceof Error ? err.message : String(err)
    if (!(await sandboxExists(deployment.openshell_sandbox_name, gateway))) {
      throw new Error(`OpenShell sandbox create failed before ${deployment.openshell_sandbox_name} existed:\n${errorOutput}`)
    }
    const readyOutput = await waitForSandboxReady(deployment.openshell_sandbox_name, gateway, 30000)
    createOutput = [
      'OpenShell create returned after the sandbox was created; continuing because the sandbox is Ready.',
      errorOutput,
      readyOutput,
    ].filter(Boolean).join('\n')
  }

  const mkdirResult = await run('openshell', [
    'sandbox',
    'exec',
    '-n',
    deployment.openshell_sandbox_name,
    '--workdir',
    sandboxWorkdir(deployment),
    '--',
    'mkdir',
    '-p',
    '/sandbox/map',
  ], { timeoutMs: 60000, gatewayUrl: gateway.endpoint })

  await bestEffort('openshell', [
    'sandbox',
    'upload',
    deployment.openshell_sandbox_name,
    files.promptPath,
    '/sandbox/map/prompt.md',
  ], { timeoutMs: 60000, gatewayUrl: gateway.endpoint })

  try {
    for (const upload of files.packageUploads) {
      await bestEffort('openshell', [
        'sandbox',
        'upload',
        deployment.openshell_sandbox_name,
        upload.localPath,
        upload.remotePath,
      ], { timeoutMs: 60000, gatewayUrl: gateway.endpoint })
    }
  } finally {
    await cleanupSensitiveFiles(files)
  }

  const startupScripts = files.pkg.scripts.filter((script) => script.runOnStart)
  for (const script of startupScripts) {
    const remotePath = `/sandbox/map/${safePackagePath(script.path, 'scripts/start.sh')}`
    await bestEffort('openshell', [
      'sandbox',
      'exec',
      '-n',
      deployment.openshell_sandbox_name,
      '--workdir',
      sandboxWorkdir(deployment),
      '--',
      '/bin/sh',
      '-lc',
      `. /sandbox/map/env.sh || true; /bin/sh ${quoteShellPath(remotePath)}`,
    ], { timeoutMs: 60000, gatewayUrl: gateway.endpoint })
  }

  const runtimeCheckOutput = await verifyRuntimeBinary(deployment, gateway)
  const serviceOutput = await exposePackageServices(deployment, files.pkg.ports, gateway)
  const output = [inferenceOutput, createOutput, mkdirResult.output, runtimeCheckOutput, serviceOutput].filter(Boolean).join('\n')
  await setReady(id, output)
  return { status: 'ready', output }
}

function quoteShellPath(path) {
  return `'${path.replace(/'/g, "'\\''")}'`
}

const GEMINI_CHAT_RESPONSE_RULES = [
  'Runtime response rules:',
  '- Return only the final user-facing assistant message.',
  '- Do not describe plans, reasoning, file inspection, shell commands, tool discovery, or sandbox environment checks.',
  '- If a requested tool or data source is unavailable, say so briefly and ask for the next user-facing detail.',
].join('\\n')

function guardedGeminiCommand() {
  return `gemini -p "$(printf '%s\\n\\n${GEMINI_CHAT_RESPONSE_RULES}\\n\\nUser input:\\n%s' "$(cat {prompt})" "$(cat {input})")"`
}

function resolveRuntimeCommand(template, deployment = null) {
  const rawTemplate = String(template || '')
  const shouldGuardGemini =
    (deployment && runtimeId(deployment) === 'gemini-cli') ||
    /^gemini(?:\s|$)/.test(rawTemplate.trim())
  const compatibleTemplate = shouldGuardGemini
    ? guardedGeminiCommand()
    : rawTemplate
      .replace(
        'codex exec --system-prompt-file {prompt} "$(cat {input})"',
        'codex exec "$(printf \'%s\\n\\nUser input:\\n%s\' "$(cat {prompt})" "$(cat {input})")"',
      )
      .replace(
        'codex exec "$(cat {prompt})\n\nUser input:\n$(cat {input})"',
        'codex exec "$(printf \'%s\\n\\nUser input:\\n%s\' "$(cat {prompt})" "$(cat {input})")"',
      )
      .replace(
        'gemini -p "$(cat {prompt})\n\nUser input:\n$(cat {input})"',
        guardedGeminiCommand(),
      )
      .replace(
        'gemini -p "$(printf \'%s\\n\\nUser input:\\n%s\' "$(cat {prompt})" "$(cat {input})")"',
        guardedGeminiCommand(),
      )
      .replace(
        'gemini -p "$(printf "%s\\n\\nUser input:\\n%s" "$(cat {prompt})" "$(cat {input})")"',
        guardedGeminiCommand(),
      )

  return compatibleTemplate
    .replaceAll('{prompt}', quoteShellPath('/sandbox/map/prompt.md'))
    .replaceAll('{input}', quoteShellPath('/sandbox/map/input.txt'))
    .replace(/\r?\n/g, '; ')
}

async function chatDeployment(id, message, history = [], providerCredentialValues = {}) {
  const deployment = await getDeployment(id)
  if (!deployment) throw new Error('Deployment not found')
  if (deployment.status !== 'ready') {
    throw new Error(`Deployment is ${deployment.status}; start it before chatting.`)
  }

  const gateway = await ensureGateway(deployment.gateway_id || manifestOf(deployment).gateway?.id || 'map')
  const files = await writeDeploymentFiles(deployment, message, history, providerCredentialValues)
  await bestEffort('openshell', [
    'sandbox',
    'upload',
    deployment.openshell_sandbox_name,
    files.promptPath,
    '/sandbox/map/prompt.md',
  ], { timeoutMs: 60000, gatewayUrl: gateway.endpoint })
  await bestEffort('openshell', [
    'sandbox',
    'upload',
    deployment.openshell_sandbox_name,
    files.inputPath,
    '/sandbox/map/input.txt',
  ], { timeoutMs: 60000, gatewayUrl: gateway.endpoint })
  try {
    for (const upload of files.packageUploads) {
      await bestEffort('openshell', [
        'sandbox',
        'upload',
        deployment.openshell_sandbox_name,
        upload.localPath,
        upload.remotePath,
      ], { timeoutMs: 60000, gatewayUrl: gateway.endpoint })
    }
  } finally {
    await cleanupSensitiveFiles(files)
  }

  const started = Date.now()
  const command = resolveRuntimeCommand(runtimeCommandTemplate(deployment), deployment)
  const result = await run('openshell', [
    'sandbox',
    'exec',
    '-n',
    deployment.openshell_sandbox_name,
    '--workdir',
    sandboxWorkdir(deployment),
    '--',
    '/bin/sh',
    '-lc',
    `. /sandbox/map/env.sh || true; ${command}`,
  ], { timeoutMs: COMMAND_TIMEOUT_MS, gatewayUrl: gateway.endpoint })

  const parsedOutput = parseRuntimeTraces(result.output)
  await setLastLog(id, parsedOutput.output || result.output)
  return { output: parsedOutput.output, durationMs: Date.now() - started, traces: parsedOutput.traces }
}

async function getLogs(id) {
  const deployment = await getDeployment(id)
  if (!deployment) throw new Error('Deployment not found')
  if (deployment.status === 'stopped') return cleanTerminalOutput(deployment.last_log)

  const gateway = await ensureGateway(deployment.gateway_id || manifestOf(deployment).gateway?.id || 'map')
  try {
    const result = await run('openshell', ['logs', deployment.openshell_sandbox_name, '--since', '1h'], { timeoutMs: 30000, gatewayUrl: gateway.endpoint })
    await setLastLog(id, result.output)
    return result.output
  } catch (err) {
    return cleanTerminalOutput(deployment.last_log || (err instanceof Error ? err.message : String(err)))
  }
}

async function updateSandboxPolicy(id, policyYaml) {
  const deployment = await getDeployment(id)
  if (!deployment) throw new Error('Deployment not found')
  const gateway = await ensureGateway(deployment.gateway_id || manifestOf(deployment).gateway?.id || 'map')
  const dir = deploymentDir(id)
  await mkdir(dir, { recursive: true })
  const policyPath = join(dir, 'policy-update.yaml')
  await writeFile(policyPath, policyYaml, 'utf8')
  const result = await run('openshell', [
    'policy',
    'set',
    deployment.openshell_sandbox_name,
    '--policy',
    policyPath,
    '--wait',
  ], { timeoutMs: 120000, gatewayUrl: gateway.endpoint })
  await setLastLog(id, result.output)
  await addEvent(id, 'policy_updated', 'OpenShell policy was hot-reloaded.', { output: result.output })
  return { status: 'ready', output: result.output }
}

async function attachDeploymentProvider(id, providerName, providerCredentialValues = {}) {
  const deployment = await getDeployment(id)
  if (!deployment) throw new Error('Deployment not found')
  const gateway = await ensureGateway(deployment.gateway_id || manifestOf(deployment).gateway?.id || 'map')

  const provider = (await getDeploymentProviders(id)).find((row) => row.provider_name === providerName)
  if (!provider) throw new Error(`Provider ${providerName} is not declared on this deployment.`)

  const env = providerCredentialEnv(provider, providerCredentialValues)
  const existing = await bestEffort('openshell', ['provider', 'get', provider.provider_name], { timeoutMs: 30000, gatewayUrl: gateway.endpoint })
  if (!existing.ok) {
    const args = providerCreateOrUpdateArgs(provider, false, Object.keys(env).length > 0)
    if (!args) throw new Error(missingProviderCredentialMessage(provider))
    const create = await run('openshell', args, { timeoutMs: 60000, env, gatewayUrl: gateway.endpoint })
    await addEvent(id, 'provider_updated', `Provider ${providerName} was created before attachment.`, { output: create.output })
  }

  const result = await run('openshell', [
    'sandbox',
    'provider',
    'attach',
    deployment.openshell_sandbox_name,
    providerName,
  ], { timeoutMs: 60000, gatewayUrl: gateway.endpoint })

  await updateProviderStatus(id, providerName, 'attached', { lastAttachOutput: result.output })
  await addEvent(id, 'provider_attached', `Provider ${providerName} attached to sandbox.`, { output: result.output })
  return { status: 'attached', output: result.output }
}

async function detachDeploymentProvider(id, providerName) {
  const deployment = await getDeployment(id)
  if (!deployment) throw new Error('Deployment not found')
  const gateway = await ensureGateway(deployment.gateway_id || manifestOf(deployment).gateway?.id || 'map')
  const result = await run('openshell', [
    'sandbox',
    'provider',
    'detach',
    deployment.openshell_sandbox_name,
    providerName,
  ], { timeoutMs: 60000, gatewayUrl: gateway.endpoint })
  await updateProviderStatus(id, providerName, 'detached', { lastDetachOutput: result.output })
  await addEvent(id, 'provider_detached', `Provider ${providerName} detached from sandbox.`, { output: result.output })
  return { status: 'detached', output: result.output }
}

function parseSandboxPhase(output) {
  const clean = cleanTerminalOutput(output)
  const match = clean.match(/Phase:\s*([A-Za-z0-9_-]+)/i)
  return match ? match[1] : ''
}

function statusFromPhase(phase, currentStatus) {
  const normalized = String(phase || '').toLowerCase()
  if (normalized === 'ready' || normalized === 'running') return 'ready'
  if (normalized === 'stopped' || normalized === 'deleted') return 'stopped'
  if (normalized === 'pending' || normalized === 'creating' || normalized === 'provisioning') return 'provisioning'
  if (normalized === 'missing') return currentStatus === 'stopped' ? 'stopped' : 'error'
  return currentStatus || 'pending'
}

async function reconcileDeployment(id) {
  const deployment = await getDeployment(id)
  if (!deployment) throw new Error('Deployment not found')
  const gateway = await ensureGateway(deployment.gateway_id || manifestOf(deployment).gateway?.id || 'map')
  const result = await bestEffort('openshell', ['sandbox', 'get', deployment.openshell_sandbox_name], { timeoutMs: 30000, gatewayUrl: gateway.endpoint })
  const observedPhase = result.ok ? (parseSandboxPhase(result.output) || 'Unknown') : 'Missing'
  const status = statusFromPhase(observedPhase, deployment.status)
  await sql`
    UPDATE agent_deployments
    SET status = ${status},
        observed_phase = ${observedPhase},
        last_log = ${result.output || null},
        last_error = CASE WHEN ${status} = 'error' THEN ${result.output || 'Sandbox missing'} ELSE last_error END,
        updated_at = NOW()
    WHERE id = ${id}
  `
  await addEvent(id, 'reconciled', `Reconciled sandbox state: ${observedPhase}.`, {
    output: result.output,
    status,
  })
  return { status, observedPhase, output: result.output }
}

async function setupStatus() {
  const cli = await bestEffort('openshell', ['--version'], { timeoutMs: 30000 })
  const gateway = await bestEffort('openshell', ['gateway', 'list'], { timeoutMs: 30000 })
  const gatewayAuth = await bestEffort('openshell', ['gateway', 'auth', 'status'], { timeoutMs: 30000 })
  const settings = await bestEffort('openshell', ['settings', 'get', '--global', '--key', 'providers_v2_enabled'], { timeoutMs: 30000 })
  const providerProfiles = await bestEffort('openshell', ['provider', 'list-profiles', '-o', 'json'], { timeoutMs: 30000 })
  const images = await bestEffort('openshell', ['sandbox', 'image', 'list', '-o', 'json'], { timeoutMs: 30000 })
  const inferenceRoute = await bestEffort('openshell', ['inference', 'get', '-o', 'json'], { timeoutMs: 30000 })
  const sandboxes = await bestEffort('openshell', ['sandbox', 'list', '-o', 'json'], { timeoutMs: 30000 })
  const docker = await bestEffort('docker', ['info', '--format', '{{.ServerVersion}}'], { timeoutMs: 30000 })
  const runtimeGateways = await sql`
    SELECT id, name, endpoint, mode, status, last_verified_at, last_error
    FROM runtime_gateways
    ORDER BY updated_at DESC
    LIMIT 50
  `.catch(() => [])
  const credentialSourceNames = [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'GOOGLE_SERVICE_ACCOUNT_KEY',
    'NVIDIA_API_KEY',
    'LITELLM_API_KEY',
    'AZURE_OPENAI_API_KEY',
    'AZURE_AI_API_KEY',
  ]
  const credentialSources = Object.fromEntries(
    credentialSourceNames.map((name) => [name, { present: Boolean(process.env[name]), usedBy: [] }]),
  )

  return {
    runtimeEnabled: OPENSHELL_RUNTIME_ENABLED,
    runtimeV2Enabled: OPENSHELL_RUNTIME_V2_ENABLED,
    legacySecretEnvAllowed: OPENSHELL_ALLOW_LEGACY_SECRET_ENV,
    rawCliAllowed: OPENSHELL_ALLOW_RAW_CLI,
    gatewayUrl: OPENSHELL_GATEWAY_URL,
    auth: {
      status: gatewayAuth.ok ? 'ready' : 'unknown',
      output: gatewayAuth.output,
    },
    providerProfiles: {
      status: providerProfiles.ok ? 'ready' : 'unknown',
      output: providerProfiles.output,
      items: asArray(asObject(providerProfiles.output).profiles),
    },
    images: {
      status: images.ok ? 'ready' : 'unknown',
      output: images.output,
    },
    inferenceRoute: {
      status: inferenceRoute.ok ? 'ready' : 'unknown',
      output: inferenceRoute.output,
      route: asObject(inferenceRoute.output),
    },
    credentialSources,
    gateways: [
      { id: 'map', name: 'Local MAP gateway', endpoint: OPENSHELL_GATEWAY_URL, mode: 'local-docker', status: gateway.ok ? 'ready' : 'unknown' },
      ...runtimeGateways,
    ],
    checks: [
      { id: 'openshell-cli', label: 'OpenShell CLI', status: cli.ok ? 'pass' : 'fail', output: cli.output },
      { id: 'gateway', label: 'Gateway connectivity', status: gateway.ok ? 'pass' : 'warn', output: gateway.output },
      { id: 'gateway-auth', label: 'Gateway auth boundary', status: gatewayAuth.ok ? 'pass' : 'warn', output: gatewayAuth.output },
      { id: 'providers-v2', label: 'Providers v2 setting', status: settings.ok && /true/i.test(settings.output) ? 'pass' : 'warn', output: settings.output },
      { id: 'provider-profiles', label: 'Provider profiles', status: providerProfiles.ok ? 'pass' : 'warn', output: providerProfiles.output },
      { id: 'sandbox-images', label: 'Sandbox images', status: images.ok ? 'pass' : 'warn', output: images.output },
      { id: 'inference-local-route', label: 'inference.local route', status: inferenceRoute.ok ? 'pass' : 'warn', output: inferenceRoute.output },
      { id: 'sandbox-list', label: 'Sandbox inventory', status: sandboxes.ok ? 'pass' : 'warn', output: sandboxes.output },
      { id: 'compute-driver', label: 'Docker compute driver', status: docker.ok ? 'pass' : 'warn', output: docker.output },
    ],
  }
}

function parseCommandLine(input) {
  const args = []
  let current = ''
  let quote = null
  let escaping = false

  for (const char of input) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }
    if (char === '\\') {
      escaping = true
      continue
    }
    if (quote) {
      if (char === quote) quote = null
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current) args.push(current)
  if (quote) throw new Error('Unclosed quote')
  return args
}

async function runOpenShellCommand(commandText, gatewayId = 'map') {
  const args = parseCommandLine(commandText.trim())
  if (args[0] === 'openshell') args.shift()
  if (args.length === 0) throw new Error('Enter an openshell command.')
  const gateway = await ensureGateway(gatewayId)
  const result = await run('openshell', args, { timeoutMs: COMMAND_TIMEOUT_MS, gatewayUrl: gateway.endpoint })
  return { command: `openshell ${args.join(' ')}`, output: result.output }
}

async function handleRoute(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)

  if (url.pathname === '/health') {
    sendJson(res, { status: 'ok', version: APP_VERSION, runtimeEnabled: OPENSHELL_RUNTIME_ENABLED })
    return
  }

  if (url.pathname === '/setup' && req.method === 'GET') {
    sendJson(res, await setupStatus())
    return
  }

  if (!OPENSHELL_RUNTIME_ENABLED) {
    sendJson(res, { error: OPENSHELL_RUNTIME_DISABLED_MESSAGE }, 503)
    return
  }

  if (url.pathname === '/openshell/command' && req.method === 'POST') {
    try {
      if (!OPENSHELL_ALLOW_RAW_CLI) {
        sendJson(res, { error: 'Raw OpenShell CLI execution is disabled. Set OPENSHELL_ALLOW_RAW_CLI=true for admin/debug sessions.' }, 403)
        return
      }
      const body = await parseBody(req)
      const command = typeof body.command === 'string' ? body.command : ''
      const gatewayId = typeof body.gatewayId === 'string' ? body.gatewayId : 'map'
      sendJson(res, await runOpenShellCommand(command, gatewayId))
    } catch (err) {
      sendJson(res, { error: err instanceof Error ? err.message : 'OpenShell command failed' }, 500)
    }
    return
  }

  if (url.pathname === '/gateways/verify' && req.method === 'POST') {
    try {
      const body = await parseBody(req)
      const gatewayId = typeof body.gatewayId === 'string' ? body.gatewayId : 'map'
      sendJson(res, await verifyGateway(gatewayId))
    } catch (err) {
      sendJson(res, { error: err instanceof Error ? err.message : 'Gateway verification failed' }, 500)
    }
    return
  }

  const match = url.pathname.match(/^\/deployments\/([^/]+)(?:\/(.+))?$/)
  if (!match) {
    sendJson(res, { error: 'Not found' }, 404)
    return
  }

  const id = match[1]
  const action = match[2] || ''

  try {
    if (req.method === 'POST' && action === 'provision') {
      const body = await parseBody(req).catch(() => ({}))
      sendJson(res, await provisionDeployment(id, {
        providerCredentialValues: asObject(body.providerCredentialValues),
      }))
      return
    }

    if (req.method === 'POST' && action === 'start') {
      const body = await parseBody(req).catch(() => ({}))
      sendJson(res, await provisionDeployment(id, {
        providerCredentialValues: asObject(body.providerCredentialValues),
      }))
      return
    }

    if (req.method === 'POST' && action === 'stop') {
      const deployment = await getDeployment(id)
      if (!deployment) throw new Error('Deployment not found')
      const gateway = await ensureGateway(deployment.gateway_id || manifestOf(deployment).gateway?.id || 'map')
      const output = await deleteSandbox(deployment.openshell_sandbox_name, gateway)
      await setStopped(id, output)
      sendJson(res, { status: 'stopped', output })
      return
    }

    if (req.method === 'POST' && action === 'restart') {
      const deployment = await getDeployment(id)
      if (!deployment) throw new Error('Deployment not found')
      const body = await parseBody(req).catch(() => ({}))
      const gateway = await ensureGateway(deployment.gateway_id || manifestOf(deployment).gateway?.id || 'map')
      await deleteSandbox(deployment.openshell_sandbox_name, gateway)
      sendJson(res, await provisionDeployment(id, {
        providerCredentialValues: asObject(body.providerCredentialValues),
      }))
      return
    }

    if (req.method === 'POST' && action === 'policy') {
      const body = await parseBody(req)
      const policyYaml = typeof body.policyYaml === 'string' ? body.policyYaml : ''
      if (!policyYaml.trim()) {
        sendJson(res, { error: 'policyYaml is required' }, 400)
        return
      }
      sendJson(res, await updateSandboxPolicy(id, policyYaml))
      return
    }

    if (req.method === 'POST' && action === 'providers/attach') {
      const body = await parseBody(req)
      const providerName = typeof body.providerName === 'string' ? body.providerName : ''
      if (!providerName.trim()) {
        sendJson(res, { error: 'providerName is required' }, 400)
        return
      }
      sendJson(res, await attachDeploymentProvider(id, providerName, asObject(body.providerCredentialValues)))
      return
    }

    if (req.method === 'POST' && action === 'providers/detach') {
      const body = await parseBody(req)
      const providerName = typeof body.providerName === 'string' ? body.providerName : ''
      if (!providerName.trim()) {
        sendJson(res, { error: 'providerName is required' }, 400)
        return
      }
      sendJson(res, await detachDeploymentProvider(id, providerName))
      return
    }

    if (req.method === 'POST' && action === 'reconcile') {
      sendJson(res, await reconcileDeployment(id))
      return
    }

    if (req.method === 'POST' && action === 'chat') {
      const body = await parseBody(req)
      const message = typeof body.message === 'string' ? body.message : ''
      if (!message.trim()) {
        sendJson(res, { error: 'Message is required' }, 400)
        return
      }
      sendJson(res, await chatDeployment(id, message, asArray(body.history), asObject(body.providerCredentialValues)))
      return
    }

    if (req.method === 'GET' && action === 'logs') {
      sendJson(res, { logs: await getLogs(id) })
      return
    }

    if (req.method === 'DELETE' && action === '') {
      const deployment = await getDeployment(id)
      if (!deployment) throw new Error('Deployment not found')
      const gateway = await ensureGateway(deployment.gateway_id || manifestOf(deployment).gateway?.id || 'map')
      const output = await deleteSandbox(deployment.openshell_sandbox_name, gateway)
      sendJson(res, { deleted: true, output })
      return
    }

    sendJson(res, { error: 'Not found' }, 404)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Deployment worker failed'
    await setError(id, message).catch(() => {})
    sendJson(res, { error: message }, 500)
  }
}

async function startServer() {
  await ensureDeploymentSchema()
  createServer((req, res) => {
    handleRoute(req, res).catch((err) => {
      sendJson(res, { error: err instanceof Error ? err.message : 'Deployment worker failed' }, 500)
    })
  }).listen(PORT, () => {
    console.log(`MAP deployment worker listening on http://0.0.0.0:${PORT}`)
    console.log(`OpenShell gateway: ${OPENSHELL_GATEWAY_URL}`)
  })
}

startServer().catch((err) => {
  console.error('Deployment worker failed to start:', err)
  process.exit(1)
})
