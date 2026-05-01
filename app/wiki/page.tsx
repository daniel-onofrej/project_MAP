import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Clock, TrendingUp } from 'lucide-react'
import { getSessionUser } from '@/lib/auth/session'
import { WikiLayout } from '@/components/wiki/wiki-layout'
import { HeroBanner } from '@/components/wiki/mockups'
import {
  GROUP_META,
  WIKI_GROUPS,
  POPULAR_PAGES,
  RECENTLY_UPDATED,
  getPageMeta,
  type WikiGroup,
} from '@/lib/wiki/manifest'

export const metadata: Metadata = {
  title: 'Wiki — MAP Agent Architect',
  description:
    'Tutorials, how-to guides, reference material, and concept explanations for MAP — the visual AI agent graph editor.',
}

export const dynamic = 'force-dynamic'

export default async function WikiLandingPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return (
    <WikiLayout>
      <HeroBanner>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400 mb-3">
          MAP Wiki
        </p>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.1] mb-5 max-w-3xl">
          Learn to build, inspect, and share prompt graphs.
        </h1>
        <p className="text-base leading-7 text-muted-foreground max-w-[58ch] mb-8">
          Everything you need to go from a raw prompt to a production-ready agent graph —
          step-by-step tutorials, focused how-tos, exhaustive reference, and the conceptual
          model behind it all.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/wiki/learn/build-your-first-graph"
            className="inline-flex items-center gap-2 rounded-md px-5 py-2.5 bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Start the tutorial
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/wiki/concepts/prompt-graph-sync"
            className="inline-flex items-center gap-2 rounded-md px-5 py-2.5 border border-border/60 text-sm font-medium hover:bg-muted/40 transition-colors"
          >
            Read the concepts
          </Link>
        </div>
      </HeroBanner>

      <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(['learn', 'guides', 'reference', 'concepts'] as WikiGroup[]).map((g) => {
          const m = GROUP_META[g]
          const count = WIKI_GROUPS.find((x) => x.group === g)?.pages.length ?? 0
          return (
            <Link
              key={g}
              href={`#${g}`}
              className="group rounded-xl border border-border/40 bg-card/40 p-5 hover:border-border hover:bg-card/70 transition-all hover:-translate-y-0.5"
            >
              <div className="text-2xl mb-3">{m.icon}</div>
              <p className={`text-sm font-semibold mb-1 ${m.accent}`}>{m.label}</p>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">{m.tagline}</p>
              <p className="text-[11px] text-muted-foreground/70 font-mono">
                {count} {count === 1 ? 'page' : 'pages'}
              </p>
            </Link>
          )
        })}
      </section>

      {WIKI_GROUPS.map(({ group, pages }) => (
        <section key={group} id={group} className="mt-16 scroll-mt-24">
          <header className="mb-5 flex items-baseline justify-between gap-4">
            <div>
              <p
                className={`text-[10px] font-semibold uppercase tracking-[0.14em] mb-1 ${GROUP_META[group].accent}`}
              >
                {GROUP_META[group].icon} {GROUP_META[group].label}
              </p>
              <h2 className="text-2xl font-semibold tracking-tight">
                {GROUP_META[group].tagline}
              </h2>
            </div>
          </header>
          <div className="grid gap-3 sm:grid-cols-2">
            {pages.map((p) => (
              <Link
                key={p.slug}
                href={`/wiki/${p.slug}`}
                className="group rounded-lg border border-border/40 bg-card/40 p-4 hover:border-border hover:bg-card/80 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold mb-1 leading-snug">{p.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {p.summary}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section className="mt-16 grid gap-8 md:grid-cols-2">
        <PageList title="Popular" icon={<TrendingUp className="h-3.5 w-3.5" />} slugs={POPULAR_PAGES} />
        <PageList title="Recently updated" icon={<Clock className="h-3.5 w-3.5" />} slugs={RECENTLY_UPDATED} />
      </section>
    </WikiLayout>
  )
}

function PageList({
  title,
  icon,
  slugs,
}: {
  title: string
  icon: React.ReactNode
  slugs: string[]
}) {
  const pages = slugs.map(getPageMeta).filter((p): p is NonNullable<typeof p> => !!p)
  return (
    <div>
      <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
        {icon} {title}
      </p>
      <ul className="space-y-2">
        {pages.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/wiki/${p.slug}`}
              className="group flex items-start gap-2 text-sm hover:text-foreground text-muted-foreground transition-colors"
            >
              <span className="text-muted-foreground/50 mt-0.5">—</span>
              <span className="group-hover:text-foreground transition-colors">{p.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
