import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

export const PIPELINE_SIGNATURE_MAX_AGE_MS = 5 * 60_000
export const PIPELINE_SIGNATURE_FUTURE_SKEW_MS = 30_000
export const MAX_SIGNED_BODY_BYTES = 2_000_000

export function signatureTimestampMs(value: string): number | null {
  if (!/^[1-9]\d{8,12}$/.test(value)) return null
  const number = Number(value)
  return number < 1_000_000_000_000 ? number * 1000 : number
}

export function signatureTimestampIsFresh(timestamp: number, now = Date.now()): boolean {
  return now - timestamp <= PIPELINE_SIGNATURE_MAX_AGE_MS && timestamp - now <= PIPELINE_SIGNATURE_FUTURE_SKEW_MS
}

export function equalToken(expected: string, actual: string): boolean {
  const a = Buffer.from(expected)
  const b = Buffer.from(actual)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function equalHexSignature(expected: string, actual: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(actual)) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'))
}

export function canonicalPipelineQuery(url: URL): string {
  const query = new URLSearchParams(url.search)
  query.delete('token')
  // Stable sort preserves the order of repeated values, which can affect query semantics.
  query.sort()
  return query.toString()
}

export function pipelineV2Digest(args: {
  secret: string; method: string; pathname: string; query: string;
  timestamp: string; nonce: string; bodyHash: string;
}): string {
  const message = ['v2', args.method.toUpperCase(), args.pathname, args.query, args.timestamp, args.nonce, args.bodyHash].join('\n')
  return createHmac('sha256', args.secret).update(message).digest('hex')
}

/** Hash a clone so JSON parsing by the route still receives the original body. */
export async function hashPipelineRequestBody(request: Request): Promise<string> {
  const hash = createHash('sha256')
  const reader = request.clone().body?.getReader()
  if (!reader) return hash.digest('hex')
  let bytes = 0
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      bytes += item.value.byteLength
      if (bytes > MAX_SIGNED_BODY_BYTES) {
        void reader.cancel().catch(() => {})
        throw new Error('Signed pipeline body exceeds 2 MB')
      }
      hash.update(item.value)
    }
  } finally { reader.releaseLock() }
  return hash.digest('hex')
}

/** Internal forwarding always signs the new URL and exact outgoing body. */
export function pipelineV2Headers(url: string, body: string, secret: string, now = Date.now()): Record<string, string> {
  const parsed = new URL(url)
  const timestamp = String(Math.floor(now / 1000))
  const nonce = randomUUID()
  return {
    'content-type': 'application/json',
    'x-pipeline-signature-version': '2',
    'x-pipeline-timestamp': timestamp,
    'x-pipeline-nonce': nonce,
    'x-internal-token': pipelineV2Digest({ secret, method: 'POST', pathname: parsed.pathname, query: canonicalPipelineQuery(parsed), timestamp, nonce, bodyHash: createHash('sha256').update(body).digest('hex') }),
  }
}
