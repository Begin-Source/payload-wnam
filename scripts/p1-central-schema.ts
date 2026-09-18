import { siteLifecycleSchemaObjects } from '../src/site-control/lifecycleSchema'
import { siteProvisionSchemaObjects } from '../src/site-control/provisionSchema'
import { groupReleaseSchemaObjects } from '../src/site-control/groupReleaseSchema'
import { provisionAdmissionSchemaObjects } from '../src/site-control/provisionAdmissionSchema'
import { provisionDispatchSchemaObjects } from '../src/site-control/provisionDispatchSchema'
import { provisionDispatchRunSchemaObjects } from '../src/site-control/provisionDispatchRunSchema'
import { applyP1Schema, roleSchemaDigest, type RoleSchema } from './p1-schema'

export const P1_CENTRAL_V1 = '32d9ac67f25b2dec5326ed868a1e98c5b06e0de87d5312c3b69d8591507604a3'
export const P1_CENTRAL_V2 = 'a0e7820413a25bad42da857f7a60d96fb7f2997f8bf8f71e997d73e4eae97641'
export const P1_CENTRAL_V3 = 'a97d4714d6af58802fc39203f4e1ae29609330e7c66b047bc6a336410de034db'
export const P1_CENTRAL_V4 = 'a7c3aadae00b64d214635f59147438ad9b44798f5b8fd241483b5f10728c539f'
export const P1_CENTRAL_V5 = 'd3f650c7b33c1bd8f40e042430691b1104ae98dd891e270de42c6060a2f0ca37'
export const P1_CENTRAL_V6_DISPATCH = 'e9b79e7fd45892c9a5b0353b32d2ab80e2c30006167e8fd58c432bc5bbbaf199'

/** Upgrade only the previously reviewed complete schemas, never silently adopt
 * another schema. Fresh installs use v7; old versions pass through each additive
 * change with its own atomic receipt. Interrupted upgrades resume at their
 * actual persisted version. */
export async function applyP1CentralSchema(database: D1Database,schema: RoleSchema) {
  if (schema.role !== 'central') throw new Error('Central schema required')
  const runObjects = new Set<string>(provisionDispatchRunSchemaObjects)
  if (provisionDispatchRunSchemaObjects.some(name => schema.objects.filter(item => item.name === name).length !== 1)) {
    throw new Error('Incomplete central dispatch run schema')
  }
  const v6: RoleSchema = { ...schema,objects: schema.objects.filter(item => !runObjects.has(item.name)) }
  const dispatchObjects = new Set<string>(provisionDispatchSchemaObjects)
  if (provisionDispatchSchemaObjects.some(name => v6.objects.filter(item => item.name === name).length !== 1)) {
    throw new Error('Incomplete central dispatch schema')
  }
  if (roleSchemaDigest(v6.objects.filter(item => dispatchObjects.has(item.name))) !== P1_CENTRAL_V6_DISPATCH) {
    throw new Error('Unexpected central v6 dispatch schema')
  }
  const v6Digest = roleSchemaDigest(v6.objects)
  const v5: RoleSchema = { ...v6,objects: v6.objects.filter(item => !dispatchObjects.has(item.name)) }
  if (roleSchemaDigest(v5.objects) !== P1_CENTRAL_V5) throw new Error('Unexpected central v5 base schema')
  const admissionObjects = new Set<string>(provisionAdmissionSchemaObjects)
  if (provisionAdmissionSchemaObjects.some(name => v5.objects.filter(item => item.name === name).length !== 1)) {
    throw new Error('Incomplete central admission schema')
  }
  const v4: RoleSchema = { ...schema,objects: v5.objects.filter(item => !admissionObjects.has(item.name)) }
  if (roleSchemaDigest(v4.objects) !== P1_CENTRAL_V4) throw new Error('Unexpected central v4 base schema')
  const groupObjects = new Set<string>(groupReleaseSchemaObjects)
  const v3: RoleSchema = { ...schema,objects: v4.objects.filter(item => !groupObjects.has(item.name)) }
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
      current = { digest: P1_CENTRAL_V3,operation_id: 'p1-central-schema-v3' }
    }
    if (current?.digest === P1_CENTRAL_V3 && current.operation_id === 'p1-central-schema-v3') {
      await applyP1Schema(database,v4,'p1-central-schema-v4',{
        fromDigest: P1_CENTRAL_V3,fromOperationId: 'p1-central-schema-v3',addedObjects: groupReleaseSchemaObjects,
      })
      current = { digest: P1_CENTRAL_V4,operation_id: 'p1-central-schema-v4' }
    }
    if (current?.digest === P1_CENTRAL_V4 && current.operation_id === 'p1-central-schema-v4') {
      await applyP1Schema(database,v5,'p1-central-schema-v5',{
        fromDigest: P1_CENTRAL_V4,fromOperationId: 'p1-central-schema-v4',addedObjects: provisionAdmissionSchemaObjects,
      })
      current = { digest: P1_CENTRAL_V5,operation_id: 'p1-central-schema-v5' }
    }
    if (current?.digest === P1_CENTRAL_V5 && current.operation_id === 'p1-central-schema-v5') {
      await applyP1Schema(database,v6,'p1-central-schema-v6',{
        fromDigest: P1_CENTRAL_V5,fromOperationId: 'p1-central-schema-v5',addedObjects: provisionDispatchSchemaObjects,
      })
    }
  }
  return applyP1Schema(database,schema,'p1-central-schema-v7',{
    fromDigest: v6Digest,fromOperationId: 'p1-central-schema-v6',addedObjects: provisionDispatchRunSchemaObjects,
  })
}
