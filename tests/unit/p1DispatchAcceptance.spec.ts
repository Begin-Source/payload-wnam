import { describe,expect,it } from 'vitest'
import { p1DispatchAcceptance } from '../../scripts/ci-p1-dispatch-acceptance.mjs'

describe('P1 automatic dispatch acceptance',() => {
  it('pins one replay-safe synthetic browser request',() => {
    expect(p1DispatchAcceptance()).toEqual({ enabled: true,request: {
      requestId: '79d647a4-a4fb-4e8b-8403-8372c67e0452',siteId: 'p1-f',name: 'P1 Automatic F',
      tenantId: 1,ownerUserId: 7,timezone: 'Europe/Berlin',
    } })
  })
})
