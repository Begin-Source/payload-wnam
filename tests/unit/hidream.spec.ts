import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  togetherImageGenerate,
  togetherImageGenerateBytes,
} from '@/services/integrations/together/hidream'

const ORIGINAL_FETCH = globalThis.fetch

function mockFetch(impl: typeof fetch): void {
  globalThis.fetch = vi.fn(impl) as unknown as typeof fetch
}

describe('Together hidream request bodies', () => {
  beforeEach(() => {
    delete process.env.TOGETHER_IMAGE_USE_SIZE
    delete process.env.TOGETHER_IMAGE_STEPS
    delete process.env.TOGETHER_BASE_URL
    process.env.TOGETHER_API_KEY = 'test-key'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = ORIGINAL_FETCH
    delete process.env.TOGETHER_IMAGE_USE_SIZE
    delete process.env.TOGETHER_IMAGE_STEPS
    delete process.env.TOGETHER_IMAGE_MODEL
    delete process.env.TOGETHER_API_KEY
  })

  it('togetherImageGenerateBytes uses response_format base64 and width/height (not size or b64_json)', async () => {
    mockFetch(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      expect(body.response_format).toBe('base64')
      expect(body.size).toBeUndefined()
      expect(body).toMatchObject({
        model: 'black-forest-labs/FLUX.1-schnell-Free',
        prompt: 'cat',
        n: 1,
        width: 1024,
        height: 1024,
      })
      expect(body.steps).toBeUndefined()
      expect(body.negative_prompt).toBeUndefined()

      expect(String(input)).toContain('/images/generations')
      expect(init?.method).toBe('POST')

      const onePx = Buffer.from(
        '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//Z',
        'base64',
      ).toString('base64')

      return new Response(
        JSON.stringify({
          data: [{ type: 'b64_json', b64_json: onePx, index: 0 }],
          model: 'x',
          id: '1',
          object: 'list',
        }),
        { status: 200 },
      )
    })

    const r = await togetherImageGenerateBytes('cat')
    expect(r.mimeType).toBe('image/jpeg')
    expect(r.buffer.byteLength).toBeGreaterThan(0)
  })

  it('togetherImageGenerateBytes sends negative_prompt when negativePrompt is provided', async () => {
    mockFetch(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      expect(body.negative_prompt).toBe('typography, subtitles')
      expect(body.response_format).toBe('base64')
      const onePx = Buffer.from(
        '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//Z',
        'base64',
      ).toString('base64')
      return new Response(
        JSON.stringify({
          data: [{ type: 'b64_json', b64_json: onePx, index: 0 }],
          model: 'x',
          id: '1',
          object: 'list',
        }),
        { status: 200 },
      )
    })

    await togetherImageGenerateBytes('cat', { negativePrompt: 'typography, subtitles' })
  })

  it('togetherImageGenerateBytes omits dimensions when TOGETHER_IMAGE_USE_SIZE=0', async () => {
    process.env.TOGETHER_IMAGE_USE_SIZE = '0'
    mockFetch(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      expect(body.width).toBeUndefined()
      expect(body.height).toBeUndefined()
      expect(body.response_format).toBe('base64')
      const onePx = Buffer.from(
        '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//Z',
        'base64',
      ).toString('base64')
      return new Response(
        JSON.stringify({
          data: [{ type: 'b64_json', b64_json: onePx, index: 0 }],
          model: 'x',
          id: '1',
          object: 'list',
        }),
        { status: 200 },
      )
    })

    await togetherImageGenerateBytes('x')
  })

  it('togetherImageGenerateBytes appends steps when TOGETHER_IMAGE_STEPS is a positive integer', async () => {
    process.env.TOGETHER_IMAGE_STEPS = '8'
    mockFetch(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      expect(body.steps).toBe(8)

      const onePx = Buffer.from(
        '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//Z',
        'base64',
      ).toString('base64')
      return new Response(
        JSON.stringify({
          data: [{ type: 'b64_json', b64_json: onePx, index: 0 }],
          model: 'x',
          id: '1',
          object: 'list',
        }),
        { status: 200 },
      )
    })

    await togetherImageGenerateBytes('x')
  })

  it('togetherImageGenerate sends width/height not size string', async () => {
    mockFetch(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      expect(body.width).toBe(1024)
      expect(body.height).toBe(1024)
      expect(body.size).toBeUndefined()
      return new Response(
        JSON.stringify({
          data: [{ type: 'url', url: 'https://example.com/i.png', index: 0 }],
          model: 'x',
          id: '1',
          object: 'list',
        }),
        { status: 200 },
      )
    })

    const r = await togetherImageGenerate('sunset')
    expect(r.url).toBe('https://example.com/i.png')
    expect(r.raw).toEqual(
      expect.objectContaining({
        data: [{ type: 'url', url: 'https://example.com/i.png', index: 0 }],
      }),
    )
  })

  it('togetherImageGenerate sends negative_prompt when negativePrompt is provided', async () => {
    mockFetch(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      expect(body.negative_prompt).toBe('blur, watermark')
      return new Response(
        JSON.stringify({
          data: [{ type: 'url', url: 'https://example.com/i.png', index: 0 }],
          model: 'x',
          id: '1',
          object: 'list',
        }),
        { status: 200 },
      )
    })

    await togetherImageGenerate('sunset', { negativePrompt: 'blur, watermark' })
  })

  it('togetherImageGenerate omits dimensions when TOGETHER_IMAGE_USE_SIZE=0', async () => {
    process.env.TOGETHER_IMAGE_USE_SIZE = '0'
    mockFetch(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      expect(body.width).toBeUndefined()
      expect(body.height).toBeUndefined()

      return new Response(
        JSON.stringify({
          data: [{ type: 'url', url: 'https://example.com/i.png', index: 0 }],
          model: 'x',
          id: '1',
          object: 'list',
        }),
        { status: 200 },
      )
    })

    await togetherImageGenerate('x')
  })

  it('togetherImageGenerateBytes sends init width/height even when TOGETHER_IMAGE_USE_SIZE=0', async () => {
    process.env.TOGETHER_IMAGE_USE_SIZE = '0'
    mockFetch(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      expect(body.width).toBe(1536)
      expect(body.height).toBe(640)
      expect(body.response_format).toBe('base64')
      const onePx = Buffer.from(
        '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//Z',
        'base64',
      ).toString('base64')
      return new Response(
        JSON.stringify({
          data: [{ type: 'b64_json', b64_json: onePx, index: 0 }],
          model: 'x',
          id: '1',
          object: 'list',
        }),
        { status: 200 },
      )
    })

    await togetherImageGenerateBytes('hero', { width: 1536, height: 640 })
  })
})
