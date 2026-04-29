/**
 * Plain-text fields per collection (shared with API + admin UI).
 * `media` / `operation-manuals` 无 `site`，按租户筛选；其余需选站点。
 */
export const FIND_REPLACE_COLLECTION_FIELDS = {
  articles: ['title', 'slug', 'excerpt'],
  pages: ['title', 'slug', 'excerpt'],
  'knowledge-base': ['title', 'slug', 'notes'],
  keywords: ['term', 'slug', 'notes'],
  media: ['alt'],
  'operation-manuals': ['title', 'slug', 'summary', 'searchKeywords'],
} as const

export type FindReplaceCollectionSlug = keyof typeof FIND_REPLACE_COLLECTION_FIELDS

export function isFindReplaceCollectionSlug(s: string): s is FindReplaceCollectionSlug {
  return Object.prototype.hasOwnProperty.call(FIND_REPLACE_COLLECTION_FIELDS, s)
}

const NO_SITE_FOR_FIND_REPLACE: FindReplaceCollectionSlug[] = ['media', 'operation-manuals']

/** 无 `site` 的集合按租户筛选；其余需选站点。 */
export function findReplaceRequiresSite(slug: FindReplaceCollectionSlug): boolean {
  return !NO_SITE_FOR_FIND_REPLACE.includes(slug)
}

export const FIND_REPLACE_FIELD_LABELS: Record<
  string,
  Record<string, string>
> = {
  articles: {
    title: '标题',
    slug: 'URL 别名',
    excerpt: '摘要',
  },
  pages: {
    title: '标题',
    slug: 'URL 别名',
    excerpt: '摘要',
  },
  'knowledge-base': {
    title: '标题',
    slug: 'URL 别名',
    notes: '备注',
  },
  keywords: {
    term: '关键词',
    slug: 'URL 别名',
    notes: '备注',
  },
  media: {
    alt: '替代文本',
  },
  'operation-manuals': {
    title: '标题',
    slug: 'URL 别名',
    summary: '摘要',
    searchKeywords: '搜索关键词',
  },
}
