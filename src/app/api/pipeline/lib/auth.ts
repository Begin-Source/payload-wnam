import { createHmac, timingSafeEqual } from 'node:crypto'

const HEADER = 'x-internal-token'
const TS_HEADER = 'x-pipeline-timestamp'

/**
 * Verifies `x-internal-token` as either:
 * 1) exact `PAYLOAD_SECRET` (for trusted callers / crons)
 * 2) hex HMAC-SHA256 of `${method}:${path}:${ts}` with `PAYLOAD_SECRET` (optional hardening)
 */
export function verifyPipelineRequest(request: Request, pathname: string): { ok: boolean; error?: string } {
  const secret = process.env.PAYLOAD_SECRET?.trim()
  if (!secret) {
    return { ok: false, error: 'PAYLOAD_SECRET not configured' }
  }
  const q = new URL(request.url).searchParams.get('token')?.trim()
  const token = request.headers.get(HEADER)?.trim() || q
  if (!token) {
    return { ok: false, error: 'Missing x-internal-token' }
  }
  if (token === secret) {
    return { ok: true }
  }
  const ts = request.headers.get(TS_HEADER)?.trim()
  if (!ts) {
    return { ok: false, error: 'HMAC mode requires x-pipeline-timestamp' }
  }
  const method = request.method.toUpperCase()
  const payload = `${method}:${pathname}:${ts}`
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  try {
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(token, 'hex')
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, error: 'Invalid token' }
    }
  } catch {
    return { ok: false, error: 'Invalid token' }
  }
  return { ok: true }
}

export type PipelineJsonAuth = { ok: true } | { ok: false; response: Response }

export function isPipelineUnauthorized(g: PipelineJsonAuth): g is { ok: false; response: Response } {
  return 'response' in g
}

export function requirePipelineJson(request: Request, pathname: string): PipelineJsonAuth {
  const v = verifyPipelineRequest(request, pathname)
  if (!v.ok) {
    return {
      ok: false as const,
      response: Response.json({ error: v.error || 'Unauthorized' }, { status: 401 }),
    }
  }
  return { ok: true as const }
}
