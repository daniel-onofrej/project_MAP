import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import { WikiLayout } from '@/components/wiki/wiki-layout'
import { PageHeader, NextPrev, EditOnGitHub } from '@/components/wiki/prose'
import { loadWikiPage, getAllSlugs } from '@/lib/wiki/loader'
import { getAdjacentPages, getPageMeta } from '@/lib/wiki/manifest'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string[] }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const joined = slug.join('/')
  const meta = getPageMeta(joined)
  if (!meta) return { title: 'Wiki — Verto' }
  return {
    title: `${meta.title} — Verto Wiki`,
    description: meta.summary,
  }
}

export function generateStaticParams() {
  return getAllSlugs().map((s) => ({ slug: s.split('/') }))
}

export default async function WikiArticlePage({ params }: Props) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const { slug } = await params
  const joined = slug.join('/')
  const { meta, Component, toc } = await loadWikiPage(joined)
  const { prev, next } = getAdjacentPages(joined)

  return (
    <WikiLayout slug={joined} toc={toc}>
      <PageHeader
        eyebrow={meta.group}
        title={meta.title}
        lead={meta.summary}
        updated={meta.updated}
      />
      <Component />
      <NextPrev
        prev={prev ? { slug: prev.slug, title: prev.title } : undefined}
        next={next ? { slug: next.slug, title: next.title } : undefined}
      />
      <EditOnGitHub slug={meta.slug} />
    </WikiLayout>
  )
}
