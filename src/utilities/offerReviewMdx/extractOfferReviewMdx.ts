import type { OfferReviewGenContext } from '@/utilities/offerReviewMdx/buildOfferReviewContext'

function sanitizeMdxBoundText(input: string): string {
  let s = String(input ?? '')
  const rx = [/<\s*bos\s*>/gi, /<\s*\/\s*bos\s*>/gi, /<\s*eos\s*>/gi, /<\s*\/\s*eos\s*>/gi]
  for (const p of rx) s = s.replace(p, '')
  const stringTokens = [
    '<|im_start|>',
    '<|im_end|>',
    '<|redacted_im_start|>',
    '<|im_end|>',
  ]
  for (const t of stringTokens) s = s.split(t).join('')
  return s.trim()
}

function stripToFirstYamlFence(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      return lines.slice(i).join('\n')
    }
  }
  return text.trim()
}

function foldYamlKeyContinuations(fmRaw: string): string {
  const lines = fmRaw.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*$/)
    if (m && i + 1 < lines.length) {
      const key = m[1]
      if (key === 'pros' || key === 'cons') {
        out.push(line)
        continue
      }
      const nextTrim = lines[i + 1].trim()
      if (!nextTrim || nextTrim === '---') {
        out.push(line)
        continue
      }
      if (nextTrim.startsWith('#')) {
        out.push(line)
        continue
      }
      if (/^\s*-\s/.test(lines[i + 1])) {
        out.push(line)
        continue
      }
      if (/^[A-Za-z_][A-Za-z0-9_]*:\s*/.test(nextTrim)) {
        out.push(line)
        continue
      }
      out.push(`${key}: ${nextTrim}`)
      i++
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}

function splitFrontmatter(mdx: string): { fmRaw: string; body: string } | null {
  let lines = mdx.replace(/\r\n/g, '\n').split('\n')
  if (!lines.length) return null
  const firstTrim = lines[0].trim()
  if (!/^---\s*$/.test(firstTrim)) return null

  let closeIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closeIdx = i
      break
    }
  }

  if (closeIdx === -1) {
    let insertAt = -1
    for (let i = 1; i < lines.length; i++) {
      if (/^\s*#\s+\S/.test(lines[i])) {
        insertAt = i
        break
      }
    }
    if (insertAt === -1) {
      for (let i = 1; i < lines.length; i++) {
        if (/^\s*##\s/.test(lines[i])) {
          insertAt = i
          break
        }
      }
    }
    if (insertAt !== -1) {
      lines = [...lines.slice(0, insertAt), '---', ...lines.slice(insertAt)]
      closeIdx = insertAt
    }
  }

  if (closeIdx === -1) return null

  const fmRaw = lines.slice(1, closeIdx).join('\n')
  const body = lines.slice(closeIdx + 1).join('\n')
  return { fmRaw, body }
}

function parseFrontmatterFields(fmRaw: string): Record<string, string | string[]> {
  const parsed: Record<string, string | string[]> = {}
  let currentList: string | null = null

  for (const line of fmRaw.split('\n')) {
    const keyMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/)
    if (keyMatch) {
      const key = keyMatch[1]
      const value = keyMatch[2] ?? ''

      if (key === 'pros' || key === 'cons') {
        parsed[key] = []
        currentList = key
        if (value.trim()) (parsed[key] as string[]).push(value.trim())
      } else {
        parsed[key] = value.trim()
        currentList = null
      }
      continue
    }

    const itemMatch = line.match(/^\s*-\s*(.*)$/)
    if (itemMatch && currentList && Array.isArray(parsed[currentList])) {
      ;(parsed[currentList] as string[]).push(itemMatch[1].trim())
      continue
    }

    currentList = null
  }

  return parsed
}

function escapeYamlSingle(value: unknown): string {
  const raw = String(value ?? '').trim()
  const unwrapped =
    (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
      ? raw.slice(1, -1)
      : raw
  return `'${unwrapped.replace(/\r?\n/g, ' ').replace(/'/g, "''").trim()}'`
}

function normalizeList(arr: unknown): string[] {
  return (Array.isArray(arr) ? arr : [])
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
}

export type ExtractedOfferReview = {
  safeMdx: string
  markdownBody: string
  meta: {
    title: string
    date: string
    description: string
    asin: string
    brand: string
    category: string
    rating: number
    image: string
    amazonUrl: string
  }
}

/**
 * Normalize LLM text into MDX + separate markdown body for Lexical conversion.
 */
export function extractOfferReviewFromLlm(
  llmText: string,
  base: OfferReviewGenContext,
): ExtractedOfferReview {
  let content = String(llmText ?? '').trim()

  content = content.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim()
  content = content.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '').trim()
  content = stripToFirstYamlFence(content)
  content = sanitizeMdxBoundText(content)

  if (!content.startsWith('---')) {
    throw new Error('MDX frontmatter missing')
  }

  const splitResult = splitFrontmatter(content)
  if (!splitResult) {
    throw new Error(`MDX frontmatter parse failed. Preview: ${String(content).slice(0, 400)}`)
  }

  const { fmRaw: fmRaw0, body: bodyRaw } = splitResult
  const fmRaw = foldYamlKeyContinuations(fmRaw0)
  const parsed = parseFrontmatterFields(fmRaw)

  const title = String(parsed.title || base.title || '')
  const date = String(parsed.date || base.date || new Date().toISOString().slice(0, 10))
  const description = String(parsed.description || '')
  const asin = String(parsed.asin || base.asin || '')
  const brand = String(parsed.brand || base.brand || '')
  const category = String(parsed.category || base.category || '')
  const image = String(parsed.image || base.imageUrl || '')
  const amazonUrl = String(parsed.amazonUrl || base.amazonUrl || '')

  let ratingNumber = Number.parseFloat(
    String(parsed.rating ?? base.rating ?? '').replace(/[^0-9.]+/g, ''),
  )
  if (!Number.isFinite(ratingNumber)) ratingNumber = 4.0
  ratingNumber = Math.max(0, Math.min(5, ratingNumber))

  let pros = normalizeList(parsed.pros)
  let cons = normalizeList(parsed.cons)

  if (!pros.length && Array.isArray(base.features)) {
    pros = base.features.slice(0, 5).map((f) => String(f))
  }
  if (!cons.length) {
    cons = ['Consider your use case and budget before buying.']
  }

  const frontmatterLines = [
    '---',
    `title: ${escapeYamlSingle(title)}`,
    `date: ${escapeYamlSingle(date)}`,
    `description: ${escapeYamlSingle(description)}`,
    `asin: ${escapeYamlSingle(asin)}`,
    `brand: ${escapeYamlSingle(brand)}`,
    `category: ${escapeYamlSingle(category)}`,
    `rating: ${Number(ratingNumber.toFixed(1))}`,
    `image: ${escapeYamlSingle(image)}`,
    `amazonUrl: ${escapeYamlSingle(amazonUrl)}`,
    'pros:',
    ...pros.map((p) => `  - ${escapeYamlSingle(p)}`),
    'cons:',
    ...cons.map((c) => `  - ${escapeYamlSingle(c)}`),
    '---',
  ].join('\n')

  const markdownBody = String(bodyRaw || '')
    .replace(/<[^>]{1,200}>/g, '')
    .trimStart()

  const safeMdx = `${frontmatterLines}\n\n${markdownBody}`

  return {
    safeMdx,
    markdownBody,
    meta: {
      title,
      date,
      description,
      asin,
      brand,
      category,
      rating: ratingNumber,
      image,
      amazonUrl,
    },
  }
}
