import type { CollectionBeforeValidateHook } from 'payload'

const SECTION_TYPES = new Set([
  'intro',
  'topic_definition',
  'how_to',
  'comparison',
  'hands_on_test',
  'pros_cons',
  'faq',
  'conclusion',
  'custom',
])

/**
 * 写稿补丁 N / §14.5：`outline.sections[]` 结构与受控 `type`。
 */
export const contentBriefOutlineValidate: CollectionBeforeValidateHook = ({ data }) => {
  const outline = (data as { outline?: unknown }).outline
  if (outline == null) return data
  if (typeof outline !== 'object' || outline === null) {
    throw new Error('outline 必须是 JSON 对象')
  }
  const o = outline as { sections?: unknown }
  /** Legacy briefs without `sections[]` stay valid until migrated. */
  if (!('sections' in o)) return data
  if (!Array.isArray(o.sections) || o.sections.length === 0) {
    throw new Error('outline.sections 必须为非空数组')
  }
  for (const [i, row] of o.sections.entries()) {
    if (!row || typeof row !== 'object') {
      throw new Error(`outline.sections[${i}] 必须为对象`)
    }
    const s = row as { id?: unknown; type?: unknown; wordBudget?: unknown }
    if (typeof s.id !== 'string' || !s.id.trim()) {
      throw new Error(`outline.sections[${i}].id 必填（字符串）`)
    }
    if (typeof s.type !== 'string' || !SECTION_TYPES.has(s.type)) {
      throw new Error(`outline.sections[${i}].type 非法或缺失，允许: ${[...SECTION_TYPES].join(', ')}`)
    }
    if (s.wordBudget != null && typeof s.wordBudget !== 'number') {
      throw new Error(`outline.sections[${i}].wordBudget 必须是数字`)
    }
  }
  return data
}
