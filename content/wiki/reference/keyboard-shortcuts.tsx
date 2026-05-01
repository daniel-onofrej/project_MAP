import { H2, P, Lead, Strong, KeyCombo, RelatedLinks } from '@/components/wiki/prose'

export const toc = [
  { id: 'global', label: 'Global', level: 2 as const },
  { id: 'canvas', label: 'Canvas', level: 2 as const },
  { id: 'selection', label: 'Selection and clipboard', level: 2 as const },
  { id: 'dialogs', label: 'Dialogs and panels', level: 2 as const },
]

type Row = { keys: string[]; desc: string }

const GLOBAL: Row[] = [
  { keys: ['Ctrl', 'S'], desc: 'Save the current graph as a new version' },
  { keys: ['Ctrl', 'Z'], desc: 'Undo' },
  { keys: ['Ctrl', 'Y'], desc: 'Redo' },
  { keys: ['Ctrl', 'K'], desc: 'Open node search' },
  { keys: ['Ctrl', 'G'], desc: 'Reopen the AI Generator with the last prompt' },
  { keys: ['?'], desc: 'Open the shortcuts dialog' },
]

const CANVAS: Row[] = [
  { keys: ['Space', 'drag'], desc: 'Pan the canvas' },
  { keys: ['Scroll'], desc: 'Zoom in and out' },
  { keys: ['F'], desc: 'Fit the graph to the viewport' },
  { keys: ['R'], desc: 'Reset zoom to 100%' },
  { keys: ['M'], desc: 'Toggle the minimap' },
]

const SELECTION: Row[] = [
  { keys: ['Click'], desc: 'Select a node or edge' },
  { keys: ['Shift', 'Click'], desc: 'Add to selection' },
  { keys: ['Ctrl', 'A'], desc: 'Select all nodes' },
  { keys: ['Ctrl', 'C'], desc: 'Copy selection' },
  { keys: ['Ctrl', 'V'], desc: 'Paste selection' },
  { keys: ['Ctrl', 'D'], desc: 'Duplicate selection in place' },
  { keys: ['Delete'], desc: 'Remove the selected node or edge' },
  { keys: ['Esc'], desc: 'Clear the selection / close an open panel' },
]

const DIALOGS: Row[] = [
  { keys: ['Enter'], desc: 'Submit a dialog (generate, save, confirm)' },
  { keys: ['Esc'], desc: 'Close a dialog without submitting' },
  { keys: ['Tab'], desc: 'Advance to the next form field' },
]

function Table({ rows }: { rows: Row[] }) {
  return (
    <div className="rounded-lg border border-border/50 overflow-hidden my-5">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="border-b border-border/50 bg-muted/30">
            <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-48">Shortcut</th>
            <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-muted/20 transition-colors">
              <td className="px-4 py-2.5 whitespace-nowrap">
                <KeyCombo keys={r.keys} />
              </td>
              <td className="px-4 py-2.5 text-foreground/85">{r.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function KeyboardShortcutsReference() {
  return (
    <>
      <Lead>
        Every shortcut MAP supports, grouped by where it applies. On macOS, substitute{' '}
        <KeyCombo keys={['⌘']} /> for <KeyCombo keys={['Ctrl']} /> throughout. Press{' '}
        <KeyCombo keys={['?']} /> inside the editor to open this reference as a floating
        dialog.
      </Lead>

      <H2 id="global">Global</H2>
      <P>
        These work anywhere in the editor, regardless of which panel has focus.
      </P>
      <Table rows={GLOBAL} />

      <H2 id="canvas">Canvas</H2>
      <P>Only active when the canvas (not a panel or dialog) has focus.</P>
      <Table rows={CANVAS} />

      <H2 id="selection">Selection and clipboard</H2>
      <P>
        Copy-paste carries the full node payload — type, label, and any config JSON —
        so pasting into a different graph produces an identical node.
      </P>
      <Table rows={SELECTION} />

      <H2 id="dialogs">Dialogs and panels</H2>
      <P>
        Every dialog respects <KeyCombo keys={['Enter']} /> for submit and{' '}
        <KeyCombo keys={['Esc']} /> for dismiss. <Strong>There are no confirmation
        dialogs on destructive actions that can&apos;t be undone</Strong> — MAP&apos;s
        model is: save early, rely on version history, don&apos;t double-prompt.
      </P>
      <Table rows={DIALOGS} />

      <RelatedLinks
        slugs={[
          'learn/editing-nodes-and-edges',
          'learn/versioning',
          'reference/feature-matrix',
        ]}
      />
    </>
  )
}
