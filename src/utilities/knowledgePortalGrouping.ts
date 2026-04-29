import type { KnowledgeBase, OperationManual } from '@/payload-types'

/** 侧栏序列化项（仅 id / 标题 / slug） */
export type PortalNavKbItem = { id: number; title: string; slug: string }
export type PortalNavManualItem = { id: number; title: string; slug: string }

export type PortalNavKbGroup = { key: string; label: string; items: PortalNavKbItem[] }
export type PortalNavManualGroup = { key: string; label: string; items: PortalNavManualItem[] }

const UNCATEGORIZED_KEY = '__uncategorized__'

/** 与 Admin 选项一致，便于员工扫目录 */
export const knowledgeEntryTypeLabels: Record<
  NonNullable<KnowledgeBase['entryType']>,
  string
> = {
  research: '研究',
  audit: '审计',
  monitoring: '监控',
  decision: '决策',
  open_loop: '开放循环',
  hot_cache: '热缓存',
}

const KB_TYPE_ORDER: NonNullable<KnowledgeBase['entryType']>[] = [
  'research',
  'audit',
  'monitoring',
  'decision',
  'open_loop',
  'hot_cache',
]

function levelLabel(level: NonNullable<OperationManual['level']>): string {
  if (level === 'intro') return '入门'
  if (level === 'advanced') return '进阶'
  if (level === 'standard') return '标准'
  return level
}

function toKbItem(doc: KnowledgeBase): PortalNavKbItem | null {
  if (typeof doc.slug !== 'string' || !doc.slug.trim()) return null
  return { id: doc.id, title: doc.title, slug: doc.slug.trim() }
}

function toManualItem(doc: OperationManual): PortalNavManualItem | null {
  if (typeof doc.slug !== 'string' || !doc.slug.trim()) return null
  return { id: doc.id, title: doc.title, slug: doc.slug.trim() }
}

/** 按 entryType 分组；无类型入「未分类」 */
export function groupKnowledgeByEntryType(docs: KnowledgeBase[]): PortalNavKbGroup[] {
  const buckets = new Map<string, PortalNavKbItem[]>()
  for (const doc of docs) {
    const item = toKbItem(doc)
    if (!item) continue
    const key = doc.entryType ?? UNCATEGORIZED_KEY
    const list = buckets.get(key) ?? []
    list.push(item)
    buckets.set(key, list)
  }

  const groups: PortalNavKbGroup[] = []

  for (const key of KB_TYPE_ORDER) {
    const items = buckets.get(key)
    if (items?.length) {
      groups.push({
        key,
        label: knowledgeEntryTypeLabels[key],
        items,
      })
    }
  }

  const uncategorized = buckets.get(UNCATEGORIZED_KEY)
  if (uncategorized?.length) {
    groups.push({
      key: UNCATEGORIZED_KEY,
      label: '未分类',
      items: uncategorized,
    })
  }

  return groups
}

const LEVEL_ORDER: NonNullable<OperationManual['level']>[] = ['intro', 'standard', 'advanced']

/** 按 level 分组，组内顺序与入参一致（列表已 sort） */
export function groupManualsByLevel(docs: OperationManual[]): PortalNavManualGroup[] {
  const buckets = new Map<string, PortalNavManualItem[]>()
  for (const doc of docs) {
    const item = toManualItem(doc)
    if (!item) continue
    const level = doc.level ?? 'standard'
    const list = buckets.get(level) ?? []
    list.push(item)
    buckets.set(level, list)
  }

  const groups: PortalNavManualGroup[] = []
  for (const key of LEVEL_ORDER) {
    const items = buckets.get(key)
    if (items?.length) {
      groups.push({ key, label: levelLabel(key), items })
    }
  }
  return groups
}
