import {
  H2,
  H3,
  P,
  UL,
  OL,
  LI,
  Lead,
  Strong,
  A,
  InlineCode,
  YouWillLearn,
  RelatedLinks,
} from '@/components/wiki/prose'
import { Callout } from '@/components/wiki/prose-client'
import { SyncDiagramMock } from '@/components/wiki/mockups'

export const toc = [
  { id: 'what-you-can-do', label: 'What you can do with MAP', level: 2 as const },
  { id: 'how-it-differs', label: 'How it differs from a text editor', level: 2 as const },
  { id: 'mental-model', label: 'The five-minute mental model', level: 2 as const },
  { id: 'where-to-go-next', label: 'Where to go next', level: 2 as const },
]

export default function Welcome() {
  return (
    <>
      <Lead>
        MAP is a visual editor for <Strong>prompt graphs</Strong> and a runtime control
        plane for OpenShell agent sandboxes. You describe what an agent should do, MAP
        converts it into a graph you can inspect, refactor, share, and pin, then you can
        deploy that exact prompt snapshot into a managed runtime with policy, tools,
        scripts, environment, logs, and chat controls.
      </Lead>

      <P>
        This page is a 60-second orientation. If you&apos;d rather start doing, jump straight to{' '}
        <A href="/wiki/learn/build-your-first-graph">Build Your First Graph</A> — you&apos;ll
        have a working agent in about five minutes.
      </P>

      <YouWillLearn
        items={[
          'What kinds of problems MAP is designed for',
          'Why a graph beats a text blob for prompt engineering',
          'How saved prompts become OpenShell agent runtimes',
          'The five-minute mental model that underpins every feature',
        ]}
      />

      <H2 id="what-you-can-do">What you can do with MAP</H2>
      <P>
        MAP is built around six core capabilities. Every other feature in the product is
        a specialization of one of these:
      </P>
      <UL>
        <LI>
          <Strong>Generate</Strong> — turn a natural-language description of an agent into a
          fully structured graph using Gemini, OpenAI, Anthropic, or any OpenAI-compatible
          endpoint.
        </LI>
        <LI>
          <Strong>Inspect</Strong> — visualize every rule, decision, tool call, and
          guardrail as a labelled node, making hidden behavior obvious at a glance.
        </LI>
        <LI>
          <Strong>Edit</Strong> — add, rewire, or delete nodes directly on the canvas, or
          chat with the editor in plain language (&ldquo;add a retry loop around the search
          tool&rdquo;).
        </LI>
        <LI>
          <Strong>Re-sync</Strong> — deterministically rebuild a prompt from any graph and
          see a similarity score against the original, so you can trust that the two
          representations haven&apos;t drifted apart.
        </LI>
        <LI>
          <Strong>Share</Strong> — version graphs like code, share them with a team, and
          expose them to external agents over the Model Context Protocol (MCP).
        </LI>
        <LI>
          <Strong>Deploy</Strong> — turn a saved prompt into a persistent OpenShell agent
          runtime with a pinned prompt snapshot, custom policy YAML, packaged tools,
          scripts, files, environment variables, logs, and chat/CLI controls.
        </LI>
      </UL>

      <H2 id="how-it-differs">How it differs from a text editor</H2>
      <P>
        Prompt engineering in a text editor is fast until it isn&apos;t. Once a prompt grows
        past a dozen rules, it becomes impossible to see — at a glance — which rules guard
        which actions, where branches diverge, and whether two clauses quietly contradict
        each other. The text is linear; the logic is not.
      </P>
      <P>
        MAP flips the representation. The <Strong>graph</Strong> is the source of truth
        for structure: which rule protects which tool call, which path a decision takes for
        each outcome, which steps happen in sequence versus in parallel. The{' '}
        <Strong>prompt</Strong> is the source of truth for wording. Because MAP can
        translate between the two at any time, you get the legibility of a diagram without
        giving up the expressive power of free-form text.
      </P>

      <Callout type="tip" title="Think of it like this">
        A prompt is to a graph what a markdown document is to a rendered DOM tree. You edit
        whichever one is easier for the task at hand, and the other stays consistent.
      </Callout>

      <H2 id="mental-model">The five-minute mental model</H2>
      <P>
        There are only three concepts you need to hold in your head to be productive with
        MAP.
      </P>

      <H3 id="nodes-and-edges">Nodes and edges</H3>
      <P>
        Each <Strong>node</Strong> represents one unit of agent behavior — a rule, a
        decision, a tool call, a persona, a guard, and so on. Nodes have a{' '}
        <Strong>type</Strong> (22 types in total) that determines their color and icon, and
        a label that explains what that specific instance does. <Strong>Edges</Strong>{' '}
        express how nodes relate — the order of execution, which rule applies to which
        action, how a decision branches.
      </P>

      <H3 id="bidirectional-sync">Bidirectional sync</H3>
      <P>
        Every graph in MAP can be converted back into a system prompt, and every prompt
        can be regenerated into a graph. The conversion is stable: editing the graph then
        re-syncing produces an updated prompt; editing the prompt then regenerating produces
        an updated graph. A similarity score (0–100%) tells you how closely the two
        representations still match.
      </P>

      <SyncDiagramMock />

      <H3 id="risk-categories">Risk categories</H3>
      <P>
        MAP classifies every action node into one of eight risk categories — financial,
        system, communication, data, and so on — and flags whether a <NodeInline>GUARD</NodeInline> node appears
        upstream of it. This is how you find and audit the dangerous parts of an agent
        without reading the whole prompt.
      </P>

      <H2 id="where-to-go-next">Where to go next</H2>
      <P>Pick the entry point that matches how you learn:</P>
      <OL>
        <LI>
          <A href="/wiki/learn/build-your-first-graph">Build Your First Graph</A> — a
          hands-on five-minute tutorial.
        </LI>
        <LI>
          <A href="/wiki/concepts/prompt-graph-sync">Prompt ↔ Graph Sync</A> — the concepts
          article for people who want the theory first.
        </LI>
        <LI>
          <A href="/wiki/reference/node-types">Node Types reference</A> — the full 22-node
          catalog with examples.
        </LI>
        <LI>
          <A href="/wiki/guides/deploy-openshell-runtime">Deploy an OpenShell Agent Runtime</A> — package
          a prompt, policy, tools, scripts, and environment into a sandbox.
        </LI>
      </OL>

      <RelatedLinks
        slugs={[
          'learn/build-your-first-graph',
          'guides/deploy-openshell-runtime',
          'concepts/prompt-graph-sync',
          'reference/node-types',
        ]}
      />
    </>
  )
}

function NodeInline({ children }: { children: React.ReactNode }) {
  return (
    <InlineCode>
      <span className="text-red-400">{children}</span>
    </InlineCode>
  )
}
