export const CENTRAL_ORIGIN = 'https://hub.beginos.org'
export const SITE_LOGIN_PATH = '/auth/site-login'
export const SITE_LOGOUT_PATH = '/auth/site-logout'
export const CENTRAL_SITE_ENTRY_PATH = '/auth/enter-site'

export function privateResponse(body: BodyInit | null, status = 200, extra: HeadersInit = {}): Response {
  const headers = new Headers(extra)
  headers.set('cache-control', 'private, no-store')
  headers.set('referrer-policy', 'no-referrer')
  headers.set('x-content-type-options', 'nosniff')
  headers.set('x-frame-options', 'DENY')
  headers.set('content-security-policy', "default-src 'none'; frame-ancestors 'none'")
  return new Response(body, { status, headers })
}

/** Read a tiny single-field form without trusting Content-Length. No ticket in URLs. */
export async function readSessionForm(request: Request, field: string): Promise<string> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') throw new Error('Invalid form')
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Missing form')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > 512) { await reader.cancel(); throw new Error('Form too large') }
      chunks.push(result.value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  const form = new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  if (Array.from(form.keys()).length !== 1 || !form.has(field)) throw new Error('Unexpected form fields')
  const value = form.get(field)
  if (!value) throw new Error('Missing form value')
  return value
}
