import {
  H2,
  H3,
  P,
  UL,
  LI,
  Lead,
  Strong,
  A,
  InlineCode,
  CodeBlock,
  YouWillLearn,
  RelatedLinks,
} from '@/components/wiki/prose'
import { Callout, Steps, Step, Screenshot } from '@/components/wiki/prose-client'

export const toc = [
  { id: 'what-is-mcp', label: 'What is MCP?', level: 2 as const },
  { id: 'enable-server', label: 'Enable the MCP server', level: 2 as const },
  { id: 'mint-token', label: 'Mint an access token', level: 2 as const },
  { id: 'connect-claude', label: 'Connect Claude Desktop', level: 2 as const },
  { id: 'invoke', label: 'Invoke your graph', level: 2 as const },
  { id: 'security', label: 'Security notes', level: 2 as const },
]

const CLAUDE_CONFIG = `{
  "mcpServers": {
    "MAP": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3100/mcp"]
    }
  }
}`

const ENV_BLOCK = `MCP_ENABLED=true
MCP_CORS_ORIGIN=http://localhost:3000
MCP_AUTH_TOKEN=$(openssl rand -hex 32)`

export default function McpQuickstart() {
  return (
    <>
      <Lead>
        MAP ships with a full MCP (Model Context Protocol) server. Once enabled, any
        MCP-compatible client — Claude Desktop, Cursor, a custom agent — can list your
        graphs, read their contents, and invoke them as tools. This tutorial walks through
        the shortest path from &ldquo;MCP is off&rdquo; to &ldquo;Claude Desktop is calling
        my graph.&rdquo;
      </Lead>

      <YouWillLearn
        items={[
          'What MCP is and why MAP supports it',
          'Enable the MCP server with the right environment variables',
          'Mint a scoped access token',
          'Wire Claude Desktop to MAP and invoke a graph from a chat',
        ]}
      />

      <H2 id="what-is-mcp">What is MCP?</H2>
      <P>
        <Strong>Model Context Protocol</Strong> is a small, open standard for describing
        tools that an LLM-based agent can call. It standardizes three things: how an agent
        discovers available tools, how it invokes them with structured arguments, and how
        responses flow back. If you&apos;ve integrated OpenAI function calling or
        Anthropic&apos;s tool use before, MCP is the same idea — hoisted into a shared
        protocol that every vendor can support.
      </P>
      <P>
        MAP&apos;s MCP server exposes your graphs and a handful of graph-management
        operations — listing, fetching, running, and (for higher privilege levels)
        creating — as MCP tools. This means any MCP client can treat MAP as its
        long-term memory of structured agents without needing a bespoke integration.
      </P>

      <Callout type="note">
        If you&apos;re self-hosting, the MCP server runs on port <InlineCode>3100</InlineCode>{' '}
        by default, separate from the main MAP Next.js app on port{' '}
        <InlineCode>3000</InlineCode>. Both are controlled from the same repo.
      </Callout>

      <H2 id="enable-server">Enable the MCP server</H2>
      <P>
        In a fresh install the MCP server is disabled by default. Flip it on by setting
        three environment variables in <InlineCode>.env</InlineCode> (or in the{' '}
        <InlineCode>mcp-server/.env</InlineCode> file for the sub-package):
      </P>
      <CodeBlock language="env">{ENV_BLOCK}</CodeBlock>
      <P>
        Restart the stack — <InlineCode>docker compose up</InlineCode> or{' '}
        <InlineCode>npm run dev:all</InlineCode> — and MAP will boot both the web UI and
        the MCP server. You can verify the server is reachable by curling its health
        endpoint:
      </P>
      <CodeBlock language="bash">{`curl http://localhost:3100/health`}</CodeBlock>

      <H2 id="mint-token">Mint an access token</H2>
      <P>
        External clients authenticate with <Strong>bearer tokens</Strong> scoped to a user
        and a set of allowed operations. From MAP, open{' '}
        <Strong>Settings → MCP Tokens</Strong>, click <Strong>New token</Strong>, choose
        the scopes you want, and copy the secret that appears.
      </P>
      <Screenshot
        alt="The MCP tokens settings page with scope checkboxes and a New token button."
        caption="Tokens are shown once — copy them to your client immediately."
      />

      <H3 id="scopes">Scopes at a glance</H3>
      <UL>
        <LI>
          <InlineCode>agents:read</InlineCode> — list and fetch graphs the user owns.
        </LI>
        <LI>
          <InlineCode>agents:run</InlineCode> — execute a graph as a tool.
        </LI>
        <LI>
          <InlineCode>agents:write</InlineCode> — create and edit graphs from the client.
          Grant sparingly; anyone holding this token can modify your workspace.
        </LI>
      </UL>

      <Callout type="warning">
        Tokens are shown once. If you lose one, revoke it and mint a new one — you
        can&apos;t recover the secret later. See{' '}
        <A href="/wiki/guides/rotate-revoke-keys">Rotate or Revoke Keys</A> for the full
        procedure.
      </Callout>

      <H2 id="connect-claude">Connect Claude Desktop</H2>
      <P>
        Claude Desktop reads its MCP configuration from{' '}
        <InlineCode>claude_desktop_config.json</InlineCode>. Add the following entry under{' '}
        <InlineCode>mcpServers</InlineCode>, replacing the URL if you&apos;re running
        remotely:
      </P>
      <CodeBlock language="json">{CLAUDE_CONFIG}</CodeBlock>
      <P>
        When Claude Desktop starts, it launches <InlineCode>mcp-remote</InlineCode> which
        in turn speaks HTTP to MAP on <InlineCode>http://localhost:3100/mcp</InlineCode>.
        The bearer token is negotiated on the first call; Claude Desktop will prompt you
        for it in a dialog the first time.
      </P>

      <H2 id="invoke">Invoke your graph</H2>
      <P>
        Open a Claude Desktop conversation. Type something like:
      </P>
      <CodeBlock language="text">
        {`Use the MAP tools to list my agents, then run the one called "Customer Support" with the input "My invoice is wrong".`}
      </CodeBlock>
      <P>
        Claude Desktop resolves this into three MCP calls: <InlineCode>list_agents</InlineCode>,{' '}
        <InlineCode>get_agent</InlineCode> for the matching name, and{' '}
        <InlineCode>run_agent</InlineCode> with your input. Each call streams back through
        the same bearer token you configured. Claude then formats the graph&apos;s output
        back into the chat.
      </P>

      <Callout type="tip">
        If you want to inspect the raw MCP traffic during development, set{' '}
        <InlineCode>MCP_LOG_LEVEL=debug</InlineCode> in the server env. Every request and
        response is pretty-printed to the server&apos;s stdout.
      </Callout>

      <H2 id="security">Security notes</H2>
      <P>
        Because MCP tokens carry real authority over your graphs, treat them like API keys:
      </P>
      <UL>
        <LI>
          <Strong>Scope narrowly.</Strong> If a client only needs to list graphs, give it{' '}
          <InlineCode>agents:read</InlineCode> and nothing else.
        </LI>
        <LI>
          <Strong>Rotate periodically.</Strong> Especially tokens used in CI or shared
          machines. The admin bypass token (<InlineCode>MCP_AUTH_TOKEN</InlineCode>) is{' '}
          <em>development-only</em>; remove it from any production environment.
        </LI>
        <LI>
          <Strong>Pin the CORS origin.</Strong>{' '}
          <InlineCode>MCP_CORS_ORIGIN</InlineCode> should match exactly where the MAP UI
          is served from. Leaving it as <InlineCode>*</InlineCode> is a hard no.
        </LI>
        <LI>
          <Strong>Audit the logs.</Strong> Every MCP call is recorded in the MAP audit
          trail; check the Logs panel if you suspect a token has leaked.
        </LI>
      </UL>

      <RelatedLinks
        slugs={[
          'reference/mcp-api',
          'concepts/mcp-integration-model',
          'guides/rotate-revoke-keys',
        ]}
      />
    </>
  )
}
