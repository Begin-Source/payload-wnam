import { expect, test } from '@playwright/test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
// Consume the actual OpenNext build output inside Cloudflare; no app or production data needed.
function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? cssFiles(join(dir, entry.name)) : entry.name.endsWith('.css') ? [join(dir, entry.name)] : [])
}
const publicRoots = ['default-root', 'wide-root', 'affiliate-reviews-root', 'template1-root', 'template2-root', 'amz-template-1-root', 'amz-template-2-root']
// Admin/welcome CSS belongs to other route bundles and must not be injected into this fixture.
const css = cssFiles('.open-next/assets/_next/static').map(file => readFileSync(file, 'utf8')).filter(content => publicRoots.some(root => content.includes(root))).join('\n')
if (publicRoots.some(root => !css.includes(root))) throw new Error('A frontend template stylesheet is missing from the OpenNext assets')
for (const root of ['default', 'wide', 'affiliate-reviews', 'template1', 'template2', 'amz-template-1', 'amz-template-2']) {
  test(`${root} keeps its typography and theme boundaries`, async ({ page }) => {
    await page.route('**/*', route => route.abort())
    await page.setContent(`<html class="${root}-root"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><main style="padding:16px;max-width:100%"><h1 class="text-4xl">Kitchen buying guide</h1><p class="mt-0">Useful advice for choosing everyday kitchen products.</p><a href="#guide">Read the guide</a></main></body></html>`)
    const legacy = ['default', 'wide', 'affiliate-reviews'].includes(root)
    const values = await page.locator('h1').evaluate(el => ({ margin: getComputedStyle(el).marginTop, size: getComputedStyle(el).fontSize, width: document.documentElement.scrollWidth, viewport: innerWidth }))
    expect(values.viewport).toBe(page.viewportSize()?.width)
    expect(values.width).toBeLessThanOrEqual(values.viewport)
    expect(values.margin).toBe(legacy ? (test.info().project.name === 'mobile' ? '24px' : '40px') : '0px')
    if (!legacy) expect(parseFloat(values.size)).toBeCloseTo(36, 0)
    await page.getByRole('link').focus()
    await expect(page.getByRole('link')).toBeFocused()
    const token = await page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--primary').trim())
    const numbers = token.match(/(?:\d*\.)?\d+/g)?.map(Number)
    if (numbers && /^oklch\(\s*[\d.]+%/.test(token)) numbers[0] /= 100
    if (root === 'amz-template-1') expect(numbers).toEqual([0.35, 0.08, 155])
    if (root === 'amz-template-2') expect(numbers).toEqual([0.30, 0.02, 240])
    if (root === 'template2') expect(numbers).toEqual([0.42, 0.14, 255])
    if (legacy) expect(token).toBe('')
  })
}
