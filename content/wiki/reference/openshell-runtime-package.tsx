import {
  H2,
  P,
  Lead,
  Strong,
  InlineCode,
  CodeBlock,
  RelatedLinks,
} from '@/components/wiki/prose'

export const toc = [
  { id: 'shape', label: 'Package shape', level: 2 as const },
  { id: 'graph-attachments', label: 'Graph attachments', level: 2 as const },
  { id: 'paths', label: 'Sandbox paths', level: 2 as const },
  { id: 'providers', label: 'Provider credentials', level: 2 as const },
  { id: 'lifecycle', label: 'Lifecycle behavior', level: 2 as const },
  { id: 'visibility', label: 'UI visibility', level: 2 as const },
  { id: 'security', label: 'Secret handling', level: 2 as const },
]

export default function OpenShellRuntimePackageReference() {
  return (
    <>
      <Lead>
        Runtime packages describe everything MAP ships with an OpenShell agent runtime:
        tools, scripts, files, environment variables, declared ports, external connections,
        and security notes.
      </Lead>

      <H2 id="shape">Package shape</H2>
      <CodeBlock language="json">{`{
  "env": {
    "MCP_INTERNAL_URL": "http://mcp-server:3100/mcp",
    "OPENAI_BASE_URL": "https://api.openai.com/v1",
    "OPENAI_MODEL": "your-openai-model"
  },
  "secretEnv": {
    "OPENAI_API_KEY": "OPENAI_API_KEY"
  },
  "tools": [
    { "name": "search", "command": "node /sandbox/map/tools/search.js", "description": "Internal search helper" }
  ],
  "scripts": [
    { "name": "bootstrap", "path": "scripts/bootstrap.sh", "runOnStart": false, "content": "echo ready" }
  ],
  "files": [
    { "path": "README.runtime.md", "content": "Runtime notes" }
  ],
  "ports": [
    { "name": "runtime-api", "port": 8787, "protocol": "http", "exposure": "blocked" }
  ],
  "connections": [
    { "name": "MAP MCP", "target": "http://mcp-server:3100/mcp", "direction": "outbound" }
  ],
  "securityNotes": [
    "OpenShell policy YAML is the network and filesystem authority."
  ]
}`}</CodeBlock>

      <H2 id="graph-attachments">Graph attachments</H2>
      <P>
        Saved graphs can own a normalized <InlineCode>runtimePackage</InlineCode>. MAP stores that
        package with the graph, includes it in graph versions and JSON export, and uses it as the
        starting package when the graph is deployed to OpenShell.
      </P>
      <P>
        The graph tree can expand each graph row into a runtime attachment checklist. MAP scans
        <Strong>TOOL</Strong> nodes and script/startup metadata, then compares the detected
        requirements with the graph-owned package. Matching tools, scripts, and files are shown as
        <Strong>Attached</Strong>. Requirements with no matching implementation are shown as
        <Strong>Missing</Strong>. Tool metadata or stubs marked
        <InlineCode>needsImplementation</InlineCode> are shown as
        <Strong>Needs implementation</Strong>.
      </P>
      <P>
        <Strong>Attach code</Strong> opens the graph asset editor so an operator can paste or edit
        package JSON. <Strong>Upload file</Strong> adds text files under
        <InlineCode>files/</InlineCode>. <Strong>Create stub</Strong> creates a graph-owned Python
        tool stub under <InlineCode>tools/</InlineCode>, adds a command such as
        <InlineCode>python /sandbox/map/tools/search.py</InlineCode>, and keeps the tool marked as
        needing implementation until real code replaces the stub.
      </P>
      <P>
        Deployment-time package edits are deployment-specific. They are pinned into the deployment
        manifest and uploaded to <InlineCode>/sandbox/map</InlineCode>, but they do not change the
        saved graph unless the graph-owned attachments are edited directly.
      </P>

      <H2 id="paths">Sandbox paths</H2>
      <P>
        MAP writes the pinned prompt to <InlineCode>/sandbox/map/prompt.md</InlineCode>,
        the current chat input to <InlineCode>/sandbox/map/input.txt</InlineCode>, package metadata
        to <InlineCode>/sandbox/map/runtime-package.json</InlineCode>, and environment exports to
        <InlineCode>/sandbox/map/env.sh</InlineCode>.
      </P>
      <P>
        Plain <InlineCode>env</InlineCode> values are stored with the deployment. API keys should use
        <InlineCode>secretEnv</InlineCode> instead: the key is the variable exposed inside the sandbox,
        and the value is the source variable name on the deployment worker. MAP stores only names, not
        secret values. The worker deletes its temporary local env file after uploading it to the sandbox.
      </P>

      <H2 id="providers">Provider credentials</H2>
      <P>
        Runtime providers describe LLM, MCP, source-control, data, or custom connections. Each provider
        can declare credential keys, non-secret config, endpoint metadata, and whether OpenShell should
        attach it to the sandbox.
      </P>
      <P>
        <Strong>Providers v2</Strong> creates or updates OpenShell provider profiles and sends the
        matching credentials only during provider setup. <Strong>Inference local</Strong> additionally
        points OpenShell inference routing at the selected provider. <Strong>Legacy env</Strong> uses
        <InlineCode>secretEnv</InlineCode> to expose secrets inside the sandbox environment.
      </P>
      <CodeBlock language="json">{`{
  "providers": [
    {
      "name": "map-openai",
      "type": "openai-compatible",
      "role": "llm",
      "credentialKeys": ["OPENAI_API_KEY"],
      "sourceEnv": { "OPENAI_API_KEY": "LITELLM_API_KEY" },
      "config": {
        "base_url": "http://litellm:4000/v1",
        "model": "your-model"
      },
      "attach": true,
      "useForInference": true
    }
  ]
}`}</CodeBlock>

      <H2 id="lifecycle">Lifecycle behavior</H2>
      <P>
        The deployment worker writes package files before provisioning, starting, or chatting with a
        runtime. Chat uploads the pinned prompt and latest user input, executes the runtime command
        template, stores the assistant output, and updates deployment events.
      </P>
      <P>
        Start, stop, restart, reconcile, delete, provider attach, provider detach, logs, and chat all
        operate against the deployment record and its OpenShell sandbox name. Reconcile refreshes MAP's
        observed status from OpenShell without changing the pinned prompt.
      </P>

      <H2 id="visibility">UI visibility</H2>
      <P>
        Sandboxes shows every package section beside logs and policy YAML. Agent Hub summarizes
        which prompt has which OpenShell agent runtimes and lets operators chat, kill, restart,
        or delete the running agent.
      </P>

      <H2 id="security">Secret handling</H2>
      <P>
        The package may contain secret variable names, but it must not contain secret values. Pasted
        provider credentials are sent once to the worker and are not persisted in the package. Worker
        environment credentials stay on the worker until OpenShell needs them for provider setup or
        sandbox env injection.
      </P>
      <P>
        Treat the local Docker Compose OpenShell gateway as a trusted development setup because it
        mounts the Docker socket. For shared or production deployments, disable raw CLI access unless
        operators need it and harden gateway authentication separately.
      </P>

      <RelatedLinks slugs={['guides/deploy-openshell-runtime', 'learn/mcp-quickstart']} />
    </>
  )
}
