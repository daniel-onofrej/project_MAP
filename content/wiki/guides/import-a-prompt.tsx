import {
  H2,
  P,
  UL,
  LI,
  Lead,
  Strong,
  InlineCode,
  KeyCombo,
  RelatedLinks,
} from '@/components/wiki/prose'
import { Callout, Steps, Step } from '@/components/wiki/prose-client'

export const toc = [
  { id: 'paste', label: 'Paste from clipboard', level: 2 as const },
  { id: 'upload', label: 'Upload a file', level: 2 as const },
  { id: 'json', label: 'Import an existing graph JSON', level: 2 as const },
  { id: 'tips', label: 'Tips for better imports', level: 2 as const },
]

export default function ImportAPrompt() {
  return (
    <>
      <Lead>
        Bringing an existing system prompt into MAP is the most common entry point for
        teams that already have prompts they trust. There are three ways to do it, each
        suited to a different source. All three end at the same place: a generated graph
        you can edit and re-sync.
      </Lead>

      <H2 id="paste">Paste from clipboard</H2>
      <P>
        This is the fastest path. Open any graph in the editor, click{' '}
        <Strong>+ Generate Graph</Strong>, and paste your prompt into the text area. Click{' '}
        <Strong>Generate</Strong> and MAP runs it through the{' '}
        <InlineCode>prompt-flow-graph</InlineCode> skill, returning a structured graph in
        about three to seven seconds depending on prompt length.
      </P>
      <P>
        The original prompt is preserved alongside the graph — you can always see it in the{' '}
        <Strong>Source</Strong> tab on the right, and every re-sync compares against it.
      </P>

      <H2 id="upload">Upload a file</H2>
      <P>
        For longer prompts — anything past a few hundred lines — uploading a file is
        friendlier than pasting. In the generator dialog, click the paperclip icon and
        select a <InlineCode>.txt</InlineCode>, <InlineCode>.md</InlineCode>, or{' '}
        <InlineCode>.prompt</InlineCode> file. MAP reads the file contents directly; it
        never uploads the file anywhere other than your running MAP instance.
      </P>

      <Callout type="note">
        File uploads are capped at 64 KB by default. Longer prompts usually indicate a
        multi-agent system — see{' '}
        <em>Multi-Agent Systems</em> under{' '}
        <InlineCode>reference/feature-matrix</InlineCode> for the preferred approach.
      </Callout>

      <H2 id="json">Import an existing graph JSON</H2>
      <P>
        If you&apos;re moving a graph between MAP instances, you probably want the JSON
        import path rather than the prompt-generation path. From the graph list, click{' '}
        <Strong>Import</Strong> and select a MAP-format JSON file. The import preserves
        node positions, version history, and the originating prompt.
      </P>
      <Steps>
        <Step n={1} title="Export from the source">
          <P>
            On the source instance, open the graph, go to the versions panel, select the
            version you want to move, and click <Strong>Export JSON</Strong>.
          </P>
        </Step>
        <Step n={2} title="Import on the destination">
          <P>
            On the destination instance, make sure you&apos;re in the workspace you want
            the graph to land in, then click <Strong>Import</Strong> from the graph list
            and select the file.
          </P>
        </Step>
        <Step n={3} title="Verify the similarity score">
          <P>
            Open the imported graph and click <Strong>Re-sync</Strong>. The score should
            match what you saw on the source instance. If it doesn&apos;t, the two
            instances are likely on different MAP versions — upgrade and retry.
          </P>
        </Step>
      </Steps>

      <H2 id="tips">Tips for better imports</H2>
      <UL>
        <LI>
          <Strong>Strip meta-commentary.</Strong> Remove any lines like &ldquo;this prompt
          is for…&rdquo; or version comments before generating. They don&apos;t harm the
          graph, but they produce stray <InlineCode>REFERENCE</InlineCode> nodes you&apos;ll
          want to delete.
        </LI>
        <LI>
          <Strong>Keep the structure.</Strong> Numbered lists and explicit &ldquo;if…
          then&rdquo; clauses generate cleaner graphs than dense paragraphs.
        </LI>
        <LI>
          <Strong>Be explicit about tools.</Strong> If your agent calls an API, name it in
          the prompt (<InlineCode>call the billing_api tool</InlineCode>). MAP will turn
          it into a typed <InlineCode>TOOL</InlineCode> node rather than a generic{' '}
          <InlineCode>ACTION</InlineCode>.
        </LI>
        <LI>
          <Strong>Regenerate if the first pass looks off.</Strong> Small prompt tweaks
          often produce very different graphs. It&apos;s cheaper to try twice than to edit
          a bad graph manually. Press <KeyCombo keys={['Ctrl', 'G']} /> to reopen the
          generator with your last prompt.
        </LI>
      </UL>

      <RelatedLinks
        slugs={[
          'learn/build-your-first-graph',
          'guides/convert-graph-to-prompt',
          'guides/debug-failed-generation',
        ]}
      />
    </>
  )
}
