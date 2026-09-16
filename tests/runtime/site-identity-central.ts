import { centralSiteEntry } from '../../src/site-control/centralSiteEntry'
import { payloadSessionAuthority } from '../../src/site-control/payloadSessionAuthority'
import { SiteLoginBroker } from '../../src/site-control/sso'
export { SiteIdentityService } from '../../src/site-control/identityService'

/** Cloud-only synthetic fixture, never deployed. The real central HTTP role will
 * use centralIdentityFromPayload; only this fixture supplies a synthetic login.
 */
export default {
  fetch(request: Request, env: { CENTRAL_D1: D1Database; FIXTURE_LOGIN_TOKEN: string }) {
    return centralSiteEntry(request, {
      broker: new SiteLoginBroker(env.CENTRAL_D1, payloadSessionAuthority(env.CENTRAL_D1)),
      authenticate: async request => request.headers.get('cookie') === `fixture-central=${env.FIXTURE_LOGIN_TOKEN}`
        ? { userId: '7', sessionId: 'fixture-original-session' } : null,
    })
  },
}
