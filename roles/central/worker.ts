// This entrypoint is staged at the role application root by Cloudflare CI.
// @ts-ignore OpenNext produces this module after the Next build.
import nextWorker from './.open-next/worker.js'
import { centralFetch } from '../../src/application-roles/centralIngress'
import { requireProvisionDispatchEnvironment,type CentralEnvironment } from '../../src/application-roles/centralEnvironment'
import { enqueueProvisionDispatch,provisionDispatchQueue,type ProvisionQueueMessage } from '../../src/site-control/provisionDispatch'
export { SiteIdentityService } from '../../src/site-control/identityService'
export { SiteDataService } from '../../src/site-control/dataService'
export { SiteRoutingService } from '../../src/site-control/routingService'

const worker: ExportedHandler<CentralEnvironment,ProvisionQueueMessage> = {
  fetch(request: Request, env: CentralEnvironment, ctx: ExecutionContext) {
    return centralFetch(request,env,ctx,nextWorker.fetch.bind(nextWorker))
  },
  queue(batch,env) {
    const dispatch = requireProvisionDispatchEnvironment(env)
    return provisionDispatchQueue(batch,dispatch)
  },
  scheduled(_controller,env,ctx) {
    const dispatch = requireProvisionDispatchEnvironment(env)
    ctx.waitUntil(enqueueProvisionDispatch(dispatch.CENTRAL_D1,dispatch.PROVISION_DISPATCH_QUEUE))
  },
}
export default worker
