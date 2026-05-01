import {
  H2,
  P,
  UL,
  LI,
  Lead,
  Strong,
  InlineCode,
  RelatedLinks,
} from '@/components/wiki/prose'
import { Callout, Steps, Step } from '@/components/wiki/prose-client'

export const toc = [
  { id: 'rotation', label: 'Rotating a provider key', level: 2 as const },
  { id: 'revocation', label: 'Revoking a key', level: 2 as const },
  { id: 'mcp-tokens', label: 'MCP tokens', level: 2 as const },
  { id: 'incident', label: 'Suspected leak — what to do', level: 2 as const },
]

export default function RotateRevokeKeys() {
  return (
    <>
      <Lead>
        Keys don&apos;t last forever. A contractor leaves, a machine gets shared, a file
        gets accidentally committed. This guide covers the three flows MAP supports:
        rotating a provider key without interrupting service, revoking a key immediately,
        and the equivalent flows for MCP tokens.
      </Lead>

      <H2 id="rotation">Rotating a provider key</H2>
      <P>
        Rotation replaces an old key with a new one without downtime. Because MAP stores
        keys encrypted in the database, you don&apos;t have to restart any services — the
        change takes effect the moment you save.
      </P>
      <Steps>
        <Step n={1} title="Mint the replacement">
          <P>
            In the provider&apos;s console (Google, OpenAI, etc.), create a new key. Leave
            the old key active for now.
          </P>
        </Step>
        <Step n={2} title="Paste it into MAP">
          <P>
            Go to <Strong>Settings → API Keys</Strong>, select the provider, and click{' '}
            <Strong>Replace</Strong>. Paste the new key and save. The masked preview in the
            UI will change to the new last-four.
          </P>
        </Step>
        <Step n={3} title="Verify and deactivate the old key">
          <P>
            Run a test generation to confirm the new key works. Then return to the provider
            console and deactivate the old key. Leaving old keys active &ldquo;just in
            case&rdquo; is the most common cause of later incidents.
          </P>
        </Step>
      </Steps>

      <H2 id="revocation">Revoking a key</H2>
      <P>
        Revocation is the emergency path: a key is suspected of leaking and you want it
        dead immediately. From <Strong>Settings → API Keys</Strong>, click{' '}
        <Strong>Revoke</Strong> on the provider. The key is removed from MAP&apos;s
        database in one transaction; no background job, no delay.
      </P>
      <P>
        Revocation in MAP <em>does not</em> disable the key at the provider — you still
        need to log into the provider&apos;s console and disable it there too. MAP can
        only control whether <em>MAP</em> uses the key; whoever else holds a copy can
        still call the provider.
      </P>

      <Callout type="warning">
        Revocation is destructive. Any queued graph generation using the revoked key will
        fail. If you want a safer rotation, use the <em>Replace</em> path above instead.
      </Callout>

      <H2 id="mcp-tokens">MCP tokens</H2>
      <P>
        MCP tokens follow the same rotation and revocation model, exposed under{' '}
        <Strong>Settings → MCP Tokens</Strong>. Each token shows its scopes, creation date,
        and last-used timestamp. Click a token row to revoke, or{' '}
        <Strong>+ New token</Strong> to mint a replacement.
      </P>
      <UL>
        <LI>
          <Strong>Rotation:</Strong> mint a new token with the same scopes, update the
          client to use it, then revoke the old one.
        </LI>
        <LI>
          <Strong>Revocation:</Strong> click <Strong>Revoke</Strong>. Any in-flight MCP
          request with that token will fail with HTTP 401 on its next turn.
        </LI>
      </UL>

      <H2 id="incident">Suspected leak — what to do</H2>
      <P>
        If you believe a key has leaked, move fast but in order:
      </P>
      <UL>
        <LI>
          <Strong>Revoke first.</Strong> Don&apos;t debug, don&apos;t confirm — revoke the
          key in MAP and the provider console.
        </LI>
        <LI>
          <Strong>Mint a replacement.</Strong> Get services back up.
        </LI>
        <LI>
          <Strong>Check the audit log.</Strong> MAP records every provider call and
          every MCP request; a leaked key that was used will have a footprint. Look for
          requests from unknown IPs or unusual time windows.
        </LI>
        <LI>
          <Strong>Find the source.</Strong> Grep your repos for the key prefix, check
          screen-recording tools, check CI logs. Fix the actual leak, not just its
          symptom.
        </LI>
      </UL>

      <RelatedLinks
        slugs={[
          'guides/add-an-api-provider',
          'concepts/data-privacy',
          'reference/permissions-and-roles',
        ]}
      />
    </>
  )
}
