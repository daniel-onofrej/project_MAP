import {
  H2,
  P,
  UL,
  LI,
  Lead,
  Strong,
  A,
  InlineCode,
  CodeBlock,
  RelatedLinks,
} from '@/components/wiki/prose'
import { Callout } from '@/components/wiki/prose-client'

export const toc = [
  { id: 'symptom-map', label: 'Symptom → cause map', level: 2 as const },
  { id: 'empty', label: 'Empty or near-empty graph', level: 2 as const },
  { id: 'auth', label: 'Authentication failures', level: 2 as const },
  { id: 'rate-limit', label: 'Rate limits and timeouts', level: 2 as const },
  { id: 'malformed', label: 'Malformed JSON responses', level: 2 as const },
  { id: 'network', label: 'Network and DNS', level: 2 as const },
]

export default function DebugFailedGeneration() {
  return (
    <>
      <Lead>
        Graph generation fails for a small number of recognizable reasons. This page maps
        the symptoms you&apos;ll see in the UI to their causes and fixes. If your failure
        isn&apos;t listed here, open the browser devtools network tab and look at the
        request to <InlineCode>/api/generate</InlineCode> — the response body has a
        human-readable error code.
      </Lead>

      <H2 id="symptom-map">Symptom → cause map</H2>
      <UL>
        <LI>
          <Strong>Dialog hangs, no graph appears</Strong> → usually rate-limit or a
          long-running model. Check the status bar for a spinner.
        </LI>
        <LI>
          <Strong>Graph appears with 1–2 nodes</Strong> → the model returned malformed
          JSON; MAP fell back to a minimal skeleton. Retry or pick a different model.
        </LI>
        <LI>
          <Strong>&ldquo;Invalid API key&rdquo; toast</Strong> → provider key is wrong,
          revoked, or missing. Re-paste and save.
        </LI>
        <LI>
          <Strong>&ldquo;Failed to parse response&rdquo; error</Strong> → custom-endpoint
          model doesn&apos;t follow <InlineCode>response_format</InlineCode>. Switch
          models.
        </LI>
        <LI>
          <Strong>&ldquo;Network error&rdquo;</Strong> → provider unreachable from your
          MAP instance. Check firewall / proxy.
        </LI>
      </UL>

      <H2 id="empty">Empty or near-empty graph</H2>
      <P>
        The most common cause is an ambiguous prompt. If the LLM can&apos;t figure out
        what the agent <em>does</em>, it defaults to a generic skeleton:{' '}
        <InlineCode>START → TASK → END</InlineCode>. The fix is to tighten the prompt —
        replace phrases like &ldquo;handle customer requests&rdquo; with concrete actions
        (&ldquo;classify the intent, look up the account, issue a refund if eligible&rdquo;).
      </P>
      <P>
        Less commonly, the model truncated its response because it hit a max-tokens limit.
        If your prompt is long (over ~2000 tokens), switch to a model with a larger output
        budget — GPT-4o or Gemini 1.5 Pro both handle much longer structured responses
        than the default flash tiers.
      </P>

      <H2 id="auth">Authentication failures</H2>
      <P>
        MAP will display <InlineCode>Invalid API key</InlineCode> if the provider
        returned 401. Three causes:
      </P>
      <UL>
        <LI>The key was typed or pasted incorrectly. Re-paste.</LI>
        <LI>The key has been revoked at the provider. Mint a new one.</LI>
        <LI>
          The key lacks the scope to call the model. Some providers (OpenAI) require
          explicit model access — check your provider console.
        </LI>
      </UL>

      <H2 id="rate-limit">Rate limits and timeouts</H2>
      <P>
        Provider 429 (too many requests) surfaces as{' '}
        <InlineCode>Rate limit hit, retry shortly</InlineCode>. MAP does not
        auto-retry — waiting and clicking <Strong>Regenerate</Strong> is usually enough.
        For chronic rate-limit issues, either raise your provider quota or switch
        providers for heavy generation (Groq is good here).
      </P>
      <P>
        A request timeout (no response after ~60 seconds) almost always means the model
        hung while generating a very large structured response. Shorten the prompt or
        switch to a model better tuned for JSON output.
      </P>

      <H2 id="malformed">Malformed JSON responses</H2>
      <P>
        If you see <InlineCode>Failed to parse response</InlineCode>, the model returned
        text that wasn&apos;t valid JSON. This is most common with custom endpoints or
        models not tuned for structured output. MAP logs the raw response to the server
        console; inspect it to see exactly what came back.
      </P>
      <CodeBlock language="bash">{`# Tail the server logs for the raw model response:
docker compose logs -f MAP | grep "raw_response"`}</CodeBlock>

      <Callout type="tip">
        Most fixes for malformed JSON come down to switching models. Models that reliably
        emit structured JSON include Gemini 3 Flash, GPT-4o, Claude Sonnet 4, and
        Llama 3.1 70B Instruct. Smaller open-weight models often won&apos;t.
      </Callout>

      <H2 id="network">Network and DNS</H2>
      <P>
        If MAP is deployed behind a corporate proxy, outbound calls to providers may be
        blocked. Symptoms: every generation fails with <InlineCode>Network error</InlineCode>{' '}
        immediately, regardless of provider. Configure the proxy env vars
        (<InlineCode>HTTPS_PROXY</InlineCode>, <InlineCode>HTTP_PROXY</InlineCode>) for the
        MAP container and restart.
      </P>
      <P>
        For air-gapped or restricted networks, set up a <em>Custom endpoint</em> pointing
        at an internal inference gateway you control. See{' '}
        <A href="/wiki/guides/add-an-api-provider">Add an API Provider</A>.
      </P>

      <RelatedLinks
        slugs={[
          'guides/add-an-api-provider',
          'reference/ai-providers',
          'learn/build-your-first-graph',
        ]}
      />
    </>
  )
}
