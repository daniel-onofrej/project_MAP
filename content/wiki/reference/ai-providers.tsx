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
import { AI_PROVIDERS } from '@/lib/wiki/data'

export const toc = [
  { id: 'overview', label: 'Provider overview', level: 2 as const },
  { id: 'prompt-portability', label: 'Prompt portability', level: 2 as const },
  { id: 'gemini', label: 'Gemini (default)', level: 2 as const },
  { id: 'openai', label: 'OpenAI', level: 2 as const },
  { id: 'anthropic', label: 'Anthropic', level: 2 as const },
  { id: 'custom', label: 'Custom endpoint', level: 2 as const },
  { id: 'switching', label: 'Switching providers', level: 2 as const },
]

type ModelRow = { id: string; role: string; notes: string }

const OPENAI_MODELS: ModelRow[] = [
  { id: 'gpt-5.4', role: 'Flagship', notes: 'General-purpose reasoning and long-form structured output. Best default for complex graphs.' },
  { id: 'gpt-5.4-mini', role: 'Fast', notes: 'Lower-latency sibling of gpt-5.4. Good for re-sync and iterative edits.' },
  { id: 'gpt-codex', role: 'Code', notes: 'Tuned for code generation and tool-shaped JSON. Useful when graphs emit API calls.' },
  { id: 'gpt-4o', role: 'Legacy flagship', notes: 'Reliable JSON mode; the previous default before gpt-5.4.' },
  { id: 'gpt-4o-mini', role: 'Legacy fast', notes: 'Cost-effective for high-volume generation.' },
  { id: 'o3', role: 'Reasoning', notes: 'Multi-step reasoning model. Slower, more expensive, more thorough.' },
  { id: 'o3-mini', role: 'Reasoning (fast)', notes: 'Lower-latency reasoning model.' },
]

const ANTHROPIC_MODELS: ModelRow[] = [
  { id: 'claude-opus-4-7', role: 'Flagship', notes: 'Strongest reasoning across the Claude 4 line. Use for hard graphs and tight constraints.' },
  { id: 'claude-sonnet-4-6', role: 'Balanced', notes: 'Default Sonnet — very high quality at roughly a third of Opus cost.' },
  { id: 'claude-haiku-4-5-20251001', role: 'Fast', notes: 'Sub-second responses; great for re-sync and chat edits.' },
]

function ModelTable({ rows }: { rows: ModelRow[] }) {
  return (
    <div className="rounded-lg border border-border/50 overflow-hidden my-4">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="border-b border-border/50 bg-muted/30">
            <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-52">Model</th>
            <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-32">Role</th>
            <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-muted/20 transition-colors">
              <td className="px-4 py-2.5 font-mono text-xs align-top">{r.id}</td>
              <td className="px-4 py-2.5 text-foreground/80 align-top">{r.role}</td>
              <td className="px-4 py-2.5 text-foreground/80 align-top leading-6">{r.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function AIProvidersReference() {
  return (
    <>
      <Lead>
        MAP is provider-agnostic at the UI level — generation, re-sync, and chat edits
        all go through the same interface regardless of which model is backing them. This
        page documents each supported provider, the models exposed, and the environment
        variable each expects.
      </Lead>

      <H2 id="overview">Provider overview</H2>
      <div className="grid gap-3 sm:grid-cols-2 my-5">
        {AI_PROVIDERS.map((p) => (
          <div
            key={p.name}
            className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/40 p-4"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: p.dot }}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-sm font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.note}</p>
            </div>
          </div>
        ))}
      </div>

      <H2 id="prompt-portability">Prompt portability</H2>
      <P>
        The <Strong>same prompt is sent to every provider</Strong>. MAP does not rewrite
        it per vendor, does not inject provider-specific formatting hints, and does not
        fork skill definitions by model. Switching providers is a drop-in operation — if
        a graph generates cleanly on Gemini, it will generate cleanly on Claude or GPT with
        the same prompt.
      </P>
      <P>
        This is a deliberate constraint. Portability is a first-class feature: you should
        be able to test the same prompt against multiple models and compare results
        without editing anything.
      </P>

      <H2 id="gemini">Gemini (default)</H2>
      <P>
        Gemini is the default provider and the one the repository is most thoroughly tested
        against. Graph generation uses <InlineCode>gemini-3-flash-preview</InlineCode> at
        temperature 0, which produces stable, deterministic JSON output for the
        prompt-flow-graph skill.
      </P>
      <CodeBlock language="env">{`GOOGLE_API_KEY=your_key_here
GEMINI_MODEL=gemini-3-flash-preview`}</CodeBlock>
      <P>
        Rate limits apply at the Google Cloud project level. For heavy usage, enable
        billing on your project — free-tier limits hit quickly under sustained generation.
        Get your key at <InlineCode>aistudio.google.com</InlineCode>.
      </P>

      <H2 id="openai">OpenAI</H2>
      <P>
        OpenAI support covers the GPT-5 family, GPT-4o, Codex, and the o-series reasoning
        models. JSON structure is enforced via{' '}
        <InlineCode>response_format: json_object</InlineCode> on non-reasoning models; for
        o-series the prompt steers output directly.
      </P>
      <ModelTable rows={OPENAI_MODELS} />
      <CodeBlock language="env">{`OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.4`}</CodeBlock>
      <P>
        Get your key at <InlineCode>platform.openai.com</InlineCode>. The settings dialog
        exposes a reasoning-effort slider (low / medium / high) whenever you pick an
        o-series model — this maps to OpenAI&apos;s <InlineCode>reasoning_effort</InlineCode>{' '}
        parameter.
      </P>

      <H2 id="anthropic">Anthropic</H2>
      <P>
        Claude Opus, Sonnet, and Haiku are all supported, with extended-thinking available
        per-request on any of them. Anthropic&apos;s JSON-mode handling is slightly
        different from OpenAI&apos;s — MAP wraps the prompt in an explicit schema
        description rather than relying on a response-format flag.
      </P>
      <ModelTable rows={ANTHROPIC_MODELS} />
      <CodeBlock language="env">{`ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6`}</CodeBlock>
      <P>
        Get your key at <InlineCode>console.anthropic.com</InlineCode>. When extended
        thinking is enabled, a budget-tokens slider controls how many tokens the model may
        spend on its reasoning pass before emitting a final answer.
      </P>

      <H2 id="custom">Custom endpoint</H2>
      <P>
        Any OpenAI-compatible API can be added as a custom endpoint. The settings dialog
        ships three presets:
      </P>
      <ul className="list-disc pl-6 space-y-1 text-[15px] leading-7 text-foreground/85 mb-5 marker:text-muted-foreground/60">
        <li><Strong>Azure AI Foundry</Strong> — paste the deployment URL from your Foundry model. MAP talks to it using the same OpenAI request shape Foundry exposes.</li>
        <li><Strong>Ollama</Strong> — local model runtime at <InlineCode>http://localhost:11434/v1</InlineCode>. Use any model you have pulled locally.</li>
        <li><Strong>LM Studio</Strong> — local model runtime at <InlineCode>http://localhost:1234/v1</InlineCode>.</li>
      </ul>
      <CodeBlock language="env">{`CUSTOM_API_URL=https://YOUR-RESOURCE.services.ai.azure.com/models
CUSTOM_API_KEY=your_deployment_key
CUSTOM_MODEL=gpt-5.4`}</CodeBlock>
      <Callout type="warning">
        Not every custom-endpoint model reliably emits structured JSON. If generation fails
        with <InlineCode>Failed to parse response</InlineCode>, swap to a known-good model
        or add a JSON-mode shim at your gateway.
      </Callout>

      <H2 id="switching">Switching providers</H2>
      <P>
        The active provider is chosen per-agent in the settings panel. Switching providers
        does <Strong>not</Strong> regenerate the graph — existing graphs remain unchanged;
        the new provider is only used on the next generation or re-sync. If you want to
        compare outputs across providers, save a version first, then regenerate.
      </P>
      <P>
        Because the prompt itself doesn&apos;t change between providers (see{' '}
        <Strong>Prompt portability</Strong> above), the comparison is apples-to-apples —
        any difference in the output reflects the model, not the instrumentation.
      </P>

      <RelatedLinks
        slugs={[
          'guides/add-an-api-provider',
          'guides/rotate-revoke-keys',
          'guides/debug-failed-generation',
        ]}
      />
    </>
  )
}
