import { siteLifecycleSchemaObjects } from '../src/site-control/lifecycleSchema'
import { siteProvisionSchemaObjects } from '../src/site-control/provisionSchema'
import { groupReleaseSchemaObjects } from '../src/site-control/groupReleaseSchema'
import { applyP1Schema, roleSchemaDigest, type RoleSchema } from './p1-schema'

export const P1_CENTRAL_V1 = '32d9ac67f25b2dec5326ed868a1e98c5b06e0de87d5312c3b69d8591507604a3'
export const P1_CENTRAL_V2 = 'a0e7820413a25bad42da857f7a60d96fb7f2997f8bf8f71e997d73e4eae97641'
export const P1_CENTRAL_V3 = 'a97d4714d6af58802fc39203f4e1ae29609330e7c66b047bc6a336410de034db'

/** Upgrade only the previously reviewed complete schemas, never silently adopt
 * another schema. Fresh installs use v4; old versions pass through each additive
 * change with its own atomic receipt. Interrupted upgrades resume at their
 * actual persisted version. */
export async function applyP1CentralSchema(database: D1Database,schema: RoleSchema) {
  if (schema.role !== 'central') throw new Error('Central schema required')
  const groupObjects = new Set<string>(groupReleaseSchemaObjects)
  const v3: RoleSchema = { ...schema,objects: schema.objects.filter(item => !groupObjects.has(item.name)) }
  if (roleSchemaDigest(v3.objects) !== P1_CENTRAL_V3) throw new Error('Unexpected central v3 base schema')
  const additions = new Set<string>(siteProvisionSchemaObjects)
  const previous: RoleSchema = { ...schema,objects: v3.objects.filter(item => !additions.has(item.name)) }
  if (roleSchemaDigest(previous.objects) !== P1_CENTRAL_V2) throw new Error('Unexpected central v2 base schema')
  const table = await database.prepare("SELECT name FROM sqlite_master WHERE name='p1_schema_bootstrap'").first()
  if (table) {
    let current = await database.prepare('SELECT digest,operation_id FROM p1_schema_bootstrap WHERE id=1')
      .first<{ digest: string; operation_id: string }>()
    if (current?.digest === P1_CENTRAL_V1 && current.operation_id === 'p1-central-schema-v1') {
      await applyP1Schema(database,previous,'p1-central-schema-v2',{
        fromDigest: P1_CENTRAL_V1,fromOperationId: 'p1-central-schema-v1',addedObjects: siteLifecycleSchemaObjects,
      })
      current = { digest: P1_CENTRAL_V2,operation_id: 'p1-central-schema-v2' }
    }
    if (current?.digest === P1_CENTRAL_V2 && current.operation_id === 'p1-central-schema-v2') {
      await applyP1Schema(database,v3,'p1-central-schema-v3',{
        fromDigest: P1_CENTRAL_V2,fromOperationId: 'p1-central-schema-v2',addedObjects: siteProvisionSchemaObjects,
      })
    }
  }
  return applyP1Schema(database,schema,'p1-central-schema-v4',{
    fromDigest: P1_CENTRAL_V3,fromOperationId: 'p1-central-schema-v3',addedObjects: groupReleaseSchemaObjects,
  })
}
