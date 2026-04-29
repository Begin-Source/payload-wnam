import type { AppLocale } from '@/i18n/config'

/**
 * Strip HTML, estimate read time. Chinese uses character rate; `en` uses word count.
 */
export function estimateReadingTimeMinutesFromHtml(html: string, locale: AppLocale): number {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return 1
  if (locale === 'zh') {
    const minutes = Math.ceil(text.length / 400)
    return Math.max(1, minutes)
  }
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
}
