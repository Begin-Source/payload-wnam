/**
 * Server-side calls into other `/api/pipeline/*` routes (same auth header).
 * Set `PIPELINE_BASE_URL` when the app cannot reach itself via `request.url` origin (e.g. some worker contexts).
 */
export function pipelineOrigin(request: Request): string {
  const base = process.env.PIPELINE_BASE_URL?.trim()
  if (base) return base.replace(/\/$/, '')
  return new URL(request.url).origin
}

export async function forwardPipelinePost(
  request: Request,
  pathname: string,
  body: Record<string, unknown> = {},
): Promise<Response> {
  const token = request.headers.get('x-internal-token')?.trim()
  if (!token) {
    return Response.json({ error: 'Missing x-internal-token on cron-dispatch request' }, { status: 401 })
  }
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  const url = `${pipelineOrigin(request)}${path}`
  return fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-token': token,
    },
    body: JSON.stringify(body),
  })
}

export async function readJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return {
      parseError: true,
      status: res.status,
      contentType: res.headers.get('content-type') ?? '',
      bodyPreview: text.replace(/\s+/g, ' ').trim().slice(0, 800),
    }
  }
}
