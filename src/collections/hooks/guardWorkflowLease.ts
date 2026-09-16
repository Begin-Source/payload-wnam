import type { CollectionBeforeChangeHook } from 'payload'

/** Running task results are written atomically by the lease owner, not by ordinary updates. */
export const guardWorkflowLease: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (originalDoc?.leaseToken && Date.parse(originalDoc.leaseExpiresAt ?? '') > Date.now()) {
    const guarded = ['leaseToken', 'leaseExpiresAt', 'heartbeatAt', 'attemptCount', 'status', 'input', 'jobType', 'output', 'handoff', 'errorCode', 'errorMessage', 'startedAt', 'completedAt']
    if (guarded.some(key => Object.hasOwn(data, key) && JSON.stringify(data[key]) !== JSON.stringify(originalDoc[key]))) {
      throw new Error('任务正在执行，请等待当前任务结束后再修改或重试')
    }
  }
  return data
}
