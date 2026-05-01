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
  KeyCombo,
  NodeBadge,
  YouWillLearn,
  RelatedLinks,
} from '@/components/wiki/prose'
import { Callout, Steps, Step, Screenshot } from '@/components/wiki/prose-client'

export const toc = [
  { id: 'adding', label: 'Adding nodes', level: 2 as const },
  { id: 'connecting', label: 'Connecting edges', level: 2 as const },
  { id: 'editing', label: 'Editing and re-typing', level: 2 as const },
  { id: 'deleting', label: 'Deleting safely', level: 2 as const },
  { id: 'conflicts', label: 'Resolving conflicts', level: 2 as const },
]

export default function EditingNodesAndEdges() {
  return (
    <>
      <Lead>
        Once a graph exists, most of your time will be spent refining it — adding a missing
        guard, rewiring a bad branch, deleting a dead action. This page covers every
        editing primitive MAP supports, how to undo mistakes, and how to read the visual
        cues MAP uses to flag structural problems.
      </Lead>

      <YouWillLearn
        items={[
          'Add a new node on the canvas (three different ways)',
          'Connect nodes by dragging edges between handles',
          'Rename, re-type, and delete nodes without breaking the graph',
          'Identify conflict indicators and resolve them',
        ]}
      />

      <H2 id="adding">Adding nodes</H2>
      <P>
        There are three ways to add a node, each suited to a different flow. Pick whichever
        one feels fastest for the task at hand; they all produce identical results.
      </P>

      <H3 id="right-click">Right-click on empty canvas</H3>
      <P>
        Right-click anywhere there isn&apos;t a node. A context menu opens with every node
        type grouped by category. Pick one, and a node of that type drops at your cursor.
        This is the fastest way when you already know exactly what you want to add.
      </P>

      <H3 id="command-k">Command-K search</H3>
      <P>
        Press <KeyCombo keys={['Ctrl', 'K']} /> (or <KeyCombo keys={['⌘', 'K']} />) to open
        the node search palette. Start typing a type name or a natural-language description
        — <InlineCode>guard</InlineCode>, or <InlineCode>something that checks</InlineCode>.
        Enter drops the node at the center of the viewport.
      </P>

      <H3 id="chat">The Graph Chat</H3>
      <P>
        Open the chat panel and say something like{' '}
        <InlineCode>add a logging step after the billing lookup</InlineCode>. The editor
        finds the right insertion point, creates the <NodeBadge type="LOGGING" /> node, and
        wires it in. This is the best option when you know <em>where</em> you want the new
        step but not exactly which type to pick.
      </P>

      <Callout type="tip">
        When you&apos;re exploring, drop a generic <NodeBadge type="STEP" /> first and
        re-type it later. Changing a node&apos;s type is a one-click operation.
      </Callout>

      <H2 id="connecting">Connecting edges</H2>
      <P>
        Every node has <Strong>connection handles</Strong> — small dots that appear on the
        node&apos;s edges when you hover it. To connect two nodes, drag from a handle on
        the source node to anywhere on the target node. MAP draws a curved edge as you
        drag and snaps into place when you release on a valid target.
      </P>
      <P>
        If you release on empty canvas, the edge is cancelled. If you release on an invalid
        target — for example, trying to create a self-loop on a non-loop-capable type —
        nothing happens and a brief error tooltip explains why.
      </P>

      <Screenshot
        alt="Dragging an edge from the bottom handle of a TASK node into the top of a DECISION node."
        caption="Drag from a handle; release on the target node."
      />

      <H3 id="edge-semantics">Edge semantics</H3>
      <P>
        Not every edge means the same thing. MAP uses color to distinguish:
      </P>
      <UL>
        <LI>
          <Strong>Indigo solid</Strong> — execution flow. What happens next.
        </LI>
        <LI>
          <Strong>Green dashed</Strong> — rule or guard attachment. Context, not flow.
        </LI>
        <LI>
          <Strong>Blue dashed</Strong> — persona or configuration reference.
        </LI>
        <LI>
          <Strong>Amber dashed</Strong> — tool or memory reference.
        </LI>
      </UL>
      <P>
        You don&apos;t need to pick a color manually — MAP chooses based on the source
        and target node types. If the color looks wrong, the usual cause is that one of the
        two nodes is the wrong <em>type</em>, not that the edge is wrong.
      </P>

      <H2 id="editing">Editing and re-typing</H2>
      <P>
        Double-click any node to open the inline editor. Two fields are always available:
        the <Strong>label</Strong> (the human-readable name) and the <Strong>type</Strong>{' '}
        (dropdown of all 22 types). Some types have an additional field — for example,{' '}
        <NodeBadge type="CONFIG" /> nodes have a free-form JSON value, and{' '}
        <NodeBadge type="CONDITION" /> nodes have a Boolean expression.
      </P>
      <P>
        Press <KeyCombo keys={['Esc']} /> to commit, or click outside the node. Press{' '}
        <KeyCombo keys={['Ctrl', 'Z']} /> to undo; every edit is tracked in the command
        history.
      </P>

      <Callout type="warning">
        Changing a node&apos;s type preserves its label and its edges, but <em>does not</em>{' '}
        validate that the edges still make semantic sense. If you turn a{' '}
        <NodeBadge type="RULE" /> into an <NodeBadge type="ACTION" />, any green-dashed rule
        edges are still attached — you&apos;ll want to rewire them as indigo flow edges.
      </Callout>

      <H2 id="deleting">Deleting safely</H2>
      <P>
        Select a node or edge and press <KeyCombo keys={['Delete']} /> or{' '}
        <KeyCombo keys={['Backspace']} />. Deleting a node also deletes every edge attached
        to it; the command is atomic, so one undo restores everything.
      </P>
      <P>
        If you&apos;re deleting a node that has multiple outgoing branches, MAP shows a
        confirmation asking whether you want the upstream edges to rewire to the first
        downstream node. Accepting this is the right choice in most cases — it keeps the
        graph connected. Declining it leaves the upstream nodes with no outgoing edges,
        which the conflict detector will immediately flag.
      </P>

      <H2 id="conflicts">Resolving conflicts</H2>
      <P>
        MAP runs a live conflict analyzer over every graph. Nodes with structural issues
        glow with a red pulse ring; the <Strong>Conflicts</Strong> panel on the right lists
        each issue with a suggested fix. Common conflicts and their fixes:
      </P>
      <UL>
        <LI>
          <Strong>Orphan node</Strong> — a node with no outgoing edges and no terminal
          type. Usually the fix is either to connect it or to convert it into an{' '}
          <NodeBadge type="END" />.
        </LI>
        <LI>
          <Strong>Missing escalation path</Strong> — a <NodeBadge type="DECISION" /> with no
          fallback branch. Add a default edge to a <NodeBadge type="HANDOFF" /> or
          fallback <NodeBadge type="END" />.
        </LI>
        <LI>
          <Strong>Unguarded risky action</Strong> — an <NodeBadge type="ACTION" /> in a
          risk category like <em>Financial</em> or <em>System</em> with no{' '}
          <NodeBadge type="GUARD" /> within three hops upstream. Either add a guard or
          explicitly dismiss the warning if the action is intentionally unguarded.
        </LI>
        <LI>
          <Strong>Cycle detected</Strong> — MAP graphs are DAGs. Cycles are either a
          genuine error or an intended retry loop; for loops, use an explicit{' '}
          <NodeBadge type="CONDITION" /> with a counter in <NodeBadge type="CONFIG" /> so
          the intent is visible.
        </LI>
      </UL>
      <P>
        Every conflict has a{' '}
        <Strong>one-click fix</Strong> where possible. When MAP can&apos;t auto-fix (for
        example, when it doesn&apos;t know which branch should be the fallback), it points
        you to the node and lets you fix it manually.
      </P>

      <RelatedLinks
        slugs={[
          'learn/versioning',
          'concepts/risk-categories',
          'reference/node-types',
        ]}
      />
    </>
  )
}
