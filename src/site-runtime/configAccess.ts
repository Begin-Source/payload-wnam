import type { Access, CollectionBeforeChangeHook, CollectionConfig, Field, PayloadRequest, Where } from 'payload'
import { requireLocalSiteId } from './context'
import { authenticatedSiteUser, sitePermission } from './siteIdentity'
import { parseRelationshipId } from '../utilities/parseRelationshipId'
import { whereForBlueprintVersions } from '../collections/access/blueprintVersionAccess'

export const denySiteWrite: Access = () => false
export const siteRead = sitePermission('read')
export const siteWrite = sitePermission('write')
export const siteManage = sitePermission('manage')

const publicFields: Record<string, ReadonlySet<string>> = {
  articles: new Set(['id','title','slug','locale','site','categories','featuredImage','body','status','publishedAt','excerpt',
    'author','relatedOffers','affiliatePageLayout','meta','createdAt','updatedAt']),
  pages: new Set(['id','title','slug','locale','site','categories','featuredImage','body','status','publishedAt','excerpt','meta','createdAt','updatedAt']),
  media: new Set(['id','alt','caption','site','filename','url','thumbnailURL','filesize','width','height','mimeType','sizes','createdAt','updatedAt']),
}

/** A published page does not make its job, cost or research metadata public. */
export function restrictPublicDocumentFields(slug: string, fields: Field[], privateChildren = false): void {
  const allowed = publicFields[slug]
  if (!allowed) return
  for (const field of fields) {
    if (field.type === 'tabs') for (const tab of field.tabs) {
      if ('name' in tab && tab.name) {
        if (privateChildren || !allowed.has(tab.name)) restrictPublicDocumentFields(slug, tab.fields, true)
      } else restrictPublicDocumentFields(slug, tab.fields, privateChildren)
    }
    if ('name' in field && field.type !== 'ui' && (privateChildren || !allowed.has(field.name))) {
      field.access = { ...field.access, read: async ({ req }) => await siteRead({ req }) === true }
    } else if (!('name' in field) && 'fields' in field) restrictPublicDocumentFields(slug, field.fields, privateChildren)
  }
}

/** Only published documents are available to anonymous REST callers. Editing a
 * live document also publishes that edit, so it requires the publisher role.
 */
export function siteDocumentAccess(publicContent = false): CollectionConfig['access'] {
  const write: Access = async args => {
    if (!await siteWrite(args)) return false
    if (!publicContent || await sitePermission('publish')(args)) return true
    if (args.data?.status === 'published') return false
    return { status: { not_equals: 'published' } }
  }
  return {
    read: async args => {
      requireLocalSiteId()
      if (await siteRead(args)) return true
      return publicContent && !args.req.user ? { status: { equals: 'published' } } : false
    },
    create: async args => {
      requireLocalSiteId()
      return await siteWrite(args) && (!publicContent || args.data?.status !== 'published' || await sitePermission('publish')(args))
    },
    update: write, delete: write, readVersions: siteRead,
  }
}

export const siteReadOnlyAccess: CollectionConfig['access'] = {
  read: siteRead, create: denySiteWrite, update: denySiteWrite, delete: denySiteWrite, readVersions: siteRead,
}

/** Physical D1 isolation is primary, but imported or malformed records must
 * also match the registered site. Returning a Where makes Payload's upload
 * endpoint check the owning document before serving an object.
 */
export function scopeDocumentAccess(collection: CollectionConfig, siteWhere: () => Where): void {
  const access = { ...collection.access }
  for (const operation of ['read', 'update', 'delete', 'readVersions'] as const) {
    const original = access[operation]
    access[operation] = async args => {
      requireLocalSiteId()
      const allowed = original ? await original(args) : false
      if (allowed === false) return false
      const scope = operation === 'readVersions' ? whereForBlueprintVersions(siteWhere()) : siteWhere()
      return allowed === true ? scope : { and: [scope, allowed] }
    }
  }
  collection.access = access
}

/** Preserve custom validation/filtering; constrain every sites relation using
 * the explicit numeric mapping, including nested arrays and populated values.
 */
export function scopeSiteFields(fields: Field[]): void {
  for (const field of fields) {
    if ((field.type === 'relationship' || field.type === 'upload') && field.relationTo === 'sites') {
      field.filterOptions = () => ({ id: { equals: requireLocalSiteId() } })
      if (field.name === 'site' && !field.hasMany) field.defaultValue = () => requireLocalSiteId()
      const hooks = field.hooks ?? {}
      field.hooks = { ...hooks, beforeValidate: [({ value }) => {
        const local = requireLocalSiteId()
        const values = Array.isArray(value) ? value : value == null ? [] : [value]
        if (values.some(item => parseRelationshipId(item) !== local)) throw new Error('Cross-site relationship rejected')
        return value
      }, ...(hooks.beforeValidate ?? [])] }
    }
    if ('fields' in field) scopeSiteFields(field.fields)
    if (field.type === 'tabs') for (const tab of field.tabs) scopeSiteFields(tab.fields)
    if (field.type === 'blocks') for (const block of field.blocks) if (typeof block !== 'string') scopeSiteFields(block.fields)
  }
}

export const validateLocalSiteRecord: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const expected = requireLocalSiteId()
  const id = data.id ?? originalDoc?.id
  if (parseRelationshipId(id) !== expected) throw new Error('Site record does not match registered local ID')
  return data
}

/** This is additional defense for Local API writes with overrideAccess=true
 * and an authenticated browser user. Trusted jobs have no browser principal.
 */
export const validateSitePublication: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  if (req.user && (data.status === 'published' || originalDoc?.status === 'published') &&
    !await sitePermission('publish')({ req })) throw new Error('Site publisher permission required')
  return data
}

export function onlyCurrentSite(req: PayloadRequest): Where | false {
  return authenticatedSiteUser(req.user) ? { id: { equals: requireLocalSiteId() } } : false
}
