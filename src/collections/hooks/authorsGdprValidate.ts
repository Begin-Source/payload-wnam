import type { CollectionBeforeValidateHook } from 'payload'

const EU_LIKE = new Set(['eu', 'eea', 'uk'])

/**
 * EEAT 补丁 A：欧盟/英国作者需明示 GDPR 法律依据（entity-optimizer skill 约束）。
 */
export const authorsGdprValidate: CollectionBeforeValidateHook = ({ data }) => {
  const region = (data as { gdprRegion?: string | null }).gdprRegion
  const basis = (data as { gdprLawfulBasis?: string | null }).gdprLawfulBasis
  if (region && EU_LIKE.has(region) && (!basis || basis === 'not_applicable')) {
    throw new Error('作者 GDPR 区域为 EU/EEA/UK 时，请选择合法的 gdprLawfulBasis（不可为 N/A）。')
  }
  return data
}
