import { describe, expect, it } from 'vitest'

import fs from 'node:fs'
import path from 'node:path'

/**
 * Plan 「auditor-gate」: 正式发布前应由运营对单篇调用 content-quality-auditor skill。
 * CI 仅能校验仓库内含该 skill 入口（文件存在 + 关键字），不可替代人工终审。
 */
describe('content-quality-auditor skill present (publish gate reminder)', () => {
  it('loads CORE-EEAT auditor skill markdown from workspace', () => {
    const p = path.join(
      process.cwd(),
      '.agents/skills/content-quality-auditor/SKILL.md',
    )
    expect(fs.existsSync(p)).toBe(true)
    const txt = fs.readFileSync(p, 'utf8')
    expect(txt).toMatch(/CORE-EEAT|EEAT/)
  })
})
