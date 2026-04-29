import type { CollectionBeforeChangeHook } from 'payload'

/** Slug for URL; keep ASCII-ish so D1 + 前台路由不易出问题。 */
function deriveSlugFromName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
  return base || `site-${Date.now()}`
}

/**
 * `sites` 表在 SQLite 上 `slug` / `primary_domain` / `status` 为 NOT NULL。
 * 管理端仅 `name` 必填时，在入库前补齐占位，避免 INSERT 失败。
 */
export const fillSitesOptionalDbFields: CollectionBeforeChangeHook = ({ data }) => {
  const d = data as Record<string, unknown>

  const nameStr = typeof d.name === 'string' ? d.name.trim() : ''

  const slugRaw = d.slug
  if (slugRaw == null || (typeof slugRaw === 'string' && !slugRaw.trim())) {
    d.slug = deriveSlugFromName(nameStr)
  }

  if (d.primaryDomain == null) {
    d.primaryDomain = ''
  } else if (typeof d.primaryDomain === 'string') {
    d.primaryDomain = d.primaryDomain.trim()
  }

  if (d.status == null || d.status === '') {
    d.status = 'draft'
  }

  return data
}
