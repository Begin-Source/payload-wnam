// Staged at the role application root by Cloudflare CI.
// @ts-ignore OpenNext produces this module after the Next build.
import nextWorker from './.open-next/worker.js'
import { siteFetch } from '../../src/application-roles/siteIngress'
import type { SiteEnvironment } from '../../src/application-roles/siteEnvironment'

export default {
  fetch(request: Request, env: SiteEnvironment, ctx: ExecutionContext) {
    return siteFetch(request, env, ctx, nextWorker.fetch.bind(nextWorker))
  },
}
