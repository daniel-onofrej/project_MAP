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
  RelatedLinks,
} from '@/components/wiki/prose'
import { Callout } from '@/components/wiki/prose-client'

export const toc = [
  { id: 'where-to-set', label: 'Where keys are stored', level: 2 as const },
  { id: 'gemini', label: 'Gemini (default)', level: 2 as const },
  { id: 'openai', label: 'OpenAI', level: 2 as const },
  { id: 'anthropic', label: 'Anthropic', level: 2 as const },
  { id: 'groq', label: 'Groq', level: 2 as const },
  { id: 'custom', label: 'Custom endpoint', level: 2 as const },
]

export default function AddAnApiProvider() {
  return (
    <>
      <Lead>
        MAP supports five providers out of the box — Gemini, OpenAI, Anthropic, Groq,
        and any OpenAI-compatible custom endpoint. This guide walks through configuring
        each, where the key ends up stored, and how to switch the default.
      </Lead>

      <H2 id="where-to-set">Where keys are stored</H2>
      <P>
        Keys are entered in <Strong>Settings → API Keys</Strong>. MAP encrypts every key
        with AES-256-GCM before storing it in the database, and the UI only ever shows a
        masked preview (last four characters) after the key is saved. The raw key is never
        returned to the client; it&apos;s only decrypted on the server when a provider
        call is made.
      </P>
      <P>
        In development, keys can also be set via environment variables — useful for CI or
        shared machines. Env-var keys take precedence over DB-stored keys for the same
        provider.
      </P>

      <Callout type="warning">
        Don&apos;t paste a key into a graph or a chat message. Keys belong in{' '}
        <Strong>Settings → API Keys</Strong> only. If you suspect a key has leaked, rotate
        it immediately — see{' '}
        <A href="/wiki/guides/rotate-revoke-keys">Rotate or Revoke Keys</A>.
      </Callout>

      <H2 id="gemini">Gemini (default)</H2>
      <P>
        Gemini 3 Flash is MAP&apos;s default provider. Get an API key from the Google AI
        Studio console, paste it into <Strong>Settings → API Keys → Gemini</Strong>, and
        save. The key activates immediately; the next graph generation will use it.
      </P>
      <P>Env var equivalent:</P>
      <CodeBlock language="env">GEMINI_API_KEY=your-key-here</CodeBlock>

      <H2 id="openai">OpenAI</H2>
      <P>
        Get a key from <InlineCode>platform.openai.com/api-keys</InlineCode>. Paste it into{' '}
        <Strong>Settings → API Keys → OpenAI</Strong>. MAP defaults to GPT-4o for
        generation and <InlineCode>text-embedding-3-small</InlineCode> for any semantic
        comparisons.
      </P>
      <CodeBlock language="env">OPENAI_API_KEY=sk-...</CodeBlock>

      <H3 id="openai-model-override">Model override</H3>
      <P>
        If you need a different model (for example, GPT-4o-mini for cost, or a fine-tuned
        model for your domain), set it in the provider settings dropdown. MAP stores the
        override per workspace.
      </P>

      <H2 id="anthropic">Anthropic</H2>
      <P>
        Get a key from <InlineCode>console.anthropic.com</InlineCode>. Paste it into{' '}
        <Strong>Settings → API Keys → Anthropic</Strong>. MAP defaults to
        Claude Sonnet for generation.
      </P>
      <CodeBlock language="env">ANTHROPIC_API_KEY=sk-ant-...</CodeBlock>

      <H2 id="groq">Groq</H2>
      <P>
        Groq provides extremely fast inference on a handful of open-weight models — useful
        when you&apos;re iterating on a prompt and don&apos;t want to wait. Get a key from{' '}
        <InlineCode>console.groq.com</InlineCode> and paste it into{' '}
        <Strong>Settings → API Keys → Groq</Strong>.
      </P>
      <CodeBlock language="env">GROQ_API_KEY=gsk_...</CodeBlock>

      <H2 id="custom">Custom endpoint</H2>
      <P>
        For self-hosted inference servers (vLLM, LM Studio, TGI) or private gateways,
        MAP supports a <Strong>Custom</Strong> provider that speaks the OpenAI chat
        completions format. Configure three fields:
      </P>
      <UL>
        <LI>
          <InlineCode>base_url</InlineCode> — the root of the provider, e.g.{' '}
          <InlineCode>https://my-vllm.internal/v1</InlineCode>.
        </LI>
        <LI>
          <InlineCode>api_key</InlineCode> — a bearer token, if required.
        </LI>
        <LI>
          <InlineCode>model</InlineCode> — the model identifier the endpoint expects.
        </LI>
      </UL>
      <P>
        MAP will send standard OpenAI-format requests. If your endpoint supports streamed
        JSON responses, MAP uses them; otherwise it falls back to buffered mode
        automatically.
      </P>

      <Callout type="note">
        Not every endpoint supports structured JSON output the way Gemini and OpenAI do.
        If graph generation produces malformed JSON on a custom endpoint, try a model
        known to follow <InlineCode>response_format</InlineCode> instructions (Llama 3.1
        70B Instruct, Qwen 2.5 Coder) — or switch to a provider that does.
      </Callout>

      <RelatedLinks
        slugs={[
          'reference/ai-providers',
          'guides/rotate-revoke-keys',
          'guides/debug-failed-generation',
        ]}
      />
    </>
  )
}
