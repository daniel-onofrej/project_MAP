import { H2, P, Lead, Strong, InlineCode, RelatedLinks } from '@/components/wiki/prose'
import { Callout } from '@/components/wiki/prose-client'

export const toc = [
  { id: 'what-leaves', label: 'What leaves your machine', level: 2 as const },
  { id: 'what-stays', label: 'What stays local', level: 2 as const },
  { id: 'encryption', label: 'Encryption at rest', level: 2 as const },
  { id: 'localstorage', label: 'Browser localStorage', level: 2 as const },
  { id: 'selfhost', label: 'Self-hosting', level: 2 as const },
]

export default function DataPrivacyConcept() {
  return (
    <>
      <Lead>
        MAP is self-hosted by default, which means most privacy decisions are already
        yours to make. This page documents exactly what data crosses the boundary to
        third-party services, what stays on your infrastructure, and how sensitive
        material is protected at rest.
      </Lead>

      <H2 id="what-leaves">What leaves your machine</H2>
      <P>
        Only AI provider calls leave your deployment. When you click <Strong>Generate</Strong>,
        MAP sends your prompt to the provider you&apos;ve configured (Gemini, OpenAI,
        Anthropic, Groq, or your custom endpoint) along with the skill definition that
        shapes the response. When you <Strong>Run</Strong> an agent via MCP, the runtime
        input plus the reconstructed prompt is sent to the provider.
      </P>
      <P>
        Nothing else phones home. There is no telemetry, no analytics beacon, no
        anonymized-usage-stats opt-out to configure — because there is nothing to opt
        out of.
      </P>

      <H2 id="what-stays">What stays local</H2>
      <P>
        Every graph, version, comment, API key, MCP token, and audit log stays on your
        infrastructure. The database lives wherever you put it — local Postgres during
        development, managed Postgres in production, SQLite if you&apos;re really
        minimalist. MAP does not ship a managed backend tier.
      </P>

      <H2 id="encryption">Encryption at rest</H2>
      <P>
        API keys are encrypted with <Strong>AES-256-GCM</Strong> before being written to
        the database. The encryption key is read from <InlineCode>ENCRYPTION_KEY</InlineCode>{' '}
        at boot; rotating it requires re-encrypting the keys, which MAP provides a CLI
        helper for. MCP tokens are stored as salted SHA-256 hashes — the plaintext is
        only shown once at mint time and never recoverable afterward.
      </P>
      <Callout type="warning">
        If you lose <InlineCode>ENCRYPTION_KEY</InlineCode>, every stored API key is
        unrecoverable. Back it up the same way you would back up a database primary key.
        Set <InlineCode>ENCRYPTION_KEY</InlineCode> from a secret manager, not an
        unencrypted <InlineCode>.env</InlineCode> file in production.
      </Callout>

      <H2 id="localstorage">Browser localStorage</H2>
      <P>
        The editor caches two things in the browser for performance:{' '}
        <InlineCode>MAP-agents</InlineCode> (the currently-open agent draft) and{' '}
        <InlineCode>MAP_versions</InlineCode> (the version history view state). Neither
        contains secrets — API keys and MCP tokens never reach the browser. Clearing site
        data removes both without affecting server-side state.
      </P>

      <H2 id="selfhost">Self-hosting</H2>
      <P>
        For fully air-gapped environments, configure a custom endpoint pointing at an
        internal inference gateway — no outbound calls, no third-party provider. The rest
        of MAP runs offline: static assets, database, MCP server. If the custom endpoint
        reaches a self-hosted open-weight model, no data leaves your network at any point.
      </P>
      <P>
        Self-hosting also means you own the compliance story. MAP doesn&apos;t log
        personally identifiable data by default; if your compliance regime requires audit
        trails of every prompt, enable the audit log and point it at your SIEM.
      </P>

      <RelatedLinks
        slugs={[
          'guides/rotate-revoke-keys',
          'concepts/mcp-integration-model',
          'reference/ai-providers',
        ]}
      />
    </>
  )
}
