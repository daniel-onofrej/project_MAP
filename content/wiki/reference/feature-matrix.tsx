import { H2, P, Lead, Strong, FeatureStatus, RelatedLinks } from '@/components/wiki/prose'
import { FEATURES, WIP_FEATURES } from '@/app/introduction/page'

export const toc = [
  { id: 'live', label: 'Shipped features', level: 2 as const },
  { id: 'wip', label: 'Work in progress', level: 2 as const },
  { id: 'reading', label: 'How to read this table', level: 2 as const },
]

type Row = { title: string; desc: string; status: 'live' | 'wip' }

const LIVE: Row[] = FEATURES.map((f) => ({ title: f.title, desc: f.desc, status: 'live' as const }))
const WIP: Row[] = WIP_FEATURES.map((f) => ({ title: f.title, desc: f.desc, status: 'wip' as const }))

function Table({ rows }: { rows: Row[] }) {
  return (
    <div className="rounded-lg border border-border/50 overflow-hidden my-5">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="border-b border-border/50 bg-muted/30">
            <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-56">Feature</th>
            <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
            <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-24">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3 font-medium align-top">{r.title}</td>
              <td className="px-4 py-3 text-foreground/80 align-top leading-6">{r.desc}</td>
              <td className="px-4 py-3 align-top"><FeatureStatus status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function FeatureMatrixReference() {
  return (
    <>
      <Lead>
        The complete inventory of what MAP does today, and what is being built next. Use
        this page to orient a new contributor, scope a pitch to your team, or confirm that
        a feature you read about elsewhere is actually shipped.
      </Lead>

      <H2 id="live">Shipped features</H2>
      <P>
        Everything here is wired end-to-end in the current release. <Strong>&ldquo;Live&rdquo;</Strong>{' '}
        means the feature works on a fresh install with no flags; some have optional
        configuration that enhances them.
      </P>
      <Table rows={LIVE} />

      <H2 id="wip">Work in progress</H2>
      <P>
        These are under active development. Some are usable behind flags; others are
        prototypes visible in the UI but partially wired. If a feature here is blocking
        your work, that is exactly the kind of signal the maintainers want — open an issue.
      </P>
      <Table rows={WIP} />

      <H2 id="reading">How to read this table</H2>
      <P>
        A <Strong>Live</Strong> entry is safe to rely on in your workflow. A <Strong>WIP</Strong>{' '}
        entry is safe to experiment with, but treat its contract as unstable — labels,
        shortcuts, and behaviors may shift between releases. Nothing marked WIP is required
        for the core build-a-graph loop; the core loop is all Live.
      </P>

      <RelatedLinks
        slugs={[
          'reference/node-types',
          'learn/welcome',
          'reference/ai-providers',
        ]}
      />
    </>
  )
}
