/** Request header: when `1`, tick includes `bannerHints` in JSON (admin/diagnostic only). */
export const PIPELINE_BANNER_HINT_HEADER = 'x-pipeline-banner-hints'

const MAX_LINE = 180
const MAX_LINES_PER_TICK = 25

export function wantsPipelineBannerHints(request: Request): boolean {
  if (request.headers.get(PIPELINE_BANNER_HINT_HEADER) === '1') return true
  const v = process.env.PIPELINE_BANNER_HINTS?.trim().toLowerCase()
  return v === '1' || v === 'true'
}

export function pushPipelineBannerHint(acc: string[], line: string): void {
  if (acc.length >= MAX_LINES_PER_TICK) return
  const t = line.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE)
  if (t) acc.push(t)
}
