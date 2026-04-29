import type { CollectionAfterChangeHook } from 'payload'

import type { Page } from '@/payload-types'
import { emptyLexicalDocument } from '@/utilities/emptyLexical'

function relationId(value: unknown): string | number | null {
  if (value == null) return null
  if (typeof value === 'number' || typeof value === 'string') return value
  if (typeof value === 'object' && 'id' in value) {
    const id = (value as { id: unknown }).id
    if (typeof id === 'number' || typeof id === 'string') return id
  }
  return null
}

const TRUST_PAGES: { slug: string; title: string }[] = [
  { slug: 'about', title: 'About Us' },
  { slug: 'editorial-policy', title: 'Editorial Policy' },
  { slug: 'affiliate-disclosure', title: 'Affiliate Disclosure' },
  { slug: 'contact', title: 'Contact' },
  { slug: 'privacy', title: 'Privacy Policy' },
  { slug: 'terms', title: 'Terms of Use' },
]

/**
 * EEAT 补丁 C：新建站点时实例化 6 张 Trust 页面（可被编辑，不可删站级合规底线）。
 */
export const siteTrustPagesInstantiate: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create') return
  try {
    const payload = req.payload
    const site = doc as {
      id: string | number
      tenant?: unknown
    }
    const siteId = site.id
    const siteNum = typeof siteId === 'number' ? siteId : Number(siteId)
    if (!Number.isFinite(siteNum)) return
    const tenantId = relationId(site.tenant)

    for (const p of TRUST_PAGES) {
      const exists = await payload.count({
        collection: 'pages',
        where: {
          and: [{ site: { equals: siteNum } }, { slug: { equals: p.slug } }, { locale: { equals: 'zh' } }],
        },
      })
      if (exists.totalDocs > 0) continue
      const tenantNum =
        tenantId == null ? undefined : typeof tenantId === 'number' ? tenantId : Number(tenantId)

      await payload.create({
        collection: 'pages',
        data: {
          title: p.title,
          slug: p.slug,
          locale: 'zh',
          site: siteNum,
          ...(tenantNum != null && Number.isFinite(tenantNum) ? { tenant: tenantNum } : {}),
          status: 'published',
          body: emptyLexicalDocument() as Page['body'],
        },
        req,
      })
    }
  } catch {
    // Non-blocking: site create must succeed even if pages fail (e.g. quota)
  }
}
