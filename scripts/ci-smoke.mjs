/** Read-only release smoke. Never calls a mutation or executes a paid workflow. */
const cases = [
  ['https://s2.beginos.org/en', 200, /<h1[\s>]/],
  ['https://s2.beginos.org/en/products', 200, /<main[\s>]/],
  ['https://s2.beginos.org/en/reviews', 200, /<main[\s>]/],
  ['https://s2.beginos.org/sitemap.xml', 200, /<(?:urlset|sitemapindex)[\s>]/],
  ['https://s1.beginos.org/en', 200, /<h1[\s>]/],
  ['https://hub.beginos.org/admin/login', 200, /<title>Login/],
  ['https://payload-wnam.sunnybuilds.workers.dev/api/pipeline/tick', 401, /error/],
  ['https://hub.beginos.org/api/site-blueprints/versions', 403, /errors/],
]
for (const [url, status, pattern] of cases) {
  let error
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
      const body = await response.text()
      if (response.status !== status || !pattern.test(body)) throw new Error(`Smoke failed: ${url} (${response.status})`)
      console.log(JSON.stringify({ event: 'release_smoke', url, status: response.status }))
      error = null
      break
    } catch (e) { error = e }
  }
  if (error) throw error
}
