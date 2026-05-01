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
  { id: 'auth', label: 'Authentication', level: 2 as const },
  { id: 'list-agents', label: 'list_agents', level: 2 as const },
  { id: 'get-agent', label: 'get_agent', level: 2 as const },
  { id: 'run-agent', label: 'run_agent', level: 2 as const },
  { id: 'create-agent', label: 'create_agent', level: 2 as const },
  { id: 'update-agent', label: 'update_agent', level: 2 as const },
  { id: 'errors', label: 'Error codes', level: 2 as const },
]

export default function McpApiReference() {
  return (
    <>
      <Lead>
        The MAP MCP server exposes your graphs as tools callable from any MCP-compatible
        client (Claude Desktop, Cursor, your own agent runner). This page documents every
        tool, its parameters, and the exact JSON the server returns.
      </Lead>

      <H2 id="overview">Overview</H2>
      <P>
        The server runs at <InlineCode>http://localhost:3100/mcp</InlineCode> by default.
        Transport is HTTP + SSE via <InlineCode>mcp-remote</InlineCode>; the underlying
        protocol is standard MCP. All tools are namespaced under the{' '}
        <InlineCode>MAP</InlineCode> server name.
      </P>

      <H2 id="auth">Authentication</H2>
      <P>
        Every request must include a bearer token in the <InlineCode>Authorization</InlineCode>{' '}
        header. Tokens are minted in the UI (Settings → MCP Tokens) and carry one or more
        scopes: <InlineCode>read</InlineCode>, <InlineCode>write</InlineCode>,{' '}
        <InlineCode>run</InlineCode>.
      </P>
      <CodeBlock language="http">{`GET /mcp HTTP/1.1
Host: localhost:3100
Authorization: Bearer verto_pat_1a2b3c4d...`}</CodeBlock>

      <H2 id="list-agents">list_agents</H2>
      <P>
        Returns the set of agents visible to the token. <Strong>Scope:</Strong>{' '}
        <InlineCode>read</InlineCode>.
      </P>
      <CodeBlock language="json">{`// Response
{
  "agents": [
    { "id": "agt_01H...", "name": "Support triage", "version": 4, "updatedAt": "2026-04-10T14:22:01Z" },
    { "id": "agt_02K...", "name": "Refund approver", "version": 2, "updatedAt": "2026-04-18T09:10:44Z" }
  ]
}`}</CodeBlock>

      <H2 id="get-agent">get_agent</H2>
      <P>
        Returns the full graph for one agent, including nodes, edges, and the reconstructed
        prompt. <Strong>Scope:</Strong> <InlineCode>read</InlineCode>.
      </P>
      <CodeBlock language="json">{`// Request
{ "id": "agt_01H..." }

// Response (abbreviated)
{
  "id": "agt_01H...",
  "name": "Support triage",
  "version": 4,
  "graph": { "nodes": [ ... ], "edges": [ ... ] },
  "prompt": "You are a customer support agent..."
}`}</CodeBlock>

      <H2 id="run-agent">run_agent</H2>
      <P>
        Executes an agent against a user input. The server resolves the graph to a prompt
        and dispatches to the provider configured for the agent.{' '}
        <Strong>Scope:</Strong> <InlineCode>run</InlineCode>.
      </P>
      <CodeBlock language="json">{`// Request
{
  "id": "agt_01H...",
  "input": "My last payment failed. What happened?",
  "context": { "userId": "usr_42", "tier": "pro" }
}

// Response
{
  "output": "It looks like your card was declined...",
  "trace": {
    "nodesVisited": ["START", "classify_intent", "lookup_account", "END"],
    "durationMs": 1847
  }
}`}</CodeBlock>

      <H2 id="create-agent">create_agent</H2>
      <P>
        Creates a new agent from a prompt. Equivalent to clicking Generate in the UI.{' '}
        <Strong>Scope:</Strong> <InlineCode>write</InlineCode>.
      </P>
      <CodeBlock language="json">{`// Request
{
  "name": "Onboarding helper",
  "prompt": "Greet the user, collect their company name..."
}`}</CodeBlock>

      <H2 id="update-agent">update_agent</H2>
      <P>
        Replaces the graph of an existing agent. Creates a new version automatically.{' '}
        <Strong>Scope:</Strong> <InlineCode>write</InlineCode>.
      </P>
      <CodeBlock language="json">{`// Request
{ "id": "agt_01H...", "graph": { "nodes": [ ... ], "edges": [ ... ] } }`}</CodeBlock>

      <H2 id="errors">Error codes</H2>
      <div className="rounded-lg border border-border/50 overflow-hidden my-5">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-36">Code</th>
              <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Meaning</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            <tr><td className="px-4 py-2.5 font-mono text-xs">UNAUTHORIZED</td><td className="px-4 py-2.5 text-foreground/80">Token missing, malformed, or revoked.</td></tr>
            <tr><td className="px-4 py-2.5 font-mono text-xs">FORBIDDEN</td><td className="px-4 py-2.5 text-foreground/80">Token valid but lacks the required scope.</td></tr>
            <tr><td className="px-4 py-2.5 font-mono text-xs">NOT_FOUND</td><td className="px-4 py-2.5 text-foreground/80">Agent id does not exist or is not visible to the token.</td></tr>
            <tr><td className="px-4 py-2.5 font-mono text-xs">INVALID_GRAPH</td><td className="px-4 py-2.5 text-foreground/80">The graph failed DAG validation (cycle, unreachable end, etc.).</td></tr>
            <tr><td className="px-4 py-2.5 font-mono text-xs">PROVIDER_ERROR</td><td className="px-4 py-2.5 text-foreground/80">The configured AI provider returned a non-2xx response during run_agent.</td></tr>
            <tr><td className="px-4 py-2.5 font-mono text-xs">RATE_LIMITED</td><td className="px-4 py-2.5 text-foreground/80">Token-level rate limit hit. Back off and retry.</td></tr>
          </tbody>
        </table>
      </div>

      <Callout type="tip">
        The MCP server logs every tool call with token id, scope, agent id, and outcome.
        Tail the logs with <InlineCode>docker compose logs -f mcp</InlineCode> when
        debugging a client integration.
      </Callout>

      <RelatedLinks
        slugs={[
          'learn/mcp-quickstart',
          'concepts/mcp-integration-model',
          'guides/rotate-revoke-keys',
        ]}
      />
    </>
  )
}
