import type { PayloadRequest, TaskConfig, TaskHandler } from 'payload'
import { deepCopyObjectSimple } from 'payload/shared'
import { CreateDocumentStepTask, DeleteDocumentStepTask, HttpRequestStepTask, ReadDocumentStepTask,
  SendEmailStepTask, UpdateDocumentStepTask } from '@xtr-dev/payload-automation/server'
import { requireLocalSiteId, requireSiteContext } from './context'
import { siteManage, siteRead, siteWrite } from './configAccess'

type TaskInputOutput = { input: Record<string, unknown>; output: Record<string, unknown> }
type TaskArgs = Parameters<TaskHandler<TaskInputOutput>>[0]
export type ExternalSiteTask = (task: 'http-request-step' | 'send-email', args: TaskArgs) => ReturnType<TaskHandler<TaskInputOutput>>
const contentTargets = new Set(['articles','pages','categories','redirects','keywords','content-briefs','serp-snapshots',
  'authors','offers','social-accounts','rankings','knowledge-base','original-evidence','site-blueprints'])
const methods = new Set(['create','update','delete','find','findByID'])

/** The plugin's generic Local API tasks default to overrideAccess=true. Restrict
 * their targets and force the same collection/field checks as staff CRUD. The
 * external task implementation is an explicit capability supplied by the task
 * runtime (vendor limits, budget and destination policy), never a raw fallback.
 */
export function siteWorkflowTasks(external: ExternalSiteTask): TaskConfig<TaskInputOutput>[] {
  if (typeof external !== 'function') throw new Error('Site external task capability required')
  return [CreateDocumentStepTask, ReadDocumentStepTask, UpdateDocumentStepTask, DeleteDocumentStepTask,
    HttpRequestStepTask, SendEmailStepTask].map(original => {
    const task = deepCopyObjectSimple(original) as unknown as TaskConfig<TaskInputOutput>
    const originalHandler = task.handler
    if (typeof originalHandler !== 'function') throw new Error('Expected inline workflow task handler')
    return { ...task, handler: async (args: TaskArgs) => {
      requireLocalSiteId()
      const context = requireSiteContext()
      const outside = task.slug === 'http-request-step' || task.slug === 'send-email'
      const access = outside ? siteManage : task.slug === 'read-document' ? siteRead : siteWrite
      if (!await access({ req: args.req })) throw new Error('Site workflow permission denied')
      requireSiteContext()
      if (outside) return external(task.slug as 'http-request-step' | 'send-email', args)
      const input = args.input as { collectionSlug?: unknown }
      if (!input || typeof input.collectionSlug !== 'string' || !contentTargets.has(input.collectionSlug)) {
        throw new Error('Site workflow target denied')
      }
      const req = Object.create(args.req) as PayloadRequest
      req.payload = new Proxy(args.req.payload, {
        get(target, property) {
          const value = Reflect.get(target, property, target)
          if (!methods.has(String(property))) return typeof value === 'function' ? value.bind(target) : value
          return (options: Record<string, unknown>) => {
            if (requireSiteContext().requestToken !== context.requestToken) throw new Error('Workflow request context changed')
            if (!contentTargets.has(String(options.collection))) throw new Error('Site workflow target denied')
            return Reflect.apply(value, target, [{ ...options, req, overrideAccess: false }])
          }
        },
      })
      return originalHandler({ ...args, req })
    } }
  })
}
