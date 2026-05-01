'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Search, ChevronRight, Home, ArrowLeft } from 'lucide-react'
import { WIKI_GROUPS, GROUP_META, type WikiPageMeta } from '@/lib/wiki/manifest'

export function WikiSidebar() {
  const pathname = usePathname()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!q) return WIKI_GROUPS
    return WIKI_GROUPS.map((g) => ({
      group: g.group,
      pages: g.pages.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.summary.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q),
      ),
    })).filter((g) => g.pages.length > 0)
  }, [q])

  const activeSlug = pathname?.replace(/^\/wiki\/?/, '')

  return (
    <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen overflow-y-auto border-r border-border/40 bg-background/60 backdrop-blur-sm">
      <div className="px-4 pt-5 pb-3">
        <Link
          href="/"
          className="flex items-center gap-1.5 mb-3 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to app
        </Link>
        <Link
          href="/wiki"
          className="flex items-center gap-2 mb-4 text-sm font-semibold hover:text-cyan-400 transition-colors"
        >
          <Home className="h-3.5 w-3.5" />
          Wiki Home
        </Link>
        <label className="relative block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the wiki..."
            className="w-full pl-8 pr-3 py-2 rounded-md bg-muted/40 border border-border/40 text-[13px] placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-border transition"
            aria-label="Search the wiki"
          />
        </label>
      </div>

      <nav className="px-2 pb-10">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3 py-6">No pages match &ldquo;{query}&rdquo;</p>
        ) : (
          filtered.map(({ group, pages }) => (
            <Section
              key={group}
              label={GROUP_META[group].label}
              icon={GROUP_META[group].icon}
              accent={GROUP_META[group].accent}
              pages={pages}
              activeSlug={activeSlug}
            />
          ))
        )}
      </nav>
    </aside>
  )
}

function Section({
  label,
  icon,
  accent,
  pages,
  activeSlug,
}: {
  label: string
  icon: string
  accent: string
  pages: WikiPageMeta[]
  activeSlug?: string
}) {
  return (
    <div className="mb-5">
      <p
        className={`flex items-center gap-1.5 px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${accent}`}
      >
        <span aria-hidden>{icon}</span>
        {label}
      </p>
      <ul className="space-y-0.5">
        {pages.map((p) => {
          const active = activeSlug === p.slug
          return (
            <li key={p.slug}>
              <Link
                href={`/wiki/${p.slug}`}
                aria-current={active ? 'page' : undefined}
                className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                  active
                    ? 'bg-muted/60 text-foreground border-l-2 border-cyan-400 pl-[10px]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <ChevronRight
                  className={`h-3 w-3 shrink-0 ${
                    active ? 'text-cyan-400' : 'text-muted-foreground/60'
                  }`}
                />
                <span className="truncate">{p.title}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
