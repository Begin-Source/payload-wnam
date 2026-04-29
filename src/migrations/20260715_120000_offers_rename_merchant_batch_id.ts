import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type ColRow = { name: string }

/**
 * Align `batchId` field column name with Payload group prefix: `merchant_slot_batch_id`.
 * Former `merchantBatchId` produced `merchant_slot_merchant_batch_id` (double prefix) in SQL.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols = await db.all<ColRow>(sql`PRAGMA table_info('offers')`)
  const hasOld = cols.some((c) => c.name === 'merchant_batch_id')
  const hasNew = cols.some((c) => c.name === 'merchant_slot_batch_id')
  if (hasOld && !hasNew) {
    await db.run(
      sql.raw(
        'ALTER TABLE `offers` RENAME COLUMN `merchant_batch_id` TO `merchant_slot_batch_id`',
      ),
    )
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const cols = await db.all<ColRow>(sql`PRAGMA table_info('offers')`)
  const hasOld = cols.some((c) => c.name === 'merchant_batch_id')
  const hasNew = cols.some((c) => c.name === 'merchant_slot_batch_id')
  if (hasNew && !hasOld) {
    await db.run(
      sql.raw(
        'ALTER TABLE `offers` RENAME COLUMN `merchant_slot_batch_id` TO `merchant_batch_id`',
      ),
    )
  }
}
