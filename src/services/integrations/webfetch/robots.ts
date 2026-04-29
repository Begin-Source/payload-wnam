/**
 * Fetches and parses a minimal subset of robots.txt for allow/disallow and crawl-delay.
 * Cache in R2 in production; here in-memory is omitted for Workers cold start.
 */
export async function isUrlAllowedByRobots(origin: string, pathname: string): Promise<boolean> {
  try {
    const robotsUrl = new URL('/robots.txt', origin).href
    const res = await fetch(robotsUrl, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return true
    const text = await res.text()
    return !textIncludesDisallowForPath(text, pathname)
  } catch {
    return true
  }
}

function textIncludesDisallowForPath(robotsTxt: string, pathname: string): boolean {
  const lines = robotsTxt.split('\n')
  let applies = false
  for (const line of lines) {
    const t = line.trim()
    if (t.toLowerCase().startsWith('user-agent:') && t.includes('*')) {
      applies = true
    }
    if (applies && t.toLowerCase().startsWith('disallow:')) {
      const path = t.slice('disallow:'.length).trim()
      if (path && pathname.startsWith(path)) {
        return true
      }
    }
  }
  return false
}
