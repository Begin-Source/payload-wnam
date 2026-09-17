// This entrypoint is staged at the role application root by Cloudflare CI.
// @ts-ignore OpenNext produces this module after the Next build.
import nextWorker from './.open-next/worker.js'
import { centralFetch } from '../../src/application-roles/centralIngress'
import type { CentralEnvironment } from '../../src/application-roles/centralEnvironment'
export { SiteIdentityService } from '../../src/site-control/identityService'
export { SiteDataService } from '../../src/site-control/dataService'

export default {
  fetch(request: Request, env: CentralEnvironment, ctx: ExecutionContext) {
    return centralFetch(request,env,ctx,nextWorker.fetch.bind(nextWorker))
  },
}
