/**
 * M3: SEO 矩阵数据管道 — 统一集合 slug 与 JSON 字段名，避免多接口并行时 schema 漂移。
 * 落点：rank-track、serp 相关任务、Tavily 扩写；Admin 列见 `rankings` / `serp-snapshots`。
 */

export const SeoMatrixCollectionSlugs = {
  rankings: 'rankings',
  serpSnapshots: 'serp-snapshots',
  keywords: 'keywords',
  sites: 'sites',
} as const

/** Payload `rankings` / `serp-snapshots` 中存放外部 API 原始体量的字段。 */
export const SeoMatrixJsonFields = {
  serpTaskRaw: 'raw',
  rankingRawSerp: 'rawSerp',
} as const

/** DataForSEO organic live 在代码中的解析入口（与 `dataForSeoPost` 路径成对使用）。 */
export const DataForSeoMatrixEndpoints = {
  serpGoogleOrganicLive: '/v3/serp/google/organic/live/regular',
} as const

export type SeoMatrixJsonFieldKey = keyof typeof SeoMatrixJsonFields
