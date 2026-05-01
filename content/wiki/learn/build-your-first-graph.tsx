import {
  H2,
  P,
  Lead,
  UL,
  LI,
  Strong,
  A,
  InlineCode,
  KeyCombo,
  NodeBadge,
  YouWillLearn,
  CodeBlock,
  RelatedLinks,
} from '@/components/wiki/prose'
import { Callout, Steps, Step, Screenshot } from '@/components/wiki/prose-client'
import { GraphPreviewMock } from '@/components/wiki/mockups'

export const toc = [
  { id: 'overview', label: 'Before you start', level: 2 as const },
  { id: 'steps', label: 'The five-minute walkthrough', level: 2 as const },
  { id: 'what-just-happened', label: 'What just happened', level: 2 as const },
  { id: 'troubleshooting', label: 'Troubleshooting', level: 2 as const },
]

const SAMPLE_PROMPT = `You are a customer support agent for a SaaS company.
When a user contacts you:
1. Classify the intent as billing, technical, or general.
2. For billing questions, check the account status before responding.
3. Never issue a refund above $200 without human approval.
4. If the conversation becomes heated, hand off to a human.
5. Always log the resolution for later audit.`

const MOCK_NODES = [
  { id: 'start', type: 'START', label: 'User contacts agent', x: 370, y: 20 },
  { id: 'persona', type: 'PERSONA', label: 'Support agent', x: 80, y: 110 },
  { id: 'classify', type: 'TASK', label: 'Classify intent', x: 370, y: 110 },
  { id: 'decide', type: 'DECISION', label: 'Intent?', x: 370, y: 200 },
  { id: 'guard', type: 'GUARD', label: '< $200 or approved', x: 80, y: 290 },
  { id: 'refund', type: 'ACTION', label: 'Issue refund', x: 250, y: 290 },
  { id: 'handoff', type: 'HANDOFF', label: 'Human escalation', x: 490, y: 290 },
  { id: 'log', type: 'LOGGING', label: 'Log resolution', x: 680, y: 290 },
  { id: 'end', type: 'END', label: 'Done', x: 370, y: 380 },
]

const MOCK_EDGES = [
  { from: 'start', to: 'classify' },
  { from: 'classify', to: 'decide' },
  { from: 'decide', to: 'guard' },
  { from: 'guard', to: 'refund' },
  { from: 'decide', to: 'handoff' },
  { from: 'refund', to: 'log' },
  { from: 'handoff', to: 'log' },
  { from: 'log', to: 'end' },
]

export default function BuildYourFirstGraph() {
  return (
    <>
      <Lead>
        In the next five minutes you will paste a plain-language prompt into MAP, generate
        a graph from it, edit a node, re-sync the result back into a prompt, and save a
        version. By the end you will have done everything most users do every day, and
        you&apos;ll have a working agent to build on.
      </Lead>

      <YouWillLearn
        items={[
          'Generate a graph from a natural-language prompt with Gemini',
          'Inspect node types and edit a rule inline',
          'Re-sync the edited graph back to a prompt and read the similarity score',
          'Save a named version you can roll back to later',
        ]}
      />

      <H2 id="overview">Before you start</H2>
      <P>
        You need a working MAP installation — either{' '}
        <InlineCode>docker compose up</InlineCode> from the repo, or a self-hosted
        deployment — and a Gemini API key configured under{' '}
        <Strong>Settings → API Keys</Strong>. If you don&apos;t have one yet, see{' '}
        <A href="/wiki/guides/add-an-api-provider">Add an API Provider</A> first; it takes
        about two minutes. Any OpenAI-compatible endpoint will work too.
      </P>

      <Callout type="note">
        The screenshots and demos below use the default Gemini 3 Flash provider. Other
        providers produce slightly different graphs for the same prompt, but the flow is
        identical.
      </Callout>

      <H2 id="steps">The five-minute walkthrough</H2>

      <Steps>
        <Step n={1} title="Open the AI Generator">
          <P>
            From any graph in the editor, click the{' '}
            <Strong>&ldquo;+ Generate Graph&rdquo;</Strong> button in the top toolbar. A
            dialog slides in from the right with a single text area. If the toolbar is
            hidden, press <KeyCombo keys={['?']} /> for the shortcuts dialog — the generator
            is also bound to <KeyCombo keys={['Ctrl', 'G']} /> on most platforms.
          </P>
          <Screenshot
            alt="The AI Generator dialog with an empty prompt field and a Generate button."
            caption="The generator dialog. Paste, pick provider, click Generate."
          />
        </Step>

        <Step n={2} title="Paste a sample prompt">
          <P>
            Copy the block below and paste it into the prompt field. It describes a typical
            customer-support agent with exactly enough complexity to produce an interesting
            graph — a persona, a classification step, a branching decision, a guarded
            action, a human escalation path, and an audit log.
          </P>
          <CodeBlock language="prompt">{SAMPLE_PROMPT}</CodeBlock>
        </Step>

        <Step n={3} title="Generate the graph">
          <P>
            Click <Strong>Generate</Strong>. MAP sends your prompt to Gemini along with
            the <InlineCode>prompt-flow-graph</InlineCode> skill, which returns a structured
            JSON graph. You&apos;ll see nodes fade in one by one as they&apos;re laid out on
            the canvas.
          </P>
          <GraphPreviewMock nodes={MOCK_NODES} edges={MOCK_EDGES} />
          <P>
            For the sample prompt above, you should see roughly nine nodes including a{' '}
            <NodeBadge type="START" />, a <NodeBadge type="TASK" /> that classifies the
            intent, a <NodeBadge type="DECISION" /> that branches on it, a{' '}
            <NodeBadge type="GUARD" /> protecting the refund action, and a{' '}
            <NodeBadge type="LOGGING" /> node for the audit trail.
          </P>
        </Step>

        <Step n={4} title="Inspect the node types">
          <P>
            Hover any node — a tooltip appears with the node&apos;s type, label, and any
            comments attached to it. The colors are meaningful: greens are structural
            (<NodeBadge type="START" />, <NodeBadge type="RULE" />, <NodeBadge type="TRIGGER" />),
            reds are risky or terminal (<NodeBadge type="GUARD" />, <NodeBadge type="ACTION" />,{' '}
            <NodeBadge type="END" />), and blues are persona / state (<NodeBadge type="PERSONA" />,{' '}
            <NodeBadge type="MEMORY" />).
          </P>
          <P>
            The <Strong>Actions &amp; Permissions</Strong> panel in the right sidebar
            summarizes the risky parts: in this graph, the refund action is marked{' '}
            <span className="text-emerald-400 font-medium">Guarded</span> because a{' '}
            <NodeBadge type="GUARD" /> sits within three hops upstream.
          </P>
        </Step>

        <Step n={5} title="Edit a rule">
          <P>
            Double-click the <NodeBadge type="GUARD" /> node to open the inline editor.
            Change its label from <InlineCode>&lt; $200 or approved</InlineCode> to{' '}
            <InlineCode>&lt; $500 or approved by manager</InlineCode> and press{' '}
            <KeyCombo keys={['Esc']} /> to commit. The node updates in place; the graph stays
            otherwise unchanged.
          </P>
          <Callout type="tip">
            If you prefer to edit in bulk, open the <Strong>Graph Chat</Strong> panel on the
            right and type <InlineCode>raise the refund guard threshold to $500</InlineCode>
            — the editor will find the node, update it, and explain what it changed.
          </Callout>
        </Step>

        <Step n={6} title="Re-sync back to a prompt">
          <P>
            Click <Strong>Re-sync</Strong> in the toolbar. MAP runs the deterministic{' '}
            <InlineCode>graph-to-prompt</InlineCode> conversion and opens a side-by-side
            panel: the original prompt on the left, the reconstructed prompt on the right.
            A similarity score — a number between 0 and 100 — sits above the diff.
          </P>
          <P>
            For this walkthrough you should see a score in the low-to-mid 90s. Anything
            above 85 usually means the two representations are fully consistent; the gap is
            wording, not structure. A score below 70 is a signal to read the diff and decide
            which side you trust more.
          </P>
        </Step>

        <Step n={7} title="Save a version">
          <P>
            Press <KeyCombo keys={['Ctrl', 'S']} /> (or <KeyCombo keys={['⌘', 'S']} /> on
            macOS). Give the version a short name — something like{' '}
            <InlineCode>v1 — raised refund threshold</InlineCode>. A toast confirms the
            save, and the version appears in the <Strong>Versions</Strong> panel on the
            left.
          </P>
          <P>
            Every save creates a new snapshot; you never lose history. If the next change
            breaks something, click the old version in the panel and press{' '}
            <Strong>Restore</Strong>.
          </P>
        </Step>
      </Steps>

      <H2 id="what-just-happened">What just happened</H2>
      <P>
        Under the hood, MAP did four things: it sent your prompt to Gemini with a
        system-level skill describing exactly how to structure prompt graphs; it received
        back a normalized JSON representation that conforms to MAP&apos;s internal graph
        schema; it laid out the nodes using Dagre for readability; and it stored the graph
        along with the original prompt so the re-sync diff had something to compare against.
      </P>
      <P>
        The similarity score isn&apos;t Gemini-powered — it&apos;s a deterministic
        word-level comparison between your original prompt and the reconstructed one, the
        same kind of diff algorithm a code editor uses. That&apos;s intentional: you never
        want to trust an LLM to grade itself.
      </P>

      <H2 id="troubleshooting">Troubleshooting</H2>
      <UL>
        <LI>
          <Strong>The generator hangs.</Strong> Check that your Gemini API key is set and
          active. See <A href="/wiki/guides/debug-failed-generation">Debug a Failed Generation</A>.
        </LI>
        <LI>
          <Strong>The graph looks wrong.</Strong> Click <Strong>Regenerate</Strong> with a
          small wording change — prompts that are one clause away from ambiguous often
          produce very different graphs on a second try.
        </LI>
        <LI>
          <Strong>The similarity score is low.</Strong> Usually this means the LLM added
          structure the original prompt didn&apos;t have. Re-sync, read the reconstructed
          prompt, and decide whether that structure is correct — often it&apos;s an
          improvement worth keeping.
        </LI>
      </UL>

      <RelatedLinks
        slugs={[
          'learn/editing-nodes-and-edges',
          'learn/versioning',
          'guides/convert-graph-to-prompt',
        ]}
      />
    </>
  )
}
