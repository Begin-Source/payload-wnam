import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig, type PayloadRequest, type Plugin, type SanitizedConfig } from 'payload'
import { deepCopyObjectSimple } from 'payload/shared'
import { r2Storage } from '@payloadcms/storage-r2'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { payloadAiPlugin } from '@ai-stack/payloadcms'
import { workflowsPlugin } from '@xtr-dev/payload-automation/server'
import type { SiteIdentityRPC } from '../site-control/identityService'
import { lexicalEditorWithAi } from '../utilities/lexicalEditorWithAi'
import { createSitePayloadAdapter } from './payloadAdapter'
import { createSiteR2Proxy } from './r2'
import { requireLocalSiteId } from './context'
import { centralSiteStrategy, assertSiteIdentityBoundary } from './siteIdentity'
import { syncSiteIdentityProjection } from './identityProjection'
import { siteIdentityAuthenticator } from './identityClient'
import { guardSanitizedSiteConfig } from './payloadPlugin'
import { siteCollections, siteGlobals } from './configCollections'
import { restrictPublicDocumentFields, siteManage, siteRead, siteReadOnlyAccess, siteWrite } from './configAccess'
import { siteWorkflowTasks, type ExternalSiteTask } from './configWorkflow'

export type SitePayloadOptions = {
  secret: string
  identity: SiteIdentityRPC
  publicBucket: R2Bucket
  privateBucket: R2Bucket
  generationModels: unknown[]
  authorizeAiGeneration: (req: PayloadRequest) => Promise<boolean>
  executeExternalTask: ExternalSiteTask
}

/** Independent role factory: no shared config import, startup queries, model
 * discovery, seeds or migrations. Runtime capabilities must be explicit. A
 * single sanitized config/Payload instance is shared by the group's sites.
 */
export async function createSitePayloadConfig(options: SitePayloadOptions): Promise<SanitizedConfig> {
  if (!options.secret || !options.identity || !options.publicBucket || !options.privateBucket ||
    options.publicBucket === options.privateBucket || typeof options.authorizeAiGeneration !== 'function') {
    throw new Error('Explicit independent site capabilities required')
  }
  const strategy = centralSiteStrategy({ authenticateSession: siteIdentityAuthenticator(options.identity), loadProjection: syncSiteIdentityProjection })
  const workflows = workflowsPlugin({ enabled: true, collectionTriggers: { articles: { afterChange: true }, pages: { afterChange: true } },
    steps: siteWorkflowTasks(options.executeExternalTask) as unknown as Parameters<typeof workflowsPlugin>[0]['steps'] })
  const config = await buildConfig({
    secret: options.secret, telemetry: false,
    typescript: { autoGenerate: false },
    admin: { user: 'users', importMap: { baseDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), autoGenerate: false } },
    collections: siteCollections(strategy), globals: siteGlobals(), editor: lexicalEditorWithAi(),
    db: createSitePayloadAdapter(),
    jobs: { tasks: [], access: { run: async ({ req }) => await siteManage({ req }) === true,
      queue: async ({ req }) => await siteManage({ req }) === true }, autoRun: [] },
    plugins: [
      // Upstream generic types recurse into the legacy generated Config. Keep
      // the narrow untyped boundary here, as in the existing shared config.
      (payloadAiPlugin as unknown as (options: Record<string, unknown>) => Plugin)({
        collections: { articles: true, pages: true, 'knowledge-base': true },
        generationModels: () => options.generationModels,
        generatePromptOnInit: false, debugging: false, disableSponsorMessage: true, uploadCollectionSlug: 'media',
        access: { generate: async ({ req }: { req: PayloadRequest }) => {
          requireLocalSiteId()
          return Boolean(await siteWrite({ req })) && await options.authorizeAiGeneration(req)
        }, settings: siteManage },
      }),
      seoPlugin({ collections: ['articles','pages'], uploadsCollection: 'media', tabbedUI: true,
        generateTitle: ({ doc }) => typeof doc.title === 'string' ? doc.title.trim() : '',
        generateDescription: ({ doc }) => typeof doc.excerpt === 'string' ? doc.excerpt.trim() : '',
        generateImage: ({ doc }) => typeof doc.featuredImage === 'object' ? doc.featuredImage?.id ?? '' : doc.featuredImage ?? '',
        generateURL: ({ doc, collectionSlug }) => doc.slug ? `/${doc.locale || 'zh'}/${collectionSlug === 'articles' ? 'posts' : 'pages'}/${encodeURIComponent(doc.slug)}` : '',
        fields: ({ defaultFields }) => [...defaultFields.map(field => 'name' in field && ['title','description','image'].includes(field.name)
          ? { ...field, localized: false } : field), { name: 'noIndex', type: 'checkbox', defaultValue: false }],
      }),
      async incoming => {
        const configured = await workflows(incoming)
        // The plugin exports workflow-runs as a shared singleton. Payload marks
        // input collections _sanitized, so clone before it can affect another role.
        return { ...configured, collections: configured.collections?.map(collection => collection.slug === 'workflow-runs'
          ? deepCopyObjectSimple(collection) : collection) }
      },
      r2Storage({ bucket: createSiteR2Proxy(options.publicBucket), collections: { media: true } }),
      // The legacy shared generated types know only the media upload slug.
      r2Storage({ bucket: createSiteR2Proxy(options.privateBucket), collections:
        { 'private-media': true } as Parameters<typeof r2Storage>[0]['collections'] }),
    ],
  })
  for (const collection of config.collections) {
    restrictPublicDocumentFields(collection.slug, collection.fields)
    // These plugin defaults include anonymous writes; replace after plugins ran.
    if (['workflows','automation-steps','automation-triggers','plugin-ai-instructions'].includes(collection.slug)) {
      collection.access = { ...collection.access, read: siteRead, create: siteManage, update: siteManage, delete: siteManage, readVersions: siteRead }
    }
    if (['workflow-runs','payload-jobs'].includes(collection.slug)) collection.access = { ...collection.access, ...siteReadOnlyAccess }
    collection.hooks.beforeOperation = [() => { requireLocalSiteId() }, ...(collection.hooks.beforeOperation ?? [])]
  }
  for (const global of config.globals) global.hooks.beforeOperation = [() => { requireLocalSiteId() }, ...(global.hooks.beforeOperation ?? [])]
  // Storage plugins may add fields; the full sanitizer has now resolved every
  // relationship, including Payload's preferences, locks, jobs and versions.
  config.custom = { ...config.custom, payloadRole: 'site', localSiteMappingRequired: true }
  return assertSiteIdentityBoundary(guardSanitizedSiteConfig(config))
}
