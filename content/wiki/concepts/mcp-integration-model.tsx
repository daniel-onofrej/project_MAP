import { H2, P, Lead, Strong, InlineCode, RelatedLinks } from '@/components/wiki/prose'
import { Callout } from '@/components/wiki/prose-client'

export const toc = [
  { id: 'why', label: 'Why MCP', level: 2 as const },
  { id: 'topology', label: 'Topology', level: 2 as const },
  { id: 'scopes', label: 'Token scopes', level: 2 as const },
  { id: 'threat-model', label: 'Threat model', level: 2 as const },
  { id: 'patterns', label: 'Common integration patterns', level: 2 as const },
]

export default function McpIntegrationModelConcept() {
  return (
    <>
      <Lead>
        MAP ships an MCP (Model Context Protocol) server so any MCP-compatible client
        can invoke your graphs. This page explains why MCP is the right boundary, how
        tokens and scopes combine, and the threat model we assume.
      </Lead>

      <H2 id="why">Why MCP</H2>
      <P>
        A graph is most useful when another agent can call it. Before MCP, integrating a
        tool into Claude Desktop meant bespoke plugin code, schema paperwork, or building
        a custom runner. MCP standardizes that boundary: any tool that speaks MCP becomes
        callable from any MCP-aware agent with a single config block.
      </P>
      <P>
        MAP exposes its primitives — list, read, run, create, update agents — as MCP
        tools. Clients get a typed, scoped interface to your graphs without needing to
        know anything about MAP&apos;s internals.
      </P>

      <H2 id="topology">Topology</H2>
      <P>
        A typical deployment has three participants: the <Strong>MCP client</Strong>{' '}
        (Claude Desktop, Cursor, your own agent), the <Strong>MAP MCP server</Strong>{' '}
        running beside the MAP app, and the <Strong>MAP app database</Strong> that
        stores graphs and tokens. The client authenticates to the server with a bearer
        token; the server consults the database to resolve the token to a user and a set
        of scopes.
      </P>
      <P>
        The MCP server is a separate process from the main Next.js app. It shares the
        database but has its own port, its own logs, and its own auth surface. This
        separation is deliberate — you can disable MCP entirely without affecting the
        editor.
      </P>

      <H2 id="scopes">Token scopes</H2>
      <P>
        Every token carries one or more scopes:
      </P>
      <ul className="list-disc pl-6 space-y-1 text-[15px] leading-7 text-foreground/85 mb-6 marker:text-muted-foreground/60">
        <li><InlineCode>read</InlineCode> — list and fetch agents and their graphs.</li>
        <li><InlineCode>run</InlineCode> — execute an agent. Implies <InlineCode>read</InlineCode>.</li>
        <li><InlineCode>write</InlineCode> — create or update agents. Implies <InlineCode>read</InlineCode>.</li>
      </ul>
      <P>
        Mint tokens with the minimum scope an integration needs. A read-only dashboard
        should hold only <InlineCode>read</InlineCode>; an agent that calls your agents as
        tools needs <InlineCode>run</InlineCode>; only a CI pipeline that pushes graph
        updates needs <InlineCode>write</InlineCode>.
      </P>

      <H2 id="threat-model">Threat model</H2>
      <Callout type="warning">
        An MCP token with <InlineCode>run</InlineCode> can invoke every agent visible to
        the issuing user. If an agent calls a <Strong>TOOL</Strong> that costs money or
        sends customer email, that cost is realized on every invocation. Treat MCP tokens
        with the same care you give AWS keys.
      </Callout>
      <P>
        What the server assumes: the token bearer is authorized to act as the user. What
        it does not assume: that the bearer is the user&apos;s own machine — tokens travel,
        and the server cannot distinguish Claude Desktop on your laptop from a script
        running in a different country.
      </P>
      <P>
        Mitigations MAP provides: token revocation takes effect immediately; each token
        has a last-used-at timestamp surfaced in the UI; token rotation is a one-click
        operation that deprecates the old token on the next request.
      </P>

      <H2 id="patterns">Common integration patterns</H2>
      <P>
        <Strong>Agent-of-agents</Strong> is the most common pattern. A high-level Claude
        agent loads your MAP graphs as specialized tools — &ldquo;triage this support
        ticket,&rdquo; &ldquo;draft this refund email&rdquo; — and orchestrates them.
      </P>
      <P>
        <Strong>Audit-only</Strong> integrations use <InlineCode>read</InlineCode> scope
        to pull graphs into an external review pipeline — diffing against compliance
        rules, emitting metrics, or posting changes to a Slack channel.
      </P>
      <P>
        <Strong>CI authoring</Strong> uses <InlineCode>write</InlineCode> scope to sync
        graphs from a git repository so the source of truth lives in PRs, not the
        in-app editor.
      </P>

      <RelatedLinks
        slugs={[
          'learn/mcp-quickstart',
          'reference/mcp-api',
          'concepts/data-privacy',
        ]}
      />
    </>
  )
}
