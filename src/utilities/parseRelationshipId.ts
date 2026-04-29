/**
 * Normalize Payload relationship form/API values to a numeric id (D1/SQLite may use string ids).
 */
export function parseRelationshipId(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return parseRelationshipId((value as { id: unknown }).id)
  }
  return null
}

export function hasRelationshipId(value: unknown): boolean {
  return parseRelationshipId(value) != null
}
