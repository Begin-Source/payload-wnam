import fs from 'fs'
import path from 'path'
import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite'
import { buildConfig } from 'payload'
import { payloadAiPlugin } from '@ai-stack/payloadcms'
import type { PayloadLogger } from 'payload'
import { fileURLToPath } from 'url'
import { CloudflareContext, getCloudflareContext } from '@opennextjs/cloudflare'
import { GetPlatformProxyOptions } from 'wrangler'
import { r2Storage } from '@payloadcms/storage-r2'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { seoPlugin } from '@payloadcms/plugin-seo'
import {
  CreateDocumentStepTask,
  DeleteDocumentStepTask,
  HttpRequestStepTask,
  ReadDocumentStepTask,
  SendEmailStepTask,
  UpdateDocumentStepTask,
  workflowsPlugin,
} from '@xtr-dev/payload-automation/server'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Tenants } from './collections/Tenants'
import { Sites } from './collections/Sites'
import { SitePortfolios } from './collections/SitePortfolios'
import { SiteQuotas } from './collections/SiteQuotas'
import { SiteBlueprints } from './collections/SiteBlueprints'
import { SiteLayouts } from './collections/SiteLayouts'
import { AffiliateNetworks } from './collections/AffiliateNetworks'
import { Offers } from './collections/Offers'
import { ClickEvents } from './collections/ClickEvents'
import { Commissions } from './collections/Commissions'
import { Categories } from './collections/Categories'
import { Keywords } from './collections/Keywords'
import { ContentBriefs } from './collections/ContentBriefs'
import { SerpSnapshots } from './collections/SerpSnapshots'
import { Authors } from './collections/Authors'
import { Articles } from './collections/Articles'
import { OriginalEvidence } from './collections/OriginalEvidence'
import { PageLinkGraph } from './collections/PageLinkGraph'
import { Pages } from './collections/Pages'
import { Redirects } from './collections/Redirects'
import { WorkflowJobs } from './collections/WorkflowJobs'
import { SocialPlatforms } from './collections/SocialPlatforms'
import { SocialAccounts } from './collections/SocialAccounts'
import { Rankings } from './collections/Rankings'
import { AuditLogs } from './collections/AuditLogs'
import { KnowledgeBase } from './collections/KnowledgeBase'
import { OperationManuals } from './collections/OperationManuals'
import { adminGroups } from './constants/adminGroups'
import { CommissionRules } from './globals/CommissionRules'
import { QuotaRules } from './globals/QuotaRules'
import { AdminBranding } from './globals/AdminBranding'
import { LlmPrompts } from './globals/LlmPrompts'
import { PromptLibrary } from './globals/PromptLibrary'
import { PublicLanding } from './globals/PublicLanding'
import { PipelineSettings } from './globals/PipelineSettings'
import { Announcements } from './collections/Announcements'
import { Teams } from './collections/Teams'
import { OpenAIConfig } from './utilities/aiOpenAIConfigImport'
import type { Config } from './payload-types'
import { expandMcpAccessForSuperAdmin } from './utilities/mcpSuperAdminAccess'
import { userHasUnscopedAdminAccess } from './utilities/superAdmin'
import { aiPluginSeedPrompts } from './utilities/aiPluginSeedPrompts'
import {
  applyOpenRouterToGenerationModels,
  safeFetchOpenRouterModelOptions,
} from './utilities/openRouterGenerationModels'
import { lexicalEditorWithAi } from './utilities/lexicalEditorWithAi'
import { syncBlueprintTenantFromSiteTenantFieldBeforeChange } from './collections/hooks/syncBlueprintMirroredLayout'

/** Collections exposed via MCP (camelCase keys on API key docs must match these slugs). */
const mcpCollectionSlugs = [
  'tenants',
  'users',
  'media',
  'sites',
  'affiliate-networks',
  'offers',
  'categories',
  'articles',
  'pages',
  'keywords',
  'workflow-jobs',
  'knowledge-base',
  'rankings',
  'content-briefs',
  'authors',
  'original-evidence',
  'page-link-graph',
  'serp-snapshots',
  'site-portfolios',
] as const

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const realpath = (value: string) => (fs.existsSync(value) ? fs.realpathSync(value) : undefined)

const isCLI = process.argv.some((value) => realpath(value).endsWith(path.join('payload', 'bin.js')))
const isProduction = process.env.NODE_ENV === 'production'
/** Do not require Worker secrets during Next.js production build. */
const isNextBuild =
  process.env.npm_lifecycle_event === 'build' ||
  process.env.NEXT_PHASE === 'phase-production-build'

type LogBindings = Record<string, unknown>

const createLog =
  (level: string, fn: typeof console.log, bindings: LogBindings = {}) =>
  (objOrMsg: object | string, msg?: string) => {
    if (typeof objOrMsg === 'string') {
      fn(JSON.stringify({ level, ...bindings, msg: objOrMsg }))
    } else {
      fn(
        JSON.stringify({
          level,
          ...bindings,
          ...objOrMsg,
          msg: msg ?? (objOrMsg as { msg?: string }).msg,
        }),
      )
    }
  }

function makeCloudflareLogger(bindings: LogBindings = {}): PayloadLogger {
  return {
    level: process.env.PAYLOAD_LOG_LEVEL || 'info',
    trace: createLog('trace', console.debug, bindings),
    debug: createLog('debug', console.debug, bindings),
    info: createLog('info', console.log, bindings),
    warn: createLog('warn', console.warn, bindings),
    error: createLog('error', console.error, bindings),
    fatal: createLog('fatal', console.error, bindings),
    silent: () => {},
    child: (childBindings: LogBindings) => makeCloudflareLogger({ ...bindings, ...childBindings }),
  } as unknown as PayloadLogger
}

const cloudflareLogger = makeCloudflareLogger()

/** During `next build`, use local Miniflare bindings (same pattern as Payload Cloudflare template + OpenNext). */
const cloudflare =
  isCLI || !isProduction || isNextBuild
    ? await getCloudflareContextFromWrangler()
    : await getCloudflareContext({ async: true })

const payloadSecretFromBinding = (cloudflare.env as Cloudflare.Env).PAYLOAD_SECRET
const payloadSecret =
  process.env.PAYLOAD_SECRET?.trim() ||
  (typeof payloadSecretFromBinding === 'string' ? payloadSecretFromBinding.trim() : '') ||
  ''

/**
 * `getPayload` rejects an empty `secret`. CI / `next build` often has no PAYLOAD_SECRET in
 * `process.env` (Worker runtime secrets are not the same as the Git build environment).
 * Use a non-empty placeholder only for the build phase; real deployments still require
 * `payloadSecret` (see check below) or Worker bindings.
 */
const payloadSecretForConfig =
  isNextBuild && !payloadSecret
    ? '__PAYLOAD_NEXT_BUILD_PLACEHOLDER_NOT_USED_AT_RUNTIME__'
    : payloadSecret

if (isProduction && !isNextBuild && !isCLI && !payloadSecret) {
  throw new Error(
    'PAYLOAD_SECRET is required in production. Set a Worker secret (e.g. wrangler secret put PAYLOAD_SECRET) or Variables in the Cloudflare dashboard. The value used only for CI migrate is not available to the deployed Worker.',
  )
}

const serverURLFromEnv = (cloudflare.env as Cloudflare.Env).PAYLOAD_PUBLIC_SERVER_URL
const serverURL =
  isProduction && !isNextBuild
    ? (process.env.PAYLOAD_PUBLIC_SERVER_URL?.trim() ||
        (typeof serverURLFromEnv === 'string' ? serverURLFromEnv.trim() : '') ||
        '')
    : ''

/**
 * Without `plugin_ai_instructions` (migration `20260428_120000_plugin_ai_instructions`), onInit
 * seed would throw `no such table` and 500 the whole Admin. Skip seed until migrations apply.
 */
let hasPluginAiInstructionsTable = true
try {
  const d1 = cloudflare.env.D1
  if (d1) {
    const row = await d1
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='plugin_ai_instructions'")
      .first<{ name: string }>()
    hasPluginAiInstructionsTable = Boolean(row?.name)
  } else {
    hasPluginAiInstructionsTable = false
  }
} catch {
  hasPluginAiInstructionsTable = false
}

if (!hasPluginAiInstructionsTable && isProduction && !isNextBuild && !isCLI) {
  console.warn(
    '[payload] plugin_ai_instructions table missing (run `pnpm run deploy:database` or `payload migrate`). Skipping Payload AI generatePromptOnInit until migrations apply.',
  )
}

const openRouterModelOptions = await safeFetchOpenRouterModelOptions({
  isNextBuild,
  isCli: isCLI,
  isProduction,
})

export default buildConfig({
  serverURL,
  /** Browser tab titles for Payload Admin are rewritten client-side in `AdminBrandingEffects` when `admin-branding.brandName` is set; `admin.meta` (e.g. titleSuffix) does not replace that pass. */
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    components: {
      providers: ['./components/AdminBrandingProvider#AdminBrandingProvider'],
      beforeNavLinks: ['./components/KnowledgeReadNavLink#KnowledgeReadNavLink'],
      beforeDashboard: ['./components/BeforeDashboardMilestone#BeforeDashboardMilestone'],
      graphics: {
        Icon: './components/AdminBrandingIcon#AdminBrandingIcon',
        Logo: './components/AdminBrandingLogo#AdminBrandingLogo',
      },
      /** 仅保留运营看板，隐藏默认「首页 / 网站 / …」集合快捷卡片 */
      views: {
        dashboard: {
          Component: './components/MinimalDashboard#MinimalDashboard',
        },
      },
    },
  },
  collections: [
    Announcements,
    SitePortfolios,
    Sites,
    SiteBlueprints,
    SiteLayouts,
    Categories,
    Pages,
    Redirects,
    AffiliateNetworks,
    Offers,
    SocialPlatforms,
    SocialAccounts,
    Media,
    Keywords,
    ContentBriefs,
    SerpSnapshots,
    Articles,
    Authors,
    Rankings,
    WorkflowJobs,
    SiteQuotas,
    ClickEvents,
    Commissions,
    Teams,
    KnowledgeBase,
    OperationManuals,
    AuditLogs,
    Tenants,
    Users,
    OriginalEvidence,
    PageLinkGraph,
  ],
  globals: [
    CommissionRules,
    PublicLanding,
    QuotaRules,
    AdminBranding,
    LlmPrompts,
    PromptLibrary,
    PipelineSettings,
  ],
  editor: lexicalEditorWithAi(),
  secret: payloadSecretForConfig,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteD1Adapter({
    binding: cloudflare.env.D1,
    /**
     * Dev `pushDevSchema` would re-apply indexes already created by SQL migrations → duplicate
     * `CREATE INDEX` (e.g. `announcements_tenant_idx`). Schema changes go through `src/migrations/`.
     */
    push: false,
  }),
  logger: isProduction ? cloudflareLogger : undefined,
  plugins: [
    multiTenantPlugin<Config>({
      /**
       * When true (default), plugin wraps tenants `read` so users with zero assigned
       * tenants get no access — Admin hides Tenants + tenant-scoped collections from nav.
       * We keep collection-level rules in Tenants.ts (read: any logged-in user; writes: super-admin).
       */
      useTenantsCollectionAccess: false,
      /** 租户在 `Users` 中手写字段并排在 `teamLead` 等之前，避免插件 `push` 到表单末尾。 */
      tenantsArrayField: { includeDefaultField: false },
      collections: {
        announcements: {},
        'site-portfolios': {},
        sites: {},
        'site-quotas': {},
        'site-blueprints': {
          tenantFieldOverrides: {
            hooks: {
              beforeChange: [syncBlueprintTenantFromSiteTenantFieldBeforeChange],
            },
          },
        },
        'affiliate-networks': {},
        offers: {},
        'click-events': {},
        commissions: {},
        categories: {},
        articles: {},
        pages: {},
        redirects: {},
        keywords: {},
        'content-briefs': {},
        'serp-snapshots': {},
        authors: {},
        'original-evidence': {},
        'page-link-graph': {},
        'workflow-jobs': {},
        'knowledge-base': {},
        'operation-manuals': {},
        rankings: {},
        'audit-logs': {},
        teams: {},
        'social-platforms': {},
        'social-accounts': {},
        /**
         * When tenant access wrapping is on, users with no `tenants[]` assignment cannot `read`
         * media — sidebar entry disappears. Disable wrapping so Media uses collection `access` only.
         */
        media: { useTenantAccess: false },
      },
      userHasAccessToAllTenants: (user) => userHasUnscopedAdminAccess(user),
    }),
    // @ai-stack plugin typings recurse deeply with `Config`; `opts: any` avoids `tsc` stack overflow in this repo.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cast only
    (payloadAiPlugin as (opts: any) => import('payload').Plugin)({
      collections: {
        articles: true,
        pages: true,
        'knowledge-base': true,
      },
      /**
       * Base models from `OpenAIConfig` so `isPluginActivated` is true even if
       * `defaultGenerationModels` from the package was built with empty `process.env` (Workers isolate).
       * When `OPENAI_BASE_URL` is OpenRouter, `applyOpenRouterToGenerationModels` fills dropdowns.
       */
      generationModels: () => {
        const base = [...OpenAIConfig.models]
        return applyOpenRouterToGenerationModels(base, openRouterModelOptions)
      },
      overrideInstructions: {
        admin: {
          group: 'Plugins',
          hidden: false,
        },
      },
      /**
       * Seeds `plugin-ai-instructions` on init so Lexical/Compose has instruction ids.
       * - **Development:** on (same as `NODE_ENV !== 'production'`).
       * - **Production:** off unless `PAYLOAD_SEED_AI_PROMPTS=true` (set in Cloudflare, deploy once to seed, then remove).
       * - **If D1 lacks `plugin_ai_instructions`:** always off; run migrations first.
       */
      generatePromptOnInit:
        hasPluginAiInstructionsTable &&
        (process.env.NODE_ENV !== 'production' || process.env.PAYLOAD_SEED_AI_PROMPTS === 'true'),
      /** Static seeds only (no top-level `prompt`/`system`) → no `systemGenerate` / OpenAI call on boot. */
      seedPrompts: aiPluginSeedPrompts,
      debugging: process.env.NODE_ENV !== 'production',
      uploadCollectionSlug: 'media',
      access: {
        generate: ({ req }: { req: import('payload').PayloadRequest }) => Boolean(req.user),
        settings: ({ req }: { req: import('payload').PayloadRequest }) => Boolean(req.user),
      },
    }),
    seoPlugin({
      collections: ['articles', 'pages'],
      uploadsCollection: 'media',
      tabbedUI: true,
      generateTitle: ({ doc }) => {
        const d = doc as { title?: string | null }
        const t = d.title?.trim()
        return t ? String(t) : ''
      },
      generateDescription: ({ doc }) => {
        const d = doc as { excerpt?: string | null }
        const x = d.excerpt?.trim()
        return x ? String(x) : ''
      },
      generateImage: ({ doc }) => {
        const id = seoUploadRelationId((doc as { featuredImage?: unknown }).featuredImage)
        return id ?? undefined
      },
      generateURL: ({ doc, collectionSlug }) => {
        const d = doc as { slug?: string | null; locale?: string | null }
        const slug = d.slug?.trim()
        const loc = (d.locale?.trim() || 'zh') as string
        if (!slug) return ''
        if (collectionSlug === 'articles') return `/${loc}/posts/${encodeURIComponent(slug)}`
        if (collectionSlug === 'pages') return `/${loc}/pages/${encodeURIComponent(slug)}`
        return ''
      },
      /** Avoid locale-specific meta columns until app `localization` is enabled. */
      fields: ({ defaultFields }) =>
        defaultFields.map((field) => {
          if (
            typeof field === 'object' &&
            field !== null &&
            'name' in field &&
            typeof (field as { name: string }).name === 'string' &&
            ['title', 'description', 'image'].includes((field as { name: string }).name)
          ) {
            return { ...field, localized: false }
          }
          return field
        }),
    }),
    workflowsPlugin({
      enabled: true,
      collectionTriggers: {
        articles: { afterChange: true },
        pages: { afterChange: true },
      },
      steps: [
        HttpRequestStepTask,
        CreateDocumentStepTask,
        ReadDocumentStepTask,
        UpdateDocumentStepTask,
        DeleteDocumentStepTask,
        SendEmailStepTask,
      ],
    }),
    r2Storage({
      bucket: cloudflare.env.R2,
      collections: { media: true },
    }),
    mcpPlugin({
      collections: {
        tenants: {
          enabled: true,
          description:
            'Tenant records (name, slug, domain). Super-admin API keys receive full MCP CRUD; others follow API key checkboxes.',
        },
        users: {
          enabled: true,
          description:
            'Admin users (email, roles, tenant assignments). Super-admin keys get full MCP CRUD; redact secrets in responses as needed.',
        },
        media: {
          enabled: true,
          description: 'Uploads in R2 (alt text and file metadata).',
        },
        sites: {
          enabled: true,
          description:
            'Affiliate / rank-and-rent sites (domain, status, layout). Design docs link via site-blueprints.site. Super-admin API keys receive full MCP CRUD.',
        },
        'affiliate-networks': {
          enabled: true,
          description: 'Affiliate program / network records.',
        },
        offers: {
          enabled: true,
          description: 'Offers linked to networks and optional site allowlists.',
        },
        categories: {
          enabled: true,
          description: 'Content taxonomy for posts and pages.',
        },
        articles: {
          enabled: true,
          description: 'Articles (Lexical body, optional site and categories).',
        },
        pages: {
          enabled: true,
          description: 'Pages / landers (Lexical body, optional site and categories).',
        },
        keywords: {
          enabled: true,
          description: 'SEO / research keywords optionally scoped to a site.',
        },
        'workflow-jobs': {
          enabled: true,
          description: 'Automation jobs (publish, sync, AI, custom) with JSON payloads.',
        },
        'knowledge-base': {
          enabled: true,
          description: 'Internal knowledge base entries (Lexical body, optional site scope).',
        },
        rankings: {
          enabled: true,
          description: 'SERP ranking snapshots linked to keywords and sites.',
        },
        'site-portfolios': {
          enabled: true,
          description:
            'SEO matrix site portfolios (batch/project grouping); link from sites.portfolio.',
        },
      },
      overrideApiKeyCollection: (collection) => ({
        ...collection,
        admin: {
          ...collection.admin,
          group: adminGroups.system,
        },
      }),
      overrideAuth: async (_req, getDefaultMcpAccessSettings) => {
        const settings = await getDefaultMcpAccessSettings()
        if (!userHasUnscopedAdminAccess(settings.user)) {
          return settings
        }
        return expandMcpAccessForSuperAdmin(settings, mcpCollectionSlugs)
      },
      mcp: {
        handlerOptions: {
          verboseLogs: true,
        },
      },
    }),
  ],
})

// Adapted from https://github.com/opennextjs/opennextjs-cloudflare/blob/d00b3a13e42e65aad76fba41774815726422cc39/packages/cloudflare/src/api/cloudflare-context.ts#L328C36-L328C46
function getCloudflareContextFromWrangler(): Promise<CloudflareContext> {
  return import(/* webpackIgnore: true */ `${'__wrangler'.replaceAll('_', '')}`).then(
    ({ getPlatformProxy }) =>
      getPlatformProxy({
        environment: process.env.CLOUDFLARE_ENV,
        remoteBindings: isProduction && !isNextBuild,
      } satisfies GetPlatformProxyOptions),
  )
}

function seoUploadRelationId(value: unknown): number | string | null {
  if (value == null) return null
  if (typeof value === 'number' && !Number.isNaN(value)) return value
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id: unknown }).id
    if (typeof id === 'number' || typeof id === 'string') return id
  }
  return null
}
