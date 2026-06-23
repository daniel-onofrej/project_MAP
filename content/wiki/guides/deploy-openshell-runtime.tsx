import {
  H2,
  H3,
  P,
  Lead,
  Strong,
  InlineCode,
  CodeBlock,
  RelatedLinks,
} from '@/components/wiki/prose'
import { Callout } from '@/components/wiki/prose-client'

export const toc = [
  { id: 'overview', label: 'Overview', level: 2 as const },
  { id: 'requirements', label: 'Requirements', level: 2 as const },
  { id: 'create', label: 'Create a runtime', level: 2 as const },
  { id: 'llm', label: 'LLM credentials', level: 2 as const },
  { id: 'providers', label: 'Provider modes', level: 2 as const },
  { id: 'package', label: 'Package tools and scripts', level: 2 as const },
  { id: 'graph-attachments', label: 'Graph attachments', level: 3 as const },
  { id: 'operate', label: 'Operate from MAP', level: 2 as const },
  { id: 'cli', label: 'OpenShell CLI', level: 2 as const },
  { id: 'security', label: 'Security notes', level: 2 as const },
]

export default function DeployOpenShellRuntimeGuide() {
  return (
    <>
      <Lead>
        MAP can deploy a saved prompt as a native OpenShell agent runtime. The prompt is pinned,
        a policy is applied, runtime files are shipped into the sandbox, and the running agent can
        be operated from Agent Hub, Sandboxes, MCP tools, or the in-app OpenShell CLI.
      </Lead>

      <H2 id="overview">Overview</H2>
      <P>
        A runtime is the concrete agent process for a prompt. It can run Codex CLI, Claude Code,
        OpenCode, or a custom command. MAP stores the pinned prompt and runtime package separately
        from the editable graph, so later prompt edits do not mutate an already deployed sandbox.
      </P>
      <P>
        The runtime package includes policy YAML, non-secret environment variables, secret mappings,
        provider definitions, declared tools, startup scripts, files, ports, external connections,
        and operator notes. MAP ships those artifacts to <InlineCode>/sandbox/map</InlineCode>
        before starting or chatting with the sandbox.
      </P>

      <H2 id="requirements">Requirements</H2>
      <P>
        Docker Compose starts the Next.js app, MCP server, OpenShell gateway, deployment worker,
        Postgres, Redis, and a one-shot OpenShell bootstrap job. The gateway is loopback-bound in
        the local stack and the worker reaches it through <InlineCode>OPENSHELL_GATEWAY_URL</InlineCode>.
      </P>
      <CodeBlock language="env">{`OPENSHELL_RUNTIME_ENABLED=true
OPENSHELL_GATEWAY_URL=http://openshell-gateway:8080
DEPLOYMENT_WORKER_URL=http://deployment-worker:3200
MCP_INTERNAL_URL=http://mcp-server:3100/mcp
OPENSHELL_RUNTIME_V2_ENABLED=true
OPENSHELL_ALLOW_LEGACY_SECRET_ENV=false
OPENSHELL_ALLOW_RAW_CLI=true`}</CodeBlock>
      <P>
        Set <InlineCode>OPENSHELL_RUNTIME_ENABLED=false</InlineCode> to keep the app online while
        disabling runtime create/start/stop/restart/delete/chat/logs and in-app CLI operations.
      </P>

      <H2 id="create">Create a runtime</H2>
      <P>
        Open <Strong>Agent Hub</Strong> or <Strong>Sandboxes</Strong>, choose <Strong>Create runtime</Strong>,
        select the prompt, choose the runtime command, then apply an OpenShell policy. The security
        preset fills a starter YAML, but the YAML remains fully editable.
      </P>
      <P>
        Runtime commands use file placeholders. MAP writes the pinned prompt to
        <InlineCode>/sandbox/map/prompt.md</InlineCode>, writes each chat message to
        <InlineCode>/sandbox/map/input.txt</InlineCode>, and resolves <InlineCode>{'{prompt}'}</InlineCode>
        and <InlineCode>{'{input}'}</InlineCode> before execution.
      </P>
      <CodeBlock language="yaml">{`version: 1
filesystem_policy:
  read_only: [/usr, /lib, /etc]
  read_write: [/sandbox, /tmp]
landlock:
  compatibility: best_effort
process:
  run_as_user: sandbox
  run_as_group: sandbox
network_policies: {}`}</CodeBlock>

      <H2 id="llm">LLM credentials</H2>
      <P>
        The <Strong>LLM</Strong> tab sets endpoint and model environment variables for OpenAI,
        Anthropic, LiteLLM/OpenAI-compatible endpoints, Azure OpenAI, Azure AI Foundry, or a custom
        endpoint. API keys should use secret pass-through instead of plain environment variables.
      </P>
      <CodeBlock language="json">{`{
  "env": {
    "LLM_PROVIDER": "openai-compatible",
    "OPENAI_BASE_URL": "http://litellm:4000/v1",
    "OPENAI_MODEL": "your-model"
  },
  "secretEnv": {
    "OPENAI_API_KEY": "LITELLM_API_KEY"
  }
}`}</CodeBlock>
      <P>
        In that example, the sandbox receives <InlineCode>OPENAI_API_KEY</InlineCode>, but MAP stores
        only the source name <InlineCode>LITELLM_API_KEY</InlineCode>. The deployment worker container
        must have <InlineCode>LITELLM_API_KEY</InlineCode> set when it creates or chats with the runtime.
        The worker removes its temporary local env file after upload; the injected value remains inside
        the sandbox runtime environment.
      </P>

      <H2 id="providers">Provider modes</H2>
      <P>
        <Strong>Providers v2</Strong> is the normal mode for shared sandboxes: MAP asks OpenShell to
        create or update provider profiles and sends credentials only to the deployment worker at
        provider setup time. <Strong>Inference local</Strong> also updates OpenShell inference routing
        so the selected provider becomes the default model endpoint. <Strong>Legacy env</Strong>
        writes mapped secrets into <InlineCode>/sandbox/map/env.sh</InlineCode> for compatibility.
      </P>
      <P>
        Pasted API keys are sent once with the create request and are not stored in the deployment
        package. Worker-hosted credentials are read from environment variables on the
        <InlineCode>deployment-worker</InlineCode> container.
      </P>

      <H2 id="package">Package tools and scripts</H2>
      <P>
        Runtime package sections are shipped under <InlineCode>/sandbox/map</InlineCode>.
        Environment variables are written to <InlineCode>/sandbox/map/env.sh</InlineCode>,
        scripts and files keep their declared paths, and the full manifest is written as
        <InlineCode>/sandbox/map/runtime-package.json</InlineCode>.
      </P>
      <H3 id="graph-attachments">Graph attachments</H3>
      <P>
        Before deployment, expand a graph row in the Example, Agents, master, or child graph lists
        to inspect detected runtime requirements. MAP compares graph <Strong>TOOL</Strong> nodes,
        startup script metadata, and existing files with the graph-owned runtime package, then marks
        each item as <Strong>Attached</Strong>, <Strong>Missing</Strong>, or
        <Strong>Needs implementation</Strong>.
      </P>
      <P>
        Use <Strong>Attach code</Strong> to paste or edit package JSON, <Strong>Upload file</Strong>
        to add text files, or <Strong>Create stub</Strong> to create a Python tool stub for a missing
        graph tool. These attachments are saved on the graph as
        <InlineCode>runtimePackage</InlineCode>, included in versions and graph JSON export, and used
        as the initial package when the create-runtime dialog opens.
      </P>
      <P>
        The create-runtime dialog only adds stubs for graph requirements that are still missing.
        Any changes made inside that dialog are pinned into the deployment manifest for that sandbox;
        they do not rewrite the graph-owned package unless you edit the graph attachments directly.
      </P>
      <H3 id="tools">Tools JSON</H3>
      <CodeBlock language="json">{`[
  {
    "name": "MAP MCP",
    "command": "curl -H \\"Authorization: Bearer $MCP_AUTH_TOKEN\\" $MCP_INTERNAL_URL",
    "description": "Internal MAP prompt and deployment tools"
  }
]`}</CodeBlock>

      <H2 id="operate">Operate from MAP</H2>
      <P>
        Agent Hub shows each prompt and the OpenShell agent runtimes attached to it. Sandboxes shows
        the runtime command, tools, scripts, files, environment variables, ports, connections,
        security notes, policy YAML, pinned prompt, logs, and chat history.
      </P>
      <P>
        Operators can start, stop, restart, reconcile, delete, attach providers, detach providers,
        fetch logs, and chat with the running runtime. Chat uses the pinned prompt snapshot, not the
        latest editable graph text.
      </P>

      <H2 id="cli">OpenShell CLI</H2>
      <P>
        The left rail includes <Strong>OpenShell CLI</Strong>. It runs OpenShell commands through the
        Docker deployment worker, so operators can inspect sandboxes without leaving the app.
      </P>
      <CodeBlock language="bash">{`openshell sandbox list
openshell sandbox get map-your-runtime
openshell logs map-your-runtime --since 15m`}</CodeBlock>

      <H2 id="security">Security notes</H2>
      <Callout type="warning">
        The local Docker Compose setup mounts the Docker socket for the OpenShell gateway. Use it as
        a trusted local development stack, and harden gateway auth and token scoping before production.
      </Callout>
      <P>
        Keep API keys out of plain runtime environment variables. Use <InlineCode>secretEnv</InlineCode>
        for sandbox env injection or Providers v2 credentials for provider profiles. Treat
        <InlineCode>MCP_AUTH_TOKEN</InlineCode> as a server-to-server admin token and rotate it through
        your secret manager for shared deployments.
      </P>

      <RelatedLinks slugs={['reference/openshell-runtime-package', 'reference/mcp-api', 'concepts/data-privacy']} />
    </>
  )
}
