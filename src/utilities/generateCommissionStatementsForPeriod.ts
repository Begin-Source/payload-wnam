import type { Payload } from 'payload'

function relId(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'object' && v !== null && 'id' in v) {
    const n = Number((v as { id: unknown }).id)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function tenantIdFromDoc(doc: unknown): number | null {
  if (!doc || typeof doc !== 'object') return null
  const t = (doc as { tenant?: unknown }).tenant
  if (typeof t === 'number' && Number.isFinite(t)) return t
  if (t && typeof t === 'object' && 'id' in t) {
    const n = Number((t as { id: unknown }).id)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * For each employee with `affiliate-earnings-rows` in the period, upserts draft
 * `commission-statements` rows: employee, optional leader_cut, optional ops_cut.
 */
export async function generateCommissionStatementsForPeriod(
  payload: Payload,
  opts: { periodStart: string; periodEnd: string },
): Promise<{ created: number; skipped: number }> {
  const { periodStart, periodEnd } = opts
  const rows = await payload.find({
    collection: 'affiliate-earnings-rows',
    where: {
      and: [{ periodStart: { equals: periodStart } }, { periodEnd: { equals: periodEnd } }],
    },
    limit: 2000,
    depth: 0,
    overrideAccess: true,
  })

  const employeeIds = new Set<number>()
  const tenantByEmployee = new Map<number, number>()
  for (const d of rows.docs) {
    const rid = relId((d as { recipient?: unknown }).recipient)
    if (rid == null) continue
    employeeIds.add(rid)
    const tid = tenantIdFromDoc(d)
    if (tid != null && !tenantByEmployee.has(rid)) tenantByEmployee.set(rid, tid)
  }

  let created = 0
  let skipped = 0

  for (const empId of employeeIds) {
    let user: { id: number; teamLead?: unknown; opsManager?: unknown } | null = null
    try {
      user = (await payload.findByID({
        collection: 'users',
        id: empId,
        depth: 0,
        overrideAccess: true,
      })) as { id: number; teamLead?: unknown; opsManager?: unknown }
    } catch {
      continue
    }
    if (!user) continue

    const tenantId = tenantByEmployee.get(empId) ?? undefined

    const specs: Array<{ kind: 'employee' | 'leader_cut' | 'ops_cut'; recipient: number }> = [
      { kind: 'employee', recipient: empId },
    ]
    const leadId = relId(user.teamLead)
    if (leadId != null) specs.push({ kind: 'leader_cut', recipient: leadId })
    const opsId = relId(user.opsManager)
    if (opsId != null) specs.push({ kind: 'ops_cut', recipient: opsId })

    for (const spec of specs) {
      const existing = await payload.find({
        collection: 'commission-statements',
        where: {
          and: [
            { kind: { equals: spec.kind } },
            { recipient: { equals: spec.recipient } },
            { sourceEmployee: { equals: empId } },
            { periodStart: { equals: periodStart } },
            { periodEnd: { equals: periodEnd } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (existing.docs.length > 0) {
        skipped += 1
        continue
      }
      await payload.create({
        collection: 'commission-statements',
        data: {
          kind: spec.kind,
          recipient: spec.recipient,
          sourceEmployee: empId,
          periodStart,
          periodEnd,
          status: 'draft',
          ...(tenantId != null ? { tenant: tenantId } : {}),
        },
        overrideAccess: true,
      })
      created += 1
    }
  }

  return { created, skipped }
}
