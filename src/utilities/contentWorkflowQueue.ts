import { getCloudflareContext } from '@opennextjs/cloudflare'

import type { SiteContentRunnerInput } from '@/utilities/siteContentRunner'

export const CONTENT_WORKFLOW_QUEUE_BINDING = 'CONTENT_WORKFLOW_QUEUE'
export const CONTENT_WORKFLOW_MESSAGE_SITE_RUNNER = 'site_content_runner'

export type ContentWorkflowQueueMessage = {
  type: typeof CONTENT_WORKFLOW_MESSAGE_SITE_RUNNER
  siteId: number
  runnerJobId: string | number
  input: SiteContentRunnerInput
  attempt?: number
}

export type ContentWorkflowQueueEnv = {
  CONTENT_WORKFLOW_QUEUE?: Queue<ContentWorkflowQueueMessage>
}

export function getContentWorkflowQueueFromOpenNext(): Queue<ContentWorkflowQueueMessage> | null {
  try {
    const ctx = getCloudflareContext()
    const queue = (ctx.env as ContentWorkflowQueueEnv).CONTENT_WORKFLOW_QUEUE
    return queue && typeof queue.send === 'function' ? queue : null
  } catch {
    return null
  }
}

export async function enqueueContentWorkflowMessage(
  queue: Queue<ContentWorkflowQueueMessage>,
  message: ContentWorkflowQueueMessage,
  opts?: { delaySeconds?: number },
): Promise<void> {
  await queue.send(message, opts?.delaySeconds ? { delaySeconds: opts.delaySeconds } : undefined)
}

export function contentWorkflowOrigin(env: {
  PIPELINE_BASE_URL?: string
  PAYLOAD_PUBLIC_SERVER_URL?: string
}): string {
  const raw = env.PIPELINE_BASE_URL?.trim() || env.PAYLOAD_PUBLIC_SERVER_URL?.trim()
  return (raw || 'https://payload-wnam.sunnybuilds.workers.dev').replace(/\/$/, '')
}
