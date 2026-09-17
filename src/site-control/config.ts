import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig, type CollectionConfig, type Field, type PayloadRequest, type Plugin, type SanitizedConfig } from 'payload'
import { deepCopyObjectSimple } from 'payload/shared'
import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { payloadAiPlugin } from '@ai-stack/payloadcms'
import { r2Storage } from '@payloadcms/storage-r2'
import { Users } from '../collections/Users'
import { Tenants } from '../collections/Tenants'
import { Teams } from '../collections/Teams'
import { Announcements } from '../collections/Announcements'
import { SitePortfolios } from '../collections/SitePortfolios'
import { Sites } from '../collections/Sites'
import { SiteLayouts } from '../collections/SiteLayouts'
import { AffiliateNetworks } from '../collections/AffiliateNetworks'
import { Offers } from '../collections/Offers'
import { Authors } from '../collections/Authors'
import { SocialPlatforms } from '../collections/SocialPlatforms'
import { SiteQuotas } from '../collections/SiteQuotas'
import { TenantPromptTemplates } from '../collections/TenantPromptTemplates'
import { PipelineProfiles } from '../collections/PipelineProfiles'
import { KeywordBatchPresets } from '../collections/KeywordBatchPresets'
import { KnowledgeBase } from '../collections/KnowledgeBase'
import { OperationManuals } from '../collections/OperationManuals'
import { AuditLogs } from '../collections/AuditLogs'
import { Commissions } from '../collections/Commissions'
import { AffiliateEarningsImports, AffiliateEarningsRows, CommissionStatements } from '../collections/AffiliateFinanceCollections'
import { Media } from '../collections/Media'
import { CommissionRules } from '../globals/CommissionRules'
import { QuotaRules } from '../globals/QuotaRules'
import { AdminBranding } from '../globals/AdminBranding'
import { LlmPrompts } from '../globals/LlmPrompts'
import { PromptLibrary } from '../globals/PromptLibrary'
import { PipelineSettings } from '../globals/PipelineSettings'
import { lexicalEditorWithAi } from '../utilities/lexicalEditorWithAi'
import { loggedInSuperAdminAccessFor } from '../collections/shared/loggedInSuperAdminAccess'
import { superAdminOrTenantGMPasses } from '../utilities/superAdminPasses'
import { userHasUnscopedAdminAccess } from '../utilities/superAdmin'
import { userHasRole, userHasTenantGeneralManagerRole } from '../utilities/userRoles'
import { userMayWriteCommissions } from '../utilities/financeRoleAccess'
import { isUsersCollection } from '../utilities/announcementAccess'
import { authorsGdprValidate } from '../collections/hooks/authorsGdprValidate'
import { setContentCreatedByOnCreate } from '../collections/hooks/setContentCreatedByOnCreate'
import { syncBlueprintsMirroredLayoutAfterSiteChange } from '../collections/hooks/syncBlueprintMirroredLayout'
import { optionalSiteContext } from '../site-runtime/context'
import { createCentralCommissionStatementHook } from './commissionStatement'
import { readSiteRegistration } from './registry'

export type CentralPayloadOptions = {
  database: D1Database; bucket: R2Bucket; secret: string; generationModels: unknown[]
  authorizeAiGeneration: (req: PayloadRequest) => Promise<boolean>
}
const sources = [Users,Tenants,Teams,Announcements,SitePortfolios,Sites,SiteLayouts,AffiliateNetworks,Offers,Authors,
  SocialPlatforms,SiteQuotas,TenantPromptTemplates,PipelineProfiles,KeywordBatchPresets,KnowledgeBase,OperationManuals,
  AuditLogs,Commissions,AffiliateEarningsImports,AffiliateEarningsRows,CommissionStatements,Media]
const deny = () => false
const masterWrite = superAdminOrTenantGMPasses(deny)

function centralFields(fields: Field[], excluded: ReadonlySet<string>): Field[] {
  return fields.filter(field => field.type !== 'ui' && (!('name' in field) || !excluded.has(field.name))).map(field => {
    // Old quick actions target the shared content runtime. Central role actions
    // will use explicit capabilities; retain data fields, never those handlers.
    if (field.admin) field.admin = { ...field.admin, components: undefined }
    if ('fields' in field) field.fields = centralFields(field.fields,excluded)
    if (field.type === 'tabs') for (const tab of field.tabs) tab.fields = centralFields(tab.fields,excluded)
    if (field.type === 'blocks') for (const block of field.blocks) if (typeof block !== 'string') block.fields = centralFields(block.fields,excluded)
    if (field.type !== 'ui' && 'name' in field && (field.admin?.readOnly || ['costReconciliationId','settlementEndExclusive'].includes(field.name))) {
      field.access = { ...field.access, create: deny, update: deny }
    }
    return field
  })
}
function centralOnly(): void { if (optionalSiteContext()) throw new Error('Central Payload cannot run inside a site request') }

/** Independent central schema. Provisioning/migrations and source reconciliation
 * are explicit operations; this factory never accesses D1 or a remote model list.
 */
export async function createCentralPayloadConfig(options: CentralPayloadOptions): Promise<SanitizedConfig> {
  if (!options.database || !options.bucket || !options.secret || typeof options.authorizeAiGeneration !== 'function') throw new Error('Explicit central capabilities required')
  const collections = sources.map(source => {
    const collection = deepCopyObjectSimple(source) as CollectionConfig
    collection.custom = { ...collection.custom, ownership: 'central' }
    collection.admin = { ...collection.admin, components: undefined }
    const excluded = new Set<string>()
    if (collection.slug === 'authors') {
      for (const name of ['sites','expertiseAreas']) excluded.add(name)
      collection.hooks = { beforeValidate: [authorsGdprValidate] }
      collection.access = { ...loggedInSuperAdminAccessFor('authors'), create: masterWrite, update: masterWrite, delete: masterWrite }
      collection.admin.defaultColumns = ['displayName','role','updatedAt']
    }
    if (collection.slug === 'offers') for (const name of ['sites','categories','featuredOnHomeForSites','merchantSlot','reviewDraft']) excluded.add(name)
    if (collection.slug === 'offers') collection.admin.defaultColumns = ['title','network','status','updatedAt']
    if (collection.slug === 'knowledge-base') {
      excluded.add('site'); excluded.add('categories')
      collection.hooks = {}
      collection.access = loggedInSuperAdminAccessFor('knowledge-base')
      collection.admin.defaultColumns = ['title','status','updatedAt']
    }
    if (collection.slug === 'media') {
      excluded.add('site')
      collection.hooks = { beforeChange: [setContentCreatedByOnCreate] }
      collection.access = loggedInSuperAdminAccessFor('media')
      collection.admin.defaultColumns = ['alt','filename','updatedAt']
    }
    if (collection.slug === 'sites') {
      for (const name of ['homepageHeroBanner','siteLogo','aiCostUsd','aiCostBreakdown']) excluded.add(name)
      collection.access = { ...collection.access, create: deny, delete: deny }
      collection.fields.push({ name: 'runtimeSiteId', type: 'text', required: true, unique: true, admin: { readOnly: true } })
      collection.hooks = { ...collection.hooks, beforeDelete: [() => { throw new Error('Retire sites through provisioning') }],
        beforeChange: [async args => {
          const value = args.data.runtimeSiteId ?? args.originalDoc?.runtimeSiteId
          if (typeof value !== 'string' || !await readSiteRegistration(options.database,value)) throw new Error('Registered stable site identity required')
          if (args.operation === 'update' && value !== args.originalDoc?.runtimeSiteId) throw new Error('Central site identity is immutable')
          // Existing defaults expect a full document; PATCH must not reset a
          // domain/slug while updating unrelated central metadata.
          return { ...args.originalDoc, ...args.data }
        }, ...(collection.hooks?.beforeChange ?? [])],
        afterChange: (collection.hooks?.afterChange ?? []).filter(hook => hook !== syncBlueprintsMirroredLayoutAfterSiteChange) }
      const controlled = new Set(['createdBy','operators','primaryDomain','slug','status','domainWorkflowStatus','domainCheckStatus',
        'domainCheckAvailable','domainCheckAt','domainCheckMessage','domainGenerationLog'])
      const protect = (fields: Field[]): void => { for (const field of fields) {
        if ('name' in field && controlled.has(field.name)) field.admin = { ...field.admin, readOnly: true }
        if ('fields' in field) protect(field.fields)
      } }
      protect(collection.fields)
    }
    if (collection.slug === 'keyword-batch-presets') excluded.add('pillarKeywordId')
    if (collection.slug === 'site-quotas') excluded.add('usageYtd') // Local usage arrives via summaries, never policy CRUD.
    if (collection.slug === 'commission-statements') {
      collection.hooks = { beforeChange: [createCentralCommissionStatementHook(options.database)] }
      collection.fields.push({ name: 'costReconciliationId', type: 'text', index: true, admin: { readOnly: true } },
        { name: 'settlementEndExclusive', type: 'date', admin: { hidden: true, readOnly: true } })
      const cost = collection.fields.find(field => 'name' in field && field.name === 'aiCostsUsd')
      if (cost && 'name' in cost) cost.label = 'Included AI / DataForSEO costs (USD)'
    }
    if (collection.slug === 'users') {
      const create = collection.access!.create!
      collection.access = { ...collection.access, create: args => args.req.user ? create(args) : false }
      for (const field of collection.fields) if (field.type !== 'ui' && 'name' in field) {
        if (['profitSharePct','leaderCutPctOverride','opsCutPctOverride'].includes(field.name)) {
          field.access = { ...field.access, create: ({ req }) => userMayWriteCommissions(req.user),
            update: ({ req }) => userMayWriteCommissions(req.user) }
        }
        if (['tenants','teamLead','opsManager'].includes(field.name)) {
          const manage = ({ req }: { req: PayloadRequest }) => userHasUnscopedAdminAccess(req.user) || userHasTenantGeneralManagerRole(req.user) ||
            (isUsersCollection(req.user) && (userHasRole(req.user,'ops-manager') || userHasRole(req.user,'team-lead')))
          field.access = { ...field.access, create: manage, update: manage }
        }
      }
    }
    collection.fields = centralFields(collection.fields,excluded)
    return collection
  })
  const globals = [CommissionRules,QuotaRules,AdminBranding,LlmPrompts,PromptLibrary,PipelineSettings].map(source => deepCopyObjectSimple(source))
  const tenantCollections = Object.fromEntries(collections.filter(collection => !['users','tenants','site-layouts'].includes(collection.slug)).map(collection => [collection.slug, {}]))
  const config = await buildConfig({ secret: options.secret, telemetry: false, typescript: { autoGenerate: false },
    admin: { user: 'users', importMap: { baseDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'), autoGenerate: false } },
    db: sqliteD1Adapter({ binding: options.database, push: false, allowIDOnCreate: true }),
    collections, globals, editor: lexicalEditorWithAi(), plugins: [
      multiTenantPlugin({ useTenantsCollectionAccess: false, tenantsArrayField: { includeDefaultField: false }, collections: tenantCollections,
        userHasAccessToAllTenants: user => userHasUnscopedAdminAccess(user) || (isUsersCollection(user) && userHasRole(user,'finance')) }),
      (payloadAiPlugin as unknown as (options: Record<string, unknown>) => Plugin)({ collections: { 'knowledge-base': true },
        generationModels: () => options.generationModels, generatePromptOnInit: false, debugging: false, disableSponsorMessage: true, uploadCollectionSlug: 'media',
        access: { settings: masterWrite, generate: async ({ req }: { req: PayloadRequest }) =>
          Boolean(await loggedInSuperAdminAccessFor('knowledge-base').create({ req })) && await options.authorizeAiGeneration(req) } }),
      r2Storage({ bucket: options.bucket, collections: { media: true } }),
    ],
  })
  for (const collection of config.collections) {
    collection.hooks.beforeOperation = [centralOnly,...(collection.hooks.beforeOperation ?? [])]
    if (collection.slug === 'plugin-ai-instructions') collection.access = { ...collection.access, read: masterWrite, create: masterWrite, update: masterWrite, delete: masterWrite }
  }
  for (const global of config.globals) global.hooks.beforeOperation = [centralOnly,...(global.hooks.beforeOperation ?? [])]
  config.custom = { ...config.custom, payloadRole: 'central' }
  return config
}
