// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  execFileSync: vi.fn(), readFileSync: vi.fn(), existsSync: vi.fn(), writeFileSync: vi.fn(),
}))
vi.mock('node:child_process', () => ({ execFileSync: fake.execFileSync }))
vi.mock('node:fs', () => ({
  readFileSync: fake.readFileSync, existsSync: fake.existsSync, writeFileSync: fake.writeFileSync,
}))

describe('Cloudflare release gate', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    fake.execFileSync.mockReturnValue('current-commit\n')
    fake.existsSync.mockReturnValue(true)
  })

  it('stops before database migration when the build belongs to another commit', async () => {
    fake.readFileSync.mockReturnValue(JSON.stringify({ commit: 'old-commit' }))
    await expect(import('../../scripts/ci-deploy.mjs')).rejects.toThrow('No successful Cloudflare build')
    expect(fake.execFileSync).toHaveBeenCalledTimes(1)
    expect(fake.execFileSync.mock.calls[0][0]).toBe('git')
  })

  it('stops before database migration when the packaged Worker is missing', async () => {
    fake.readFileSync.mockReturnValue(JSON.stringify({ commit: 'current-commit' }))
    fake.existsSync.mockReturnValue(false)
    await expect(import('../../scripts/ci-deploy.mjs')).rejects.toThrow('No successful Cloudflare build')
    expect(fake.execFileSync).toHaveBeenCalledTimes(1)
  })
})
