import { migrateSiteControl } from '../site-control/schema'
import { migrateCentralCosts } from '../site-control/costSchema'
import { centralCommissionGuardSchema } from '../site-control/commissionStatement'
import { migrateCentralMasters, migrateSiteMasters } from '../site-control/masterSchema'
import { migrateCentralConfigs, migrateSiteConfigs } from '../site-control/configSchema'
import { migrateCentralAssets, migrateSiteAssets } from '../site-control/assetSchema'
import { migrateSiteMasterCopies } from '../site-runtime/masterCopySchema'
import { provisionAdmissionSchema } from '../site-control/provisionAdmissionSchema'
import { provisionDispatchSchema } from '../site-control/provisionDispatchSchema'

/** Explicit operational initialization, never imported by request ingress.
 * Keep schema-only artifacts and migration-owned singleton/high-watermark data
 * in sync. These idempotent migrations preserve existing revision counters. */
export async function migrateCentralRoleState(database: D1Database): Promise<void> {
  await migrateSiteControl(database)
  await migrateCentralCosts(database)
  await migrateCentralMasters(database)
  await migrateCentralConfigs(database)
  await migrateCentralAssets(database)
  await database.batch(centralCommissionGuardSchema.map(sql => database.prepare(sql)))
  await database.batch(provisionAdmissionSchema.map(sql => database.prepare(sql)))
  await database.batch(provisionDispatchSchema.map(sql => database.prepare(sql)))
  await database.prepare(`INSERT OR IGNORE INTO site_provision_dispatches
    (request_id,input_digest,branch,state,queued_at,completed_at,build_outcome,last_error_code)
    SELECT q.request_id,q.input_digest,'ops/site-provision',
      CASE WHEN o.completed_at IS NOT NULL THEN 'succeeded' WHEN q.state='cancelled' THEN 'cancelled' ELSE 'queued' END,
      q.created_at,COALESCE(o.completed_at,q.cancelled_at),CASE WHEN o.completed_at IS NOT NULL THEN 'success' END,NULL
    FROM site_provision_requests q LEFT JOIN site_provision_operations o ON o.operation_id=q.request_id`).run()
}

export async function migrateSiteRoleState(database: D1Database): Promise<void> {
  await migrateSiteMasters(database)
  await migrateSiteMasterCopies(database)
  await migrateSiteConfigs(database)
  await migrateSiteAssets(database)
}
