import type { AuthStrategy, CollectionConfig, Field, GlobalConfig } from 'payload'
import { deepCopyObjectSimple } from 'payload/shared'
import { Articles } from '../collections/Articles'
import { Pages } from '../collections/Pages'
import { Sites } from '../collections/Sites'
import { Categories } from '../collections/Categories'
import { SiteBlueprints } from '../collections/SiteBlueprints'
import { SiteLayouts } from '../collections/SiteLayouts'
import { AffiliateNetworks } from '../collections/AffiliateNetworks'
import { Offers } from '../collections/Offers'
import { Authors } from '../collections/Authors'
import { Media } from '../collections/Media'
import { SocialPlatforms } from '../collections/SocialPlatforms'
import { SocialAccounts } from '../collections/SocialAccounts'
import { Keywords } from '../collections/Keywords'
import { ContentBriefs } from '../collections/ContentBriefs'
import { SerpSnapshots } from '../collections/SerpSnapshots'
import { Rankings } from '../collections/Rankings'
import { WorkflowJobs } from '../collections/WorkflowJobs'
import { SiteQuotas } from '../collections/SiteQuotas'
import { ClickEvents } from '../collections/ClickEvents'
import { TenantPromptTemplates, enforceTenantPromptTemplatesTenant } from '../collections/TenantPromptTemplates'
import { PipelineProfiles, enforcePipelineProfilesTenant } from '../collections/PipelineProfiles'
import { KeywordBatchPresets, enforceKeywordBatchPresetsTenant } from '../collections/KeywordBatchPresets'
import { KnowledgeBase } from '../collections/KnowledgeBase'
import { AuditLogs } from '../collections/AuditLogs'
import { OriginalEvidence } from '../collections/OriginalEvidence'
import { PageLinkGraph } from '../collections/PageLinkGraph'
import { Redirects } from '../collections/Redirects'
import { PublicLanding } from '../globals/PublicLanding'
import { AdminBranding } from '../globals/AdminBranding'
import { LlmPrompts } from '../globals/LlmPrompts'
import { PromptLibrary } from '../globals/PromptLibrary'
import { PipelineSettings } from '../globals/PipelineSettings'
import { QuotaRules } from '../globals/QuotaRules'
import { enforceSitesMatrixQuota } from '../collections/hooks/sitesMatrixQuota'
import { syncBlueprintTenantFromSiteTenantFieldBeforeChange } from '../collections/hooks/syncBlueprintMirroredLayout'
import { requireLocalSiteId } from './context'
import { siteIdentityCollection } from './siteIdentity'
import { masterTenantWhere, validateMasterTenant } from './masterTenant'
import { denySiteWrite, onlyCurrentSite, scopeDocumentAccess, scopeSiteFields, siteDocumentAccess, siteManage, siteRead, siteReadOnlyAccess,
  validateLocalSiteRecord, validateSitePublication } from './configAccess'

const sources = [Sites, SiteBlueprints, Categories, Pages, Redirects, AffiliateNetworks, Offers, SocialPlatforms,
  SocialAccounts, Media, Keywords, ContentBriefs, SerpSnapshots, Articles, Authors, Rankings, WorkflowJobs,
  SiteQuotas, ClickEvents, TenantPromptTemplates, PipelineProfiles, KeywordBatchPresets, KnowledgeBase, AuditLogs,
  OriginalEvidence, SiteLayouts, PageLinkGraph]

const copies = new Set(['site-layouts','affiliate-networks','offers','authors','social-platforms','site-quotas',
  'tenant-prompt-templates','pipeline-profiles','keyword-batch-presets'])
const readOnly = new Set(['affiliate-networks','social-platforms','site-layouts','site-quotas','click-events','audit-logs','page-link-graph'])
const managed = new Set(['tenant-prompt-templates','pipeline-profiles','keyword-batch-presets'])
const siteMetadata = new Set(['createdBy','operators','portfolio','slug','primaryDomain','status','domainWorkflowStatus',
  'domainCheckStatus','domainCheckAvailable','domainCheckAt','domainCheckMessage','domainGenerationLog'])

function sourceField(): Field {
  return { name: 'centralSource', type: 'group', admin: { readOnly: true },
    access: { create: () => false, update: () => false, read: ({ req }) => Boolean(req.user) },
    hooks: { beforeValidate: [({ value }) => {
      if (!value || Object.values(value).every(item => item == null || item === '')) return value
      const source = value as { recordId?: unknown; revision?: unknown; syncedAt?: unknown }
      if (typeof source.recordId !== 'string' || !source.recordId || source.recordId.length > 128 ||
        !Number.isSafeInteger(source.revision) || Number(source.revision) < 1 ||
        typeof source.syncedAt !== 'string' || !Number.isFinite(Date.parse(source.syncedAt))) {
        throw new Error('Complete central source identity and revision required')
      }
      return value
    }] },
    // Site-authored records have no central source. A synchronized copy must
    // supply the entire group, validated above, never a partial provenance.
    fields: [{ name: 'recordId', type: 'text' }, { name: 'revision', type: 'number', min: 1 },
      { name: 'syncedAt', type: 'date' }] }
}

function tenantField(blueprint = false): Field {
  return { name: 'tenant', type: 'relationship', relationTo: 'tenants', index: true, admin: { readOnly: true },
    access: { create: () => false, update: () => false },
    ...(blueprint ? { hooks: { beforeChange: [syncBlueprintTenantFromSiteTenantFieldBeforeChange] } } : {}) }
}

/** These copies preserve FK targets without copying organization permissions. */
function organizationProjection(slug: 'tenants' | 'site-portfolios'): CollectionConfig {
  return { slug, admin: { useAsTitle: 'name', group: 'Reference' }, access: siteReadOnlyAccess,
    custom: { siteOwnership: 'central-projection' }, fields: [
      { name: 'name', type: 'text', required: true }, { name: 'slug', type: 'text', required: true, index: true }, sourceField(),
      ...(slug === 'site-portfolios' ? [tenantField()] : []),
    ] }
}

function protectFields(fields: Field[], names: ReadonlySet<string>): void {
  for (const field of fields) {
    if (field.type !== 'ui' && 'name' in field && (names.has(field.name) || field.admin?.readOnly === true)) {
      field.access = { ...field.access, create: () => false, update: () => false }
      field.admin = { ...field.admin, readOnly: true }
    }
    if ('fields' in field) protectFields(field.fields, names)
    if (field.type === 'tabs') for (const tab of field.tabs) protectFields(tab.fields, names)
  }
}

/** Clone before plugins and sanitize mutate fields; never import payload.config. */
export function siteCollections(strategy: AuthStrategy): CollectionConfig[] {
  const collections = sources.map(source => {
    const collection = deepCopyObjectSimple(source) as CollectionConfig
    collection.admin = { ...collection.admin, hidden: false }
    collection.access = siteDocumentAccess(['articles','pages'].includes(collection.slug))
    collection.custom = { ...collection.custom, siteOwnership: copies.has(collection.slug) ? 'versioned-copy' : 'site' }
    collection.fields.push(tenantField(collection.slug === 'site-blueprints'))
    if (copies.has(collection.slug)) collection.fields.push(sourceField())
    scopeSiteFields(collection.fields)
    protectFields(collection.fields, new Set())
    if (readOnly.has(collection.slug)) collection.access = siteReadOnlyAccess
    if (managed.has(collection.slug)) {
      collection.access = { read: siteRead, create: siteManage, update: siteManage, delete: siteManage }
      const legacyTenantHooks = [enforceTenantPromptTemplatesTenant, enforcePipelineProfilesTenant, enforceKeywordBatchPresetsTenant]
      collection.hooks = { ...collection.hooks,
        beforeValidate: [validateMasterTenant, ...(collection.hooks?.beforeValidate ?? [])],
        beforeChange: (collection.hooks?.beforeChange ?? []).filter(hook => !legacyTenantHooks.includes(hook)) }
      scopeDocumentAccess(collection, masterTenantWhere)
    }
    if (['articles','pages'].includes(collection.slug)) {
      collection.hooks = { ...collection.hooks, beforeChange: [validateSitePublication, ...(collection.hooks?.beforeChange ?? [])] }
    }
    if (collection.slug === 'sites') {
      for (const field of collection.fields) if (field.type === 'relationship' && ['pipelineProfile','keywordBatchPreset'].includes(field.name)) {
        // These are already selected, local copies; the old tenant-role picker
        // cannot resolve the new credential-free site principal.
        field.filterOptions = () => true
      }
      collection.access = { read: ({ req }) => onlyCurrentSite(req), create: denySiteWrite, delete: denySiteWrite,
        update: async args => await siteManage(args) ? { id: { equals: requireLocalSiteId() } } : false }
      protectFields(collection.fields, siteMetadata)
      collection.hooks = { ...collection.hooks,
        // Site retirement owns database disposal; the old cascade queries central finance tables.
        beforeDelete: [() => { throw new Error('Retire sites through the central control plane') }],
        beforeChange: [validateLocalSiteRecord, ...(collection.hooks?.beforeChange ?? []).filter(hook => hook !== enforceSitesMatrixQuota)] }
    }
    if (collection.slug === 'original-evidence') {
      const media = collection.fields.find(field => 'name' in field && field.name === 'media')
      if (!media || media.type !== 'upload') throw new Error('Original evidence upload field missing')
      media.relationTo = 'private-media' as typeof media.relationTo
    }
    return collection
  })
  const media = collections.find(collection => collection.slug === 'media')!
  media.access = { ...siteDocumentAccess(), read: () => { requireLocalSiteId(); return true } }
  const privateMedia = deepCopyObjectSimple(media) as CollectionConfig
  privateMedia.slug = 'private-media'
  privateMedia.labels = { singular: 'Private research file', plural: 'Private research files' }
  privateMedia.access = siteDocumentAccess()
  privateMedia.custom = { ...privateMedia.custom, siteOwnership: 'private-site-media' }
  privateMedia.upload = { ...(typeof privateMedia.upload === 'object' ? privateMedia.upload : {}),
    modifyResponseHeaders: ({ headers }) => { headers.set('Cache-Control', 'private, no-store'); return headers } }
  for (const collection of [...collections, privateMedia]) {
    if (['site-blueprints','categories','pages','redirects','social-accounts','media','private-media','keywords',
      'content-briefs','serp-snapshots','articles','rankings','workflow-jobs','site-quotas','click-events',
      'knowledge-base','page-link-graph'].includes(collection.slug)) {
      scopeDocumentAccess(collection, () => ({ site: { equals: requireLocalSiteId() } }))
    } else if (collection.slug === 'authors') {
      scopeDocumentAccess(collection, () => ({ sites: { contains: requireLocalSiteId() } }))
    } else if (collection.slug === 'original-evidence') {
      scopeDocumentAccess(collection, () => ({ 'article.site': { equals: requireLocalSiteId() } }))
    }
  }
  // Both buckets are bound explicitly in the factory. Private evidence can never
  // use the anonymous public upload route or a public bucket fallback.
  return [siteIdentityCollection(strategy), organizationProjection('tenants'), organizationProjection('site-portfolios'), ...collections, privateMedia]
}

export function siteGlobals(): GlobalConfig[] {
  return [PublicLanding, AdminBranding, LlmPrompts, PromptLibrary, PipelineSettings, QuotaRules].map(source => {
    const global = deepCopyObjectSimple(source) as GlobalConfig
    const readonly = ['admin-branding','quota-rules'].includes(global.slug)
    global.admin = { ...global.admin, hidden: false }
    global.access = { read: global.slug === 'public-landing' ? () => { requireLocalSiteId(); return true } : siteRead,
      update: readonly ? denySiteWrite : siteManage }
    global.custom = { ...global.custom, siteOwnership: readonly ? 'central-projection' : 'site-versioned-config' }
    global.fields.push(sourceField())
    scopeSiteFields(global.fields)
    return global
  })
}
