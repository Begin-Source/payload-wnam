import { migrateSiteControl } from '../site-control/schema'
import { migrateCentralCosts } from '../site-control/costSchema'
import { centralCommissionGuardSchema } from '../site-control/commissionStatement'
import { migrateCentralMasters, migrateSiteMasters } from '../site-control/masterSchema'
import { migrateCentralConfigs, migrateSiteConfigs } from '../site-control/configSchema'
import { migrateCentralAssets, migrateSiteAssets } from '../site-control/assetSchema'
import { migrateSiteMasterCopies } from '../site-runtime/masterCopySchema'
import { provisionAdmissionSchema } from '../site-control/provisionAdmissionSchema'

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
}

export async function migrateSiteRoleState(database: D1Database): Promise<void> {
  await migrateSiteMasters(database)
  await migrateSiteMasterCopies(database)
  await migrateSiteConfigs(database)
  await migrateSiteAssets(database)
}
