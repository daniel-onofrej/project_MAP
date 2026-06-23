import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  addDeploymentMessage,
  createDeploymentRecord,
  createScopedMcpToken,
  getAgent,
  getDeployment,
  listDeployments,
} from '../storage.js';
import { logToolCall } from '../logger.js';

const WORKER_URL = (process.env.DEPLOYMENT_WORKER_URL || 'http://deployment-worker:3200').replace(/\/$/, '');
const RUNTIME_KINDS = new Set(['codex', 'claude-code', 'opencode', 'gemini-cli', 'custom']);

async function workerRequest<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${WORKER_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `Worker request failed with ${res.status}`);
  }
  return data as T;
}

function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
}

function scopedToAgent(agent: any, scopes: string[]) {
  return scopes.includes('*') || (agent.groupId && scopes.includes(agent.groupId));
}

function runtimeKindFromId(runtimeId: unknown) {
  const value = String(runtimeId || 'custom');
  return RUNTIME_KINDS.has(value) ? value : 'custom';
}

function deploymentId() {
  return `mcp-${randomUUID().replace(/-/g, '').slice(0, 18)}`;
}

function sandboxName(id: string) {
  return `map-${id}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

function mcpProvider(deploymentId: string) {
  const providerName = `map-mcp-${deploymentId}`.toLowerCase();
  return {
    providerName,
    provider: {
      id: 'map-mcp',
      name: providerName,
      type: 'generic',
      role: 'mcp',
      mode: 'providers-v2',
      credentialKeys: ['MCP_AUTH_TOKEN'],
      env: {
        MCP_INTERNAL_URL: process.env.MCP_INTERNAL_URL || 'http://mcp-server:3100/mcp',
      },
      sourceEnv: {
        MCP_AUTH_TOKEN: 'MCP_AUTH_TOKEN',
      },
      endpoints: [
        {
          name: 'MAP MCP',
          target: process.env.MCP_INTERNAL_URL || 'http://mcp-server:3100/mcp',
          direction: 'outbound',
          description: 'Deployment-scoped MAP MCP access',
        },
      ],
      attach: true,
      useForInference: false,
    },
  };
}

async function buildManifestPlan(args: any, scopes: string[], includeMcpProvider = false) {
  const agent = await getAgent(args.agentId);
  if (!agent) throw new Error(`Agent '${args.agentId}' not found.`);
  if (!scopedToAgent(agent, scopes)) throw new Error(`Agent '${args.agentId}' is not accessible to this MCP token.`);

  const id = args.deploymentId || deploymentId();
  const name = sandboxName(id);
  const providers = Array.isArray(args.providers) ? [...args.providers] : [];
  const runtimeMcpProvider = includeMcpProvider ? mcpProvider(id) : null;
  if (runtimeMcpProvider) providers.push(runtimeMcpProvider.provider);

  const { buildRuntimeManifest, buildPreflightReport } = await import('../../../lib/deployments/manifest');
  const { manifest, credentialValues } = buildRuntimeManifest({
    deploymentId: id,
    sandboxName: name,
    agent,
    gatewayId: args.gatewayId || 'map',
    runtimeId: args.runtimeId || args.runtimeKind || 'custom',
    runtimeCommand: args.runtimeCommand,
    runtimePackage: args.runtimePackage,
    providers,
    sandboxImage: args.sandboxImage,
    executionMode: args.executionMode,
    providerMode: args.providerMode,
    resources: args.resources,
    policyYaml: args.policyYaml,
    environment: args.environment,
  });
  const preflightReport = buildPreflightReport(agent, manifest);
  return {
    id,
    sandboxName: name,
    agent,
    manifest,
    credentialValues,
    preflightReport,
    runtimeMcpProvider,
  };
}

export function registerDeploymentTools(server: McpServer, scopes: string[] = ['*']) {
  server.tool(
    'list_runtime_templates',
    'List MAP OpenShell runtime and provider templates for Claude Code, Codex, OpenCode, Gemini CLI, and custom sandboxes.',
    {},
    async () => {
      const start = Date.now();
      try {
        const [{ RUNTIME_CATALOG, PROVIDER_CATALOG, GATEWAY_CATALOG }, setup] = await Promise.all([
          import('../../../lib/deployments/catalog'),
          workerRequest('/setup').catch((err: any) => ({ error: err.message })),
        ]);
        logToolCall({ tool: 'list_runtime_templates', status: 'success', duration: Date.now() - start });
        return textResult({ runtimes: RUNTIME_CATALOG, providers: PROVIDER_CATALOG, gateways: GATEWAY_CATALOG, setup });
      } catch (err: any) {
        logToolCall({ tool: 'list_runtime_templates', status: 'error', duration: Date.now() - start, error: err.message });
        return errorResult(err.message);
      }
    }
  );

  server.tool(
    'preflight_deployment',
    'Validate a MAP prompt/runtime/provider/policy selection and return the RuntimeManifestV2 preflight report.',
    {
      agentId: z.string().describe('MAP agent/prompt ID to deploy'),
      gatewayId: z.string().optional().describe('OpenShell gateway profile ID; defaults to map'),
      runtimeId: z.string().optional().describe('Runtime template ID, such as codex, claude-code, opencode, gemini-cli, or custom'),
      runtimeKind: z.string().optional().describe('Legacy runtime kind fallback'),
      runtimeCommand: z.string().optional().describe('Command template using {prompt} and {input}'),
      sandboxImage: z.string().optional().describe('OpenShell sandbox image override'),
      executionMode: z.enum(['oneshot', 'interactive', 'service']).optional(),
      providerMode: z.enum(['providers-v2', 'inference-local', 'direct', 'legacy-env']).optional(),
      providers: z.array(z.record(z.any())).optional().describe('Provider inputs; omit to use runtime defaults'),
      runtimePackage: z.record(z.any()).optional().describe('Runtime env/tools/files/scripts/ports/connections package'),
      resources: z.record(z.any()).optional().describe('CPU/memory/GPU resource limits'),
      environment: z.record(z.string()).optional().describe('Non-secret deployment environment values'),
      policyYaml: z.string().optional().describe('Custom OpenShell policy YAML'),
    },
    async (args) => {
      const start = Date.now();
      try {
        const plan = await buildManifestPlan(args, scopes, false);
        logToolCall({
          tool: 'preflight_deployment',
          status: plan.preflightReport.ok ? 'success' : 'error',
          duration: Date.now() - start,
          inputSummary: args.agentId,
        });
        return textResult(plan.preflightReport);
      } catch (err: any) {
        logToolCall({ tool: 'preflight_deployment', status: 'error', duration: Date.now() - start, error: err.message });
        return errorResult(err.message);
      }
    }
  );

  server.tool(
    'create_deployment',
    'Create and provision a MAP OpenShell sandbox deployment from a validated prompt/runtime/provider selection.',
    {
      agentId: z.string().describe('MAP agent/prompt ID to deploy'),
      name: z.string().describe('Deployment display name'),
      gatewayId: z.string().optional().describe('OpenShell gateway profile ID; defaults to map'),
      runtimeId: z.string().optional().describe('Runtime template ID, such as codex, claude-code, opencode, gemini-cli, or custom'),
      runtimeKind: z.string().optional().describe('Legacy runtime kind fallback'),
      runtimeCommand: z.string().optional().describe('Command template using {prompt} and {input}'),
      sandboxImage: z.string().optional().describe('OpenShell sandbox image override'),
      executionMode: z.enum(['oneshot', 'interactive', 'service']).optional(),
      providerMode: z.enum(['providers-v2', 'inference-local', 'direct', 'legacy-env']).optional(),
      providers: z.array(z.record(z.any())).optional().describe('Provider inputs; omit to use runtime defaults'),
      providerCredentialValues: z.record(z.record(z.string())).optional().describe('One-time provider secrets keyed by provider name/template'),
      runtimePackage: z.record(z.any()).optional().describe('Runtime env/tools/files/scripts/ports/connections package'),
      resources: z.record(z.any()).optional().describe('CPU/memory/GPU resource limits'),
      environment: z.record(z.string()).optional().describe('Non-secret deployment environment values'),
      policyYaml: z.string().optional().describe('Custom OpenShell policy YAML'),
    },
    async (args) => {
      const start = Date.now();
      try {
        const plan = await buildManifestPlan(args, scopes, true);
        if (!plan.preflightReport.ok) {
          logToolCall({ tool: 'create_deployment', status: 'error', duration: Date.now() - start, inputSummary: args.agentId });
          return errorResult(`Preflight failed: ${plan.preflightReport.checks.filter((item: any) => item.status === 'fail').map((item: any) => item.message).join(' ')}`);
        }

        const tokenScopes = plan.agent.groupId ? [plan.agent.groupId] : (scopes.includes('*') ? ['*'] : scopes);
        const runtimeMcpToken = await createScopedMcpToken(`Runtime ${plan.id}`, tokenScopes);
        const deployment = await createDeploymentRecord({
          id: plan.id,
          agent: plan.agent,
          name: args.name,
          sandboxName: plan.sandboxName,
          runtimeKind: runtimeKindFromId(plan.manifest.runtime.id),
          runtimeCommand: plan.manifest.runtime.command,
          manifest: plan.manifest,
          preflightReport: plan.preflightReport,
        });
        const providerCredentialValues = {
          ...plan.credentialValues,
          ...(args.providerCredentialValues ?? {}),
          ...(plan.runtimeMcpProvider ? { [plan.runtimeMcpProvider.providerName]: { MCP_AUTH_TOKEN: runtimeMcpToken } } : {}),
        };
        const provision = await workerRequest(`/deployments/${plan.id}/provision`, {
          method: 'POST',
          body: JSON.stringify({ providerCredentialValues }),
        });
        logToolCall({ tool: 'create_deployment', status: 'success', duration: Date.now() - start, inputSummary: plan.id });
        return textResult({ deployment, provision });
      } catch (err: any) {
        logToolCall({ tool: 'create_deployment', status: 'error', duration: Date.now() - start, error: err.message });
        return errorResult(err.message);
      }
    }
  );

  server.tool(
    'list_deployments',
    'List MAP OpenShell sandbox deployments visible to this MCP token.',
    {},
    async () => {
      const start = Date.now();
      try {
        const deployments = await listDeployments(scopes);
        logToolCall({
          tool: 'list_deployments',
          status: 'success',
          duration: Date.now() - start,
          outputSummary: `Listed ${deployments.length} deployments`,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(deployments, null, 2) }] };
      } catch (err: any) {
        logToolCall({ tool: 'list_deployments', status: 'error', duration: Date.now() - start, error: err.message });
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    'get_deployment',
    'Get one MAP OpenShell sandbox deployment by ID.',
    {
      deploymentId: z.string().describe('Deployment ID'),
    },
    async ({ deploymentId }) => {
      const deployment = await getDeployment(deploymentId, scopes);
      if (!deployment) {
        return { content: [{ type: 'text' as const, text: `Error: Deployment '${deploymentId}' not found or not accessible` }], isError: true };
      }
      logToolCall({ tool: 'get_deployment', status: 'success', inputSummary: deploymentId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(deployment, null, 2) }] };
    }
  );

  server.tool(
    'get_deployment_status',
    'Get current status for a MAP OpenShell sandbox deployment.',
    {
      deploymentId: z.string().describe('Deployment ID'),
    },
    async ({ deploymentId }) => {
      const deployment = await getDeployment(deploymentId, scopes);
      if (!deployment) {
        return { content: [{ type: 'text' as const, text: `Error: Deployment '${deploymentId}' not found or not accessible` }], isError: true };
      }
      logToolCall({ tool: 'get_deployment_status', status: 'success', inputSummary: deploymentId });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            id: deployment.id,
            name: deployment.name,
            status: deployment.status,
            observedPhase: deployment.observedPhase,
            sandbox: deployment.openshellSandboxName,
            runtimeId: deployment.runtimeId,
            sandboxImage: deployment.sandboxImage,
            executionMode: deployment.executionMode,
            providerMode: deployment.providerMode,
            policyRevision: deployment.policyRevision,
            preflight: deployment.preflightReport,
            lastError: deployment.lastError,
            updatedAt: deployment.updatedAt,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'get_deployment_logs',
    'Fetch recent logs for a MAP OpenShell sandbox deployment.',
    {
      deploymentId: z.string().describe('Deployment ID'),
    },
    async ({ deploymentId }) => {
      const start = Date.now();
      try {
        const deployment = await getDeployment(deploymentId, scopes);
        if (!deployment) {
          return { content: [{ type: 'text' as const, text: `Error: Deployment '${deploymentId}' not found or not accessible` }], isError: true };
        }
        const result = await workerRequest<{ logs: string }>(`/deployments/${deploymentId}/logs`);
        logToolCall({ tool: 'get_deployment_logs', status: 'success', duration: Date.now() - start, inputSummary: deploymentId });
        return { content: [{ type: 'text' as const, text: result.logs || '(no logs)' }] };
      } catch (err: any) {
        logToolCall({ tool: 'get_deployment_logs', status: 'error', duration: Date.now() - start, error: err.message });
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    'update_deployment_policy',
    'Apply a dynamic OpenShell policy update to a running MAP sandbox deployment.',
    {
      deploymentId: z.string().describe('Deployment ID'),
      policyYaml: z.string().describe('OpenShell policy YAML with a version field'),
    },
    async ({ deploymentId, policyYaml }) => {
      const start = Date.now();
      try {
        const deployment = await getDeployment(deploymentId, scopes);
        if (!deployment) return errorResult(`Deployment '${deploymentId}' not found or not accessible`);
        const result = await workerRequest(`/deployments/${deploymentId}/policy`, {
          method: 'POST',
          body: JSON.stringify({ policyYaml }),
        });
        logToolCall({ tool: 'update_deployment_policy', status: 'success', duration: Date.now() - start, inputSummary: deploymentId });
        return textResult(result);
      } catch (err: any) {
        logToolCall({ tool: 'update_deployment_policy', status: 'error', duration: Date.now() - start, error: err.message });
        return errorResult(err.message);
      }
    }
  );

  server.tool(
    'attach_deployment_provider',
    'Attach a declared OpenShell provider profile to a MAP sandbox deployment.',
    {
      deploymentId: z.string().describe('Deployment ID'),
      providerName: z.string().describe('Provider name declared in the RuntimeManifestV2'),
      providerCredentialValues: z.record(z.record(z.string())).optional().describe('One-time secrets keyed by provider name/template'),
    },
    async ({ deploymentId, providerName, providerCredentialValues }) => {
      const start = Date.now();
      try {
        const deployment = await getDeployment(deploymentId, scopes);
        if (!deployment) return errorResult(`Deployment '${deploymentId}' not found or not accessible`);
        const result = await workerRequest(`/deployments/${deploymentId}/providers/attach`, {
          method: 'POST',
          body: JSON.stringify({ providerName, providerCredentialValues: providerCredentialValues ?? {} }),
        });
        logToolCall({ tool: 'attach_deployment_provider', status: 'success', duration: Date.now() - start, inputSummary: `${deploymentId}:${providerName}` });
        return textResult(result);
      } catch (err: any) {
        logToolCall({ tool: 'attach_deployment_provider', status: 'error', duration: Date.now() - start, error: err.message });
        return errorResult(err.message);
      }
    }
  );

  server.tool(
    'detach_deployment_provider',
    'Detach a provider profile from a MAP sandbox deployment.',
    {
      deploymentId: z.string().describe('Deployment ID'),
      providerName: z.string().describe('Provider name declared in the RuntimeManifestV2'),
    },
    async ({ deploymentId, providerName }) => {
      const start = Date.now();
      try {
        const deployment = await getDeployment(deploymentId, scopes);
        if (!deployment) return errorResult(`Deployment '${deploymentId}' not found or not accessible`);
        const result = await workerRequest(`/deployments/${deploymentId}/providers/detach`, {
          method: 'POST',
          body: JSON.stringify({ providerName }),
        });
        logToolCall({ tool: 'detach_deployment_provider', status: 'success', duration: Date.now() - start, inputSummary: `${deploymentId}:${providerName}` });
        return textResult(result);
      } catch (err: any) {
        logToolCall({ tool: 'detach_deployment_provider', status: 'error', duration: Date.now() - start, error: err.message });
        return errorResult(err.message);
      }
    }
  );

  server.tool(
    'reconcile_deployment',
    'Compare MAP deployment state against OpenShell and repair the observed status/phase.',
    {
      deploymentId: z.string().describe('Deployment ID'),
    },
    async ({ deploymentId }) => {
      const start = Date.now();
      try {
        const deployment = await getDeployment(deploymentId, scopes);
        if (!deployment) return errorResult(`Deployment '${deploymentId}' not found or not accessible`);
        const result = await workerRequest(`/deployments/${deploymentId}/reconcile`, { method: 'POST', body: '{}' });
        logToolCall({ tool: 'reconcile_deployment', status: 'success', duration: Date.now() - start, inputSummary: deploymentId });
        return textResult(result);
      } catch (err: any) {
        logToolCall({ tool: 'reconcile_deployment', status: 'error', duration: Date.now() - start, error: err.message });
        return errorResult(err.message);
      }
    }
  );

  server.tool(
    'chat_deployment',
    'Send a message to a MAP OpenShell sandbox deployment runtime and return the CLI output.',
    {
      deploymentId: z.string().describe('Deployment ID'),
      message: z.string().describe('Message to send to the deployed runtime'),
    },
    async ({ deploymentId, message }) => {
      const start = Date.now();
      try {
        const deployment = await getDeployment(deploymentId, scopes);
        if (!deployment) {
          return { content: [{ type: 'text' as const, text: `Error: Deployment '${deploymentId}' not found or not accessible` }], isError: true };
        }
        await addDeploymentMessage({ deploymentId, role: 'user', content: message });
        const result = await workerRequest<{ output: string; durationMs?: number }>(
          `/deployments/${deploymentId}/chat`,
          { method: 'POST', body: JSON.stringify({ message }) },
        );
        await addDeploymentMessage({
          deploymentId,
          role: 'assistant',
          content: result.output || '(no output)',
          metadata: { durationMs: result.durationMs, source: 'mcp' },
        });
        logToolCall({ tool: 'chat_deployment', status: 'success', duration: Date.now() - start, inputSummary: deploymentId });
        return { content: [{ type: 'text' as const, text: result.output || '(no output)' }] };
      } catch (err: any) {
        await addDeploymentMessage({
          deploymentId,
          role: 'assistant',
          content: err.message,
          status: 'error',
          metadata: { source: 'mcp' },
        }).catch(() => {});
        logToolCall({ tool: 'chat_deployment', status: 'error', duration: Date.now() - start, error: err.message });
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
