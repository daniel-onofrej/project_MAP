import Link from 'next/link'
import type { ReactNode } from 'react'
import { WikiSidebar } from '@/components/wiki/wiki-sidebar'
import { WikiToc, type TocItem } from '@/components/wiki/wiki-toc'
import { getPageMeta, GROUP_META } from '@/lib/wiki/manifest'

export function WikiLayout({
  slug,
  toc = [],
  children,
}: {
  slug?: string
  toc?: TocItem[]
  children: ReactNode
}) {
  const meta = slug ? getPageMeta(slug) : undefined
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex mx-auto max-w-[1400px]">
        <WikiSidebar />
        <main className="flex-1 min-w-0 px-6 sm:px-10 py-10">
          {meta && (
            <nav
              className="text-[12px] text-muted-foreground mb-6 flex items-center gap-1.5"
              aria-label="Breadcrumb"
            >
              <Link href="/wiki" className="hover:text-foreground transition-colors">
                Wiki
              </Link>
              <span aria-hidden>/</span>
              <span className={GROUP_META[meta.group].accent}>
                {GROUP_META[meta.group].label}
              </span>
              <span aria-hidden>/</span>
              <span className="text-foreground">{meta.title}</span>
            </nav>
          )}
          <div className="flex gap-10">
            <article className="flex-1 min-w-0 max-w-3xl">{children}</article>
            <WikiToc items={toc} />
          </div>
        </main>
      </div>
    </div>
  )
}
