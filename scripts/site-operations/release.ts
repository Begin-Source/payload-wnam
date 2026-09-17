import assert from 'node:assert/strict'
import { GroupReleaseJournal,groupReleaseId,type GroupReleaseReceipt } from '../../src/site-control/groupReleaseJournal'
import { provisionDigest } from '../../src/site-control/provisionPlan'

export type ReleaseSnapshot = Omit<GroupReleaseReceipt,'releaseId'> & { releaseId: string | null }
export type ReleaseDependencies = {
  journal: GroupReleaseJournal
  current: () => Promise<ReleaseSnapshot>
  preflight: () => Promise<void>
  deploy: (guard: () => Promise<void>,releaseId: string) => Promise<void>
  verify: (receipt: GroupReleaseReceipt) => Promise<void>
  acceptance: () => Promise<void>
  afterDeploy?: () => Promise<void>
}

/** An ordinary code release cannot run over a pending site provision. Its own
 * unknown upload is durable and must match the deployed release identity;
 * neither timeout nor a new CI run grants permission to upload it twice. */
export async function releaseGroup(workerGroup: string,commit: string,manifest: string,deps: ReleaseDependencies) {
  const manifestDigest = provisionDigest(manifest),releaseId = groupReleaseId(workerGroup,commit,manifestDigest)
  await deps.preflight()
  const lease = await deps.journal.claim(workerGroup)
  let failed = false,heartbeat = Promise.resolve()
  const guard = async () => { if (failed) throw new Error('Group release heartbeat failed'); await deps.journal.heartbeat(lease) }
  const timer = setInterval(() => { heartbeat = heartbeat.then(guard).catch(() => { failed = true }) },30000)
  timer.unref()
  try {
    const prior = await deps.journal.read(releaseId)
    const before = await deps.current()
    if (!prior) assert.notEqual(before.releaseId,releaseId,'Refusing an unrecorded group release')
    const row = await deps.journal.begin(lease,{ commit,manifest,expectedDeploymentId: before.deploymentId })
    if (!prior) {
      await guard(); assert.deepEqual(await deps.current(),before,'Group changed before upload')
      await deps.deploy(guard,releaseId); await deps.afterDeploy?.()
    }
    const actual = await deps.current()
    assert.ok(actual.releaseId === releaseId && actual.commit === commit && actual.manifestDigest === manifestDigest,'Group upload result unknown; no upload was replayed')
    const receipt: GroupReleaseReceipt = { ...actual,releaseId }
    if (row.receipt) assert.deepEqual(row.receipt,receipt,'Group deployment changed since receipt')
    await guard(); await deps.journal.uploaded(lease,receipt)
    await deps.verify(receipt)
    if (!row.completedAt) {
      await deps.acceptance(); await guard()
      assert.deepEqual(await deps.current(),actual,'Group changed during acceptance')
      await deps.verify(receipt)
      clearInterval(timer); await heartbeat; await guard()
      await deps.journal.finish(lease,releaseId)
    }
    return { releaseId,workerGroup,commit,uploaded: !prior,reused: Boolean(row.completedAt),receipt,completedAt: (await deps.journal.read(releaseId))!.completedAt }
  } finally { clearInterval(timer); await heartbeat; await deps.journal.release(lease) }
}
