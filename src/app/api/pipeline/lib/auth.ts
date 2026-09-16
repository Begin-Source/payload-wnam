import { createHmac } from 'node:crypto'
import { consumePipelineNonce, type PipelineNonceStore } from '@/utilities/pipelineNonceStore'
import {
  canonicalPipelineQuery, equalHexSignature, equalToken, hashPipelineRequestBody,
  pipelineV2Digest, signatureTimestampIsFresh, signatureTimestampMs,
  PIPELINE_SIGNATURE_MAX_AGE_MS, PIPELINE_SIGNATURE_FUTURE_SKEW_MS,
} from './pipelineSignature'

type Verification = { ok: boolean; error?: string; status?: number }

/** Plain tokens remain compatible. V1 expires; V2 also binds the body/query and consumes a nonce. */
export async function verifyPipelineRequest(
  request: Request,
  pathname: string,
  options: { now?: number; consumeNonce?: PipelineNonceStore } = {},
): Promise<Verification> {
  const secret = process.env.PAYLOAD_SECRET?.trim()
  if (!secret) return { ok: false, error: 'PAYLOAD_SECRET not configured', status: 503 }
  const url = new URL(request.url)
  const token = request.headers.get('x-internal-token')?.trim() || url.searchParams.get('token')?.trim()
  if (!token) return { ok: false, error: 'Missing x-internal-token' }
  if (equalToken(secret, token)) return { ok: true }
  const timestamp = request.headers.get('x-pipeline-timestamp')?.trim() ?? ''
  const time = signatureTimestampMs(timestamp)
  const now = options.now ?? Date.now()
  if (time === null || !signatureTimestampIsFresh(time, now)) return { ok: false, error: 'Expired or invalid signature timestamp' }
  const version = request.headers.get('x-pipeline-signature-version')?.trim() || '1'
  if (version === '1') {
    const expected = createHmac('sha256', secret).update(`${request.method.toUpperCase()}:${pathname}:${timestamp}`).digest('hex')
    return equalHexSignature(expected, token) ? { ok: true } : { ok: false, error: 'Invalid token' }
  }
  if (version !== '2') return { ok: false, error: 'Unsupported signature version' }
  const nonce = request.headers.get('x-pipeline-nonce')?.trim() ?? ''
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(nonce)) return { ok: false, error: 'Invalid signature nonce' }
  let bodyHash: string
  try { bodyHash = await hashPipelineRequestBody(request) }
  catch { return { ok: false, error: 'Invalid or oversized signed request body', status: 413 } }
  const expected = pipelineV2Digest({ secret, method: request.method, pathname, query: canonicalPipelineQuery(url), timestamp, nonce, bodyHash })
  if (!equalHexSignature(expected, token)) return { ok: false, error: 'Invalid token' }
  try {
    const nonceHash = createHmac('sha256', secret).update(`nonce:${nonce}`).digest('hex')
    const accepted = await (options.consumeNonce ?? consumePipelineNonce)(nonceHash, time + PIPELINE_SIGNATURE_MAX_AGE_MS + PIPELINE_SIGNATURE_FUTURE_SKEW_MS, now)
    return accepted ? { ok: true } : { ok: false, error: 'Signature already used' }
  } catch {
    return { ok: false, error: 'Signature verification temporarily unavailable', status: 503 }
  }
}

export type PipelineJsonAuth = { ok: true } | { ok: false; response: Response }
export function isPipelineUnauthorized(g: PipelineJsonAuth): g is { ok: false; response: Response } {
  return 'response' in g
}
export async function requirePipelineJson(request: Request, pathname: string): Promise<PipelineJsonAuth> {
  const v = await verifyPipelineRequest(request, pathname)
  if (!v.ok) return { ok: false, response: Response.json({ error: v.error || 'Unauthorized' }, { status: v.status ?? 401 }) }
  return { ok: true }
}
