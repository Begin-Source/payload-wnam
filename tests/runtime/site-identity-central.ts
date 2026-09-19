import { centralSiteEntry } from '../../src/site-control/centralSiteEntry'
import { payloadSessionAuthority } from '../../src/site-control/payloadSessionAuthority'
import { SiteLoginBroker } from '../../src/site-control/sso'
export { SiteIdentityService } from '../../src/site-control/identityService'
export { SiteDataService } from '../../src/site-control/dataService'

/** Cloud-only synthetic fixture, never deployed. The real central HTTP role will
 * use centralIdentityFromPayload; only this fixture supplies a synthetic login.
 */
export default {
  fetch(request: Request, env: { CENTRAL_D1: D1Database; FIXTURE_LOGIN_TOKEN: string }) {
    if (request.method === 'GET' && request.url === 'https://agenthub.beginos.org/') {
      return new Response('<!doctype html><html><body><form method="post" action="/auth/enter-site"><input name="siteId" value="a"><button type="submit">Open site</button></form></body></html>', {
        headers: { 'content-type': 'text/html', 'cache-control': 'no-store', 'referrer-policy': 'strict-origin',
          'content-security-policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'" },
      })
    }
    return centralSiteEntry(request, {
      broker: new SiteLoginBroker(env.CENTRAL_D1, payloadSessionAuthority(env.CENTRAL_D1)),
      authenticate: async request => request.headers.get('cookie') === `fixture-central=${env.FIXTURE_LOGIN_TOKEN}`
        ? { userId: '7', sessionId: 'fixture-original-session' } : null,
    })
  },
}
