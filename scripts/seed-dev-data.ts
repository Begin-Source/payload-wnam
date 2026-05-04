/**
 * 本地开发库灌入测试数据（幂等：固定 slug/email，已存在则跳过）。
 * 双租户：seed-alpha（联盟/评测）与 seed-beta（B2B 线索/白皮书）。
 * Usage: pnpm seed:dev
 */
import 'dotenv/config'

import type { Payload } from 'payload'
import type { PayloadRequest } from 'payload'
import { getPayload } from 'payload'
import type { SQLiteAdapter } from '@payloadcms/db-d1-sqlite'
import type { User } from '../src/payload-types.js'
import config from '../src/payload.config.js'

const PASSWORD = 'SeedTest123!'

const EMAILS = {
  superadmin: 'seed.superadmin@local.test',
  finance: 'seed.finance@local.test',
  ops: 'seed.ops@local.test',
  lead: 'seed.lead@local.test',
  sitemgr: 'seed.sitemgr@local.test',
  betaSitemgr: 'seed.beta.sitemgr@local.test',
} as const

type SeedUserDoc = User & { id: number }

type SiteSpec = { slug: string; name: string; primaryDomain: string }

type TenantProfile = {
  slug: string
  name: string
  rootDomain: string
  sites: [SiteSpec, SiteSpec]
  network: { slug: string; name: string; websiteUrl: string }
  offers: Array<{ slug: string; title: string; targetUrl: string }>
  /** [siteIndex, category index 0|1 per site] */
  categories: [
    { slug: string; name: string; siteIndex: 0 | 1 },
    { slug: string; name: string; siteIndex: 0 | 1 },
  ]
  articles: Array<{
    slug: string
    title: string
    siteIndex: 0 | 1
    catKey: 0 | 1
    locale?: 'zh' | 'en'
    excerpt?: string
    bodyLines?: string[]
  }>
  pages: Array<{
    slug: string
    title: string
    siteIndex: 0 | 1
    catKey: 0 | 1
    locale?: 'zh' | 'en'
    excerpt?: string
    /** One Lexical paragraph for public static pages (e.g. about / contact / privacy). */
    bodyLine?: string
  }>
  keyword: { slug: string; term: string; siteIndex: 0 | 1 }
  ranking: { searchQuery: string; serpPosition: number }
  workflowLabel: string
  workflowJobType: 'publish' | 'sync' | 'ai_generate' | 'custom'
  socialPlatformSlug: string
  socialPlatformName: string
  socialHandle: string
  knowledge: { slug: string; title: string; siteIndex: 0 | 1; catKey: 0 | 1 }
  announcementTitle: string
  announcementBody: string
  clickDestinationUrl: string
  commissionNotes: string
}

const TENANT_PROFILES: [TenantProfile, TenantProfile] = [
  {
    slug: 'seed-alpha',
    name: 'Seed Alpha 租户',
    rootDomain: 'seed-alpha.local.test',
    sites: [
      {
        slug: 'seed-site-a',
        name: 'Alpha 主站 · 评测与落地',
        primaryDomain: 'site-a.seed.local.test',
      },
      {
        slug: 'seed-site-b',
        name: 'Alpha 子站 · 垂直转化',
        primaryDomain: 'site-b.seed.local.test',
      },
    ],
    network: {
      slug: 'seed-network',
      name: 'Alpha 联盟计划',
      websiteUrl: 'https://example.com/alpha-program',
    },
    offers: [
      {
        slug: 'seed-offer-1',
        title: 'Alpha 主推 Offer · 路由器联盟',
        targetUrl: 'https://example.com/alpha-offer-main',
      },
      {
        slug: 'seed-offer-2',
        title: 'Alpha 备用 Offer · 季节性活动',
        targetUrl: 'https://example.com/alpha-offer-alt',
      },
    ],
    categories: [
      { slug: 'seed-cat-a', name: '评测对比', siteIndex: 0 },
      { slug: 'seed-cat-b', name: '优惠活动', siteIndex: 1 },
    ],
    articles: [
      {
        slug: 'seed-article-a',
        title: '2025 家用路由器横评：性能与联盟链接策略',
        siteIndex: 0,
        catKey: 0,
        excerpt: '中文示例：列表摘要，分类「评测对比」。',
      },
      {
        slug: 'seed-article-a',
        title: '2025 Home Wi‑Fi Router Roundup (English demo)',
        siteIndex: 0,
        catKey: 0,
        locale: 'en',
        excerpt: 'Same slug as Chinese version; use header EN / 中文 to compare.',
      },
      {
        slug: 'seed-article-b',
        title: '黑五大促落地：追踪参数与转化复盘',
        siteIndex: 1,
        catKey: 1,
        excerpt: '中文示例：第二站点 seed-site-b。',
        bodyLines: [
          '这是 Template1 演示站的一篇基础文章，用来检查文章详情页是否套用整站模版。',
          '我们会重点观察顶栏、页脚、信任模块、联盟披露、作者信息和相关文章区域是否保持统一。',
          '如果你在整站模版 CSV 中修改 t1_locale_json，这里的阅读时间、更新标签和信任区文案会一起变化。',
        ],
      },
      {
        slug: 'seed-article-b',
        title: 'Black Friday promo: tracking & conversion (EN)',
        siteIndex: 1,
        catKey: 1,
        locale: 'en',
        excerpt: 'English article on seed-site-b.',
        bodyLines: [
          'This Template1 demo article verifies that article pages inherit the whole-site theme.',
          'Use it to check the header, footer, disclosure panel, trust sidebar, and related articles.',
          'When you change t1_locale_json in the site template CSV, the article chrome should follow.',
        ],
      },
      {
        slug: 'template1-air-purifier-guide',
        title: 'Template1 演示：小户型空气净化器怎么选',
        siteIndex: 1,
        catKey: 1,
        excerpt: '用于预览 Template1 首页列表、文章详情和相关文章区的中文模拟文章。',
        bodyLines: [
          '小户型空气净化器最容易踩的坑，是只看 CADR 数值而忽略噪音、滤芯成本和摆放空间。',
          '我们建议先确认房间面积，再比较睡眠档噪音、滤芯更换周期和是否支持本地化售后。',
          '如果是卧室使用，低噪音和稳定的自动模式通常比极限净化速度更重要。',
        ],
      },
      {
        slug: 'template1-standing-desk-review',
        title: 'Template1 演示：升降桌长期使用体验清单',
        siteIndex: 1,
        catKey: 1,
        excerpt: '一篇偏评测口吻的模拟文章，用于观察 Template1 字体、间距和信任侧栏。',
        bodyLines: [
          '升降桌的体验不只取决于电机数量，还取决于桌腿稳定性、最低高度和控制器记忆位。',
          '如果你每天切换坐站姿势，按键手感和升降噪音会比参数表上看起来更重要。',
          '本地演示数据不会包含真实购买链接，但页面会显示联盟披露和编辑信任说明。',
        ],
      },
      {
        slug: 'template1-wireless-earbuds-picks',
        title: 'Template1 Demo: Wireless earbuds picks for daily calls',
        siteIndex: 1,
        catKey: 1,
        locale: 'en',
        excerpt: 'English mock article for checking Template1 article layout and related cards.',
        bodyLines: [
          'For daily calls, microphone consistency matters more than dramatic bass or headline battery numbers.',
          'We compare comfort, multipoint reliability, transparency mode, and how quickly the case tops up the earbuds.',
          'This seeded article is intentionally lightweight so the Template1 article layout is easy to inspect.',
        ],
      },
      {
        slug: 'template1-robot-vacuum-buying-guide',
        title: 'Template1 Demo: Robot vacuum buying guide',
        siteIndex: 1,
        catKey: 1,
        locale: 'en',
        excerpt:
          'A second English article so Template1 related articles and home lists feel populated.',
        bodyLines: [
          'Robot vacuum recommendations depend on floor type, obstacle density, mapping quality, and maintenance tolerance.',
          'A self-emptying dock is useful, but brush design and edge cleaning often decide whether a model works day to day.',
          'Use this article to preview English Template1 copy, read-time labels, and related article cards.',
        ],
      },
    ],
    pages: [
      {
        slug: 'seed-page-a',
        title: '限时优惠落地页 · Alpha',
        siteIndex: 0,
        catKey: 0,
        excerpt: '独立页面（中文）→ /zh/pages/seed-page-a',
      },
      {
        slug: 'seed-page-a',
        title: 'Limited-time offer landing (EN)',
        siteIndex: 0,
        catKey: 0,
        locale: 'en',
        excerpt: 'English page → /en/pages/seed-page-a',
      },
      {
        slug: 'about',
        title: '【演示】关于 Alpha 子站',
        siteIndex: 1,
        catKey: 1,
        excerpt: 'Template1 演示 · 根路径 /zh/about',
        bodyLine:
          '这是种子数据中的「关于」页（中文）。顶栏若开启「使用 Page 标题」，应显示与标题一致的导航文案。',
      },
      {
        slug: 'about',
        title: '[Demo] About this vertical site',
        siteIndex: 1,
        catKey: 1,
        locale: 'en',
        excerpt: 'Template1 seed · /en/about',
        bodyLine:
          'This is the About page (EN) for the Template1 demo site. Nav label can follow this title when the toggle is on.',
      },
      {
        slug: 'contact',
        title: '【演示】联系与咨询',
        siteIndex: 1,
        catKey: 1,
        excerpt: 'Template1 演示 · /zh/contact',
        bodyLine: '联系页正文示例：邮箱、表单或合作说明可放在此处（种子占位）。',
      },
      {
        slug: 'contact',
        title: '[Demo] Contact us',
        siteIndex: 1,
        catKey: 1,
        locale: 'en',
        excerpt: 'Template1 seed · /en/contact',
        bodyLine: 'Contact page body (EN) — seed placeholder for email or form copy.',
      },
      {
        slug: 'privacy',
        title: '【演示】隐私与数据说明',
        siteIndex: 1,
        catKey: 1,
        excerpt: 'Template1 演示 · /zh/privacy',
        bodyLine: '隐私政策正文占位：说明收集哪些数据、用途与保留期限（仅演示文案）。',
      },
      {
        slug: 'privacy',
        title: '[Demo] Privacy',
        siteIndex: 1,
        catKey: 1,
        locale: 'en',
        excerpt: 'Template1 seed · /en/privacy',
        bodyLine: 'Privacy policy body (EN) — seed placeholder; replace with your legal text.',
      },
    ],
    keyword: { slug: 'seed-keyword-1', term: 'best wifi router 2025', siteIndex: 0 },
    ranking: { searchQuery: 'alpha router review serp', serpPosition: 4 },
    workflowLabel: 'Alpha · 发布队列（种子）',
    workflowJobType: 'publish',
    socialPlatformSlug: 'seed-platform',
    socialPlatformName: 'Seed Platform (Alpha)',
    socialHandle: 'alpha_seed_social',
    knowledge: {
      slug: 'alpha-kb-playbook',
      title: '联盟运营手册（Alpha）',
      siteIndex: 0,
      catKey: 0,
    },
    announcementTitle: '【测试】系统公告',
    announcementBody: '这是一条种子系统公告（Seed Alpha），用于本地与多租户测试。',
    clickDestinationUrl: 'https://seed-track.local/alpha-click-1',
    commissionNotes: 'seed:commission-alpha-1',
  },
  {
    slug: 'seed-beta',
    name: 'Seed Beta 租户',
    rootDomain: 'seed-beta.local.test',
    sites: [
      {
        slug: 'beta-saas-main',
        name: 'Beta B2B 工具主站',
        primaryDomain: 'saas.beta.local.test',
      },
      {
        slug: 'beta-whitepaper',
        name: 'Beta 白皮书落地站',
        primaryDomain: 'whitepaper.beta.local.test',
      },
    ],
    network: {
      slug: 'seed-network-beta',
      name: 'Beta Partner Hub',
      websiteUrl: 'https://example.com/beta-partners',
    },
    offers: [
      {
        slug: 'beta-offer-main',
        title: '企业版试用 · SaaS 注册转化',
        targetUrl: 'https://example.com/beta-trial',
      },
      {
        slug: 'beta-offer-lead',
        title: '白皮书下载 · 线索收集',
        targetUrl: 'https://example.com/beta-whitepaper',
      },
    ],
    categories: [
      { slug: 'beta-cat-product', name: '产品功能', siteIndex: 0 },
      { slug: 'beta-cat-lead', name: '线索内容', siteIndex: 1 },
    ],
    articles: [
      {
        slug: 'beta-article-crm',
        title: '中小企业 CRM 选型：从线索到成交',
        siteIndex: 0,
        catKey: 0,
        excerpt: 'Beta 中文；预览加 ?site=beta-saas-main',
      },
      {
        slug: 'beta-article-crm',
        title: 'SMB CRM selection: lead to close (EN)',
        siteIndex: 0,
        catKey: 0,
        locale: 'en',
        excerpt: 'Beta English mirror for hreflang.',
      },
      {
        slug: 'beta-article-whitepaper',
        title: '2025 B2B 内容营销白皮书导读',
        siteIndex: 1,
        catKey: 1,
      },
      {
        slug: 'beta-article-whitepaper',
        title: '2025 B2B content marketing whitepaper (EN)',
        siteIndex: 1,
        catKey: 1,
        locale: 'en',
      },
    ],
    pages: [
      {
        slug: 'beta-page-demo',
        title: '预约演示落地页',
        siteIndex: 0,
        catKey: 0,
      },
      {
        slug: 'beta-page-demo',
        title: 'Book a demo (EN)',
        siteIndex: 0,
        catKey: 0,
        locale: 'en',
      },
    ],
    keyword: { slug: 'beta-keyword-main', term: 'b2b crm comparison', siteIndex: 0 },
    ranking: { searchQuery: 'beta saas crm serp', serpPosition: 7 },
    workflowLabel: 'Beta · 线索同步（种子）',
    workflowJobType: 'sync',
    socialPlatformSlug: 'seed-platform-beta',
    socialPlatformName: 'Seed Platform (Beta)',
    socialHandle: 'beta_seed_social',
    knowledge: {
      slug: 'beta-kb-onboarding',
      title: 'B2B 线索入库流程（Beta）',
      siteIndex: 0,
      catKey: 0,
    },
    announcementTitle: '【Beta】B2B 线索租户上线说明',
    announcementBody: '本租户用于 B2B 工具线索、白皮书与落地页测试数据。',
    clickDestinationUrl: 'https://seed-track.local/beta-click-1',
    commissionNotes: 'seed:commission-beta-1',
  },
]

/** 写入 `site-blueprints.t1LocaleJson`（`seed-site-b` 设计稿）的演示键值。 */
const SEED_ALPHA_TEMPLATE1_DEMO: Record<string, string | boolean> = {
  t1NavUsePageTitleForAbout: true,
  t1NavUsePageTitleForContact: true,
  t1NavAllReviewsEn: '[Demo] All reviews',
  t1NavAllReviewsZh: '【演示】全部文章',
  t1NavCategoriesEn: '[Demo] Categories',
  t1NavCategoriesZh: '【演示】分类',
  t1NavAboutEn: '[Demo] About (fallback if no page title)',
  t1NavAboutZh: '【演示】关于',
  t1NavContactEn: '[Demo] Contact (fallback if no page title)',
  t1NavContactZh: '【演示】联系',
  t1NavPrivacyEn: '[Demo] Privacy',
  t1NavPrivacyZh: '【演示】隐私',
  t1NavSearchSrEn: '[Demo] Search the site',
  t1NavSearchSrZh: '【演示】搜索本站',
  t1NavMenuSrEn: '[Demo] Open menu',
  t1NavMenuSrZh: '【演示】打开菜单',
  t1HomeTitleEn: '[Demo] Unbiased reviews & guides',
  t1HomeTitleZh: '【演示】客观评测与选购指南',
  t1HomeSubtitleEn: '[Demo] Template1 home subtitle — this copy comes from the site record (seed).',
  t1HomeSubtitleZh: '【演示】首页副标题由站点 Template1 文案区写入（本行为种子模拟数据）。',
  t1BrowseCategoryEn: '[Demo] Browse by category',
  t1BrowseCategoryZh: '【演示】按分类浏览',
  t1AboutSidebarTitleEn: '[Demo] About {{siteName}}',
  t1AboutSidebarTitleZh: '【演示】关于 {{siteName}}',
  t1FullStoryEn: '[Demo] Read the full story',
  t1FullStoryZh: '【演示】阅读全文',
  t1TopPicksEn: "[Demo] Editors' picks",
  t1TopPicksZh: '【演示】编辑精选',
  t1BestInEn: '[Demo] Best in {{category}}',
  t1BestInZh: '【演示】{{category}} 精选',
  t1FullReviewEn: '[Demo] Full review',
  t1FullReviewZh: '【演示】完整评测',
  t1MoreTopPicksEn: '[Demo] More top picks',
  t1MoreTopPicksZh: '【演示】更多精选',
  t1WhyTrustEn: '[Demo] Why you can trust us',
  t1WhyTrustZh: '【演示】为何可信',
  t1Trust1TitleEn: '[Demo] Independent testing',
  t1Trust1TitleZh: '【演示】独立测试',
  t1Trust1DescEn:
    '[Demo] We buy products at retail; methods are described in our editorial policy.',
  t1Trust1DescZh: '【演示】商品多为自费购买；方法见编辑准则。（种子示例）',
  t1Trust2TitleEn: '[Demo] Transparent links',
  t1Trust2TitleZh: '【演示】联盟披露',
  t1Trust2DescEn:
    '[Demo] When you buy through our links, we may earn a commission at no extra cost to you.',
  t1Trust2DescZh: '【演示】通过联盟链接完成购买时，我们可能获得分成，不额外向读者收费。',
  t1Trust3TitleEn: '[Demo] Updated regularly',
  t1Trust3TitleZh: '【演示】持续更新',
  t1Trust3DescEn:
    '[Demo] We revisit picks when prices or models change; date reflects last major update.',
  t1Trust3DescZh: '【演示】价格或型号变化时会回访榜单；日期为最近一次大改版。',
  t1LearnHowWeTestEn: '[Demo] How we test',
  t1LearnHowWeTestZh: '【演示】我们如何测试',
  t1UpdatedEn: '[Demo] Updated',
  t1UpdatedZh: '【演示】更新于',
  t1MinReadEn: '[Demo] {{n}} min read',
  t1MinReadZh: '【演示】约 {{n}} 分钟阅读',
  t1FooterCategoriesHeadingEn: '[Demo] Categories',
  t1FooterCategoriesHeadingZh: '【演示】分类',
  t1FooterCompanyHeadingEn: '[Demo] Company',
  t1FooterCompanyHeadingZh: '【演示】站点与合规',
  t1FooterAffiliateLabelEn: '[Demo] Affiliate disclosure',
  t1FooterAffiliateLabelZh: '【演示】联盟披露',
  t1FooterCopyrightEn: '© {{year}} {{siteName}} · [Demo] seed copy',
  t1FooterCopyrightZh: '© {{year}} {{siteName}} · 【演示】种子版权行',
  t1FooterBottomEn:
    '[Demo] Template1 footer note — for local preview only; not legal or production text.',
  t1FooterBottomZh: '【演示】页脚说明行，仅作本地 Template1 预览，非正式法律或生产文案。',
}

type LexicalText = {
  type: 'text'
  text: string
  version: number
  format: number
  style: string
  mode: 'normal'
  detail: number
}

function textPara(line: string): {
  type: 'paragraph'
  format: string
  indent: number
  version: number
  textFormat: number
  textStyle: string
  direction: 'ltr'
  children: LexicalText[]
} {
  return {
    type: 'paragraph',
    format: '',
    indent: 0,
    version: 1,
    textFormat: 0,
    textStyle: '',
    direction: 'ltr',
    children: line
      ? [
          {
            type: 'text',
            text: line,
            version: 1,
            format: 0,
            style: '',
            mode: 'normal',
            detail: 0,
          },
        ]
      : [],
  }
}

function minimalLexicalBody(lines: string | string[]): { root: Record<string, unknown> } {
  const inputLines = Array.isArray(lines) ? lines : [lines]
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: inputLines.map((line) => textPara(line)),
    },
  }
}

function superReq(user: SeedUserDoc): { req: Partial<PayloadRequest> } {
  return {
    req: {
      user: { ...user, collection: 'users' },
    },
  }
}

function whereTenantSlug(slug: string) {
  return { slug: { equals: slug } }
}

function whereTenantAndSlug(tenantId: number, slug: string) {
  return { and: [{ slug: { equals: slug } }, { tenant: { equals: tenantId } }] }
}

function whereTenantSlugLocale(tenantId: number, slug: string, locale: string) {
  return {
    and: [
      { slug: { equals: slug } },
      { tenant: { equals: tenantId } },
      { locale: { equals: locale } },
    ],
  }
}

function whereTenantSiteSlugLocale(tenantId: number, siteId: number, slug: string, locale: string) {
  return {
    and: [
      { slug: { equals: slug } },
      { tenant: { equals: tenantId } },
      { locale: { equals: locale } },
      { site: { equals: siteId } },
    ],
  }
}

/**
 * Payload `sites` field (camel) → SQLite column. Avoid `payload.update` on D1: it SELECTs all columns and hits
 * D1’s max result width (`too many columns in result set`).
 */
function siteDataKeyToSqlColumn(camel: string): string {
  return camel
    .replace(/([A-Z0-9])([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
}

/**
 * `UPDATE sites` with only the given columns. Returns true if executed via D1 client; false if no raw client (fall back to Payload).
 */
async function d1NarrowUpdateSites(
  payload: Payload,
  siteId: number,
  setPairs: Array<[string, string | number | null]>,
): Promise<boolean> {
  const db = payload.db as unknown as SQLiteAdapter
  const client = db.client
  if (client == null || typeof (client as { prepare?: unknown }).prepare !== 'function') {
    return false
  }
  const prep = (
    client as {
      prepare: (sql: string) => { bind: (...a: unknown[]) => { run: () => Promise<unknown> } }
    }
  ).prepare
  if (typeof prep !== 'function') return false

  const cols = setPairs.map(([c]) => `\`${c}\` = ?`).join(', ')
  const sql = `UPDATE \`sites\` SET ${cols} WHERE \`id\` = ?`
  const values = setPairs.map(([, v]) => v)
  const stmt = prep.call(client, sql)
  if (typeof stmt?.bind === 'function') {
    await stmt.bind(...values, siteId).run()
  } else {
    throw new Error('[seed:dev] D1 client prepare() has no bind(); cannot run narrow UPDATE')
  }
  return true
}

async function getSqliteTableColumnNames(
  payload: Payload,
  table: string,
): Promise<Set<string> | null> {
  const db = payload.db as unknown as SQLiteAdapter
  const client = db.client
  if (client == null || typeof (client as { prepare?: unknown }).prepare !== 'function') {
    return null
  }
  const res = await (
    client as { prepare: (q: string) => { all: <T>() => Promise<{ results?: T[] }> } }
  )
    .prepare(`PRAGMA table_info(\`${table}\`)`)
    .all<{ name: string }>()
  const rows = res.results ?? []
  if (rows.length === 0) return null
  return new Set(rows.map((r) => r.name))
}

/** Avoid `payload.create('site-blueprints')` which batch-loads full `sites` rows and hits D1 column limits. */
async function d1SeedEnsureSiteBlueprint(
  payload: Payload,
  input: {
    tenantId: number
    blueprintSlug: string
    name: string
    description: string
    site0Id: number
  },
): Promise<{ id: number } | null> {
  const db = payload.db as unknown as SQLiteAdapter
  const client = db.client
  if (client == null || typeof (client as { prepare?: unknown }).prepare !== 'function') {
    return null
  }
  const bpCols = await getSqliteTableColumnNames(payload, 'site_blueprints')
  if (!bpCols?.has('tenant_id') || !bpCols.has('slug')) return null

  const p = client as {
    prepare: (q: string) => {
      bind: (...a: unknown[]) => {
        all: <T>() => Promise<{ results?: T[] }>
        run: () => Promise<unknown>
      }
    }
  }
  const existing = await p
    .prepare('SELECT `id` FROM `site_blueprints` WHERE `tenant_id` = ? AND `slug` = ? LIMIT 1')
    .bind(input.tenantId, input.blueprintSlug)
    .all<{ id: number }>()
  const ex = existing.results?.[0]
  if (ex?.id != null) return { id: ex.id as number }

  const iso = new Date().toISOString()
  const insertCols = ['tenant_id', 'name', 'slug', 'description'] as string[]
  const insertVals: unknown[] = [input.tenantId, input.name, input.blueprintSlug, input.description]
  if (bpCols.has('site_id')) {
    insertCols.push('site_id')
    insertVals.push(input.site0Id)
  }
  if (bpCols.has('created_at')) {
    insertCols.push('created_at')
    insertVals.push(iso)
  }
  if (bpCols.has('updated_at')) {
    insertCols.push('updated_at')
    insertVals.push(iso)
  }
  const ph = insertCols.map(() => '?').join(', ')
  const csql = `INSERT INTO \`site_blueprints\` (${insertCols.map((c) => `\`${c}\``).join(', ')}) VALUES (${ph})`
  await p
    .prepare(csql)
    .bind(...insertVals)
    .run()
  const again = await p
    .prepare('SELECT `id` FROM `site_blueprints` WHERE `tenant_id` = ? AND `slug` = ? LIMIT 1')
    .bind(input.tenantId, input.blueprintSlug)
    .all<{ id: number }>()
  const row = again.results?.[0]
  if (row?.id == null) {
    throw new Error('[seed:dev] d1SeedEnsureSiteBlueprint: insert did not return id')
  }
  return { id: row.id as number }
}

async function d1EnsureCategoryRaw(
  payload: Payload,
  input: {
    tenantId: number
    pslug: string
    slug: string
    name: string
    siteId: number
  },
  /** When set, avoids a second PRAGMA (e.g. from tenant loop). */
  columnSet?: Set<string> | null,
): Promise<{ id: number }> {
  const c = (payload.db as unknown as SQLiteAdapter).client
  if (!c || typeof (c as { prepare?: unknown }).prepare !== 'function') {
    throw new Error('[seed:dev] d1EnsureCategoryRaw: no D1 client')
  }
  const p = c as {
    prepare: (q: string) => {
      bind: (...a: unknown[]) => {
        all: <T>() => Promise<{ results?: T[] }>
        run: () => Promise<unknown>
      }
    }
  }
  const catCols =
    columnSet != null ? columnSet : await getSqliteTableColumnNames(payload, 'categories')
  if (!catCols?.has('slug') || !catCols.has('tenant_id')) {
    throw new Error('[seed:dev] d1EnsureCategoryRaw: categories table missing slug/tenant_id')
  }
  const hasSite = catCols.has('site_id')
  const hasLocale = catCols.has('locale')
  const seedLocale = 'en'
  const iso = new Date().toISOString()
  const desc = `Seed category · ${input.pslug}`

  let selectWhere: string
  let selectBind: (string | number)[]
  if (hasSite && hasLocale) {
    selectWhere =
      'SELECT `id` FROM `categories` WHERE `slug` = ? AND `tenant_id` = ? AND `site_id` = ? AND `locale` = ? LIMIT 1'
    selectBind = [input.slug, input.tenantId, input.siteId, seedLocale]
  } else if (hasSite) {
    selectWhere =
      'SELECT `id` FROM `categories` WHERE `slug` = ? AND `tenant_id` = ? AND `site_id` = ? LIMIT 1'
    selectBind = [input.slug, input.tenantId, input.siteId]
  } else {
    selectWhere = 'SELECT `id` FROM `categories` WHERE `slug` = ? AND `tenant_id` = ? LIMIT 1'
    selectBind = [input.slug, input.tenantId]
  }

  const ex = await p
    .prepare(selectWhere)
    .bind(...selectBind)
    .all<{ id: number }>()
  if (ex.results?.[0]?.id != null) {
    return { id: ex.results[0].id as number }
  }

  if (hasSite && hasLocale) {
    await p
      .prepare(
        'INSERT INTO `categories` (`name`, `slug`, `site_id`, `tenant_id`, `locale`, `description`, `updated_at`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(input.name, input.slug, input.siteId, input.tenantId, seedLocale, desc, iso, iso)
      .run()
  } else if (hasSite) {
    await p
      .prepare(
        'INSERT INTO `categories` (`name`, `slug`, `site_id`, `tenant_id`, `description`, `updated_at`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(input.name, input.slug, input.siteId, input.tenantId, desc, iso, iso)
      .run()
  } else {
    await p
      .prepare(
        'INSERT INTO `categories` (`name`, `slug`, `tenant_id`, `description`, `updated_at`, `created_at`) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(input.name, input.slug, input.tenantId, desc, iso, iso)
      .run()
  }

  const again = await p
    .prepare(selectWhere)
    .bind(...selectBind)
    .all<{ id: number }>()
  const id = again.results?.[0]?.id
  if (id == null) throw new Error('[seed:dev] d1EnsureCategoryRaw: insert id missing')
  console.info(
    '[seed:dev] d1 category',
    input.slug,
    'id',
    id,
    hasSite ? `site=${input.siteId}` : 'no site_id col',
  )
  return { id: id as number }
}

/**
 * D1: `payload.create` on `pages` / `articles` validates the `site` relationship via a full-`sites` `find`,
 * which hits SQLite/D1’s max result width. Seed with narrow INSERTs + `*_rels` instead.
 */
async function d1EnsurePageOrArticleRaw(
  table: 'pages' | 'articles',
  payload: Payload,
  tableCols: Set<string>,
  relTable: 'pages_rels' | 'articles_rels',
  relCols: Set<string> | null,
  input: {
    tenantId: number
    siteId: number
    slug: string
    locale: 'zh' | 'en'
    title: string
    excerpt?: string
    bodyJson: string | null
    categoryIds: number[]
  },
  pageScoped: boolean,
): Promise<void> {
  if (!tableCols.has('title') || !tableCols.has('tenant_id') || !tableCols.has('slug')) {
    throw new Error(`[seed:dev] d1EnsurePageOrArticleRaw: ${table} missing required columns`)
  }
  const c = (payload.db as unknown as SQLiteAdapter).client
  if (!c || typeof (c as { prepare?: unknown }).prepare !== 'function') {
    throw new Error('[seed:dev] d1EnsurePageOrArticleRaw: no D1 client')
  }
  const p = c as {
    prepare: (q: string) => {
      bind: (...a: unknown[]) => {
        all: <T>() => Promise<{ results?: T[] }>
        run: () => Promise<unknown>
      }
    }
  }
  const iso = new Date().toISOString()
  const exist = pageScoped
    ? await p
        .prepare(
          'SELECT `id` FROM `pages` WHERE `tenant_id` = ? AND `site_id` = ? AND `slug` = ? AND `locale` = ? LIMIT 1',
        )
        .bind(input.tenantId, input.siteId, input.slug, input.locale)
        .all<{ id: number }>()
    : await p
        .prepare(
          'SELECT `id` FROM `articles` WHERE `tenant_id` = ? AND `slug` = ? AND `locale` = ? LIMIT 1',
        )
        .bind(input.tenantId, input.slug, input.locale)
        .all<{ id: number }>()
  if (exist.results?.[0]?.id != null) {
    return
  }

  const row: Record<string, unknown> = {
    tenant_id: input.tenantId,
    title: input.title,
    slug: input.slug,
  }
  if (tableCols.has('site_id')) row.site_id = input.siteId
  if (tableCols.has('locale')) row.locale = input.locale
  if (tableCols.has('excerpt')) row.excerpt = input.excerpt ?? null
  if (tableCols.has('body')) row.body = input.bodyJson
  if (tableCols.has('status')) row.status = 'published'
  if (tableCols.has('published_at')) row.published_at = iso
  if (tableCols.has('created_at')) row.created_at = iso
  if (tableCols.has('updated_at')) row.updated_at = iso

  const keys = Object.keys(row).filter((k) => tableCols.has(k))
  if (keys.length < 2) {
    throw new Error(`[seed:dev] d1EnsurePageOrArticleRaw: no insertable columns for ${table}`)
  }
  const ph = keys.map(() => '?').join(', ')
  const csql = `INSERT INTO \`${table}\` (${keys.map((k) => `\`${k}\``).join(', ')}) VALUES (${ph})`
  await p
    .prepare(csql)
    .bind(...keys.map((k) => row[k]))
    .run()

  const newIdQ = pageScoped
    ? await p
        .prepare(
          'SELECT `id` FROM `pages` WHERE `tenant_id` = ? AND `site_id` = ? AND `slug` = ? AND `locale` = ? LIMIT 1',
        )
        .bind(input.tenantId, input.siteId, input.slug, input.locale)
        .all<{ id: number }>()
    : await p
        .prepare(
          'SELECT `id` FROM `articles` WHERE `tenant_id` = ? AND `slug` = ? AND `locale` = ? LIMIT 1',
        )
        .bind(input.tenantId, input.slug, input.locale)
        .all<{ id: number }>()
  const newId = newIdQ.results?.[0]?.id
  if (newId == null) {
    throw new Error(
      `[seed:dev] d1EnsurePageOrArticleRaw: could not re-read id after ${table} insert`,
    )
  }

  if (input.categoryIds.length > 0 && relCols != null) {
    const hasOrder = relCols.has('order')
    const hasParent = relCols.has('parent_id')
    const hasPath = relCols.has('path')
    const hasCat = relCols.has('categories_id')
    if (hasOrder && hasParent && hasPath && hasCat) {
      let o = 0
      for (const catId of input.categoryIds) {
        await p
          .prepare(
            `INSERT INTO \`${relTable}\` (\`order\`, \`parent_id\`, \`path\`, \`categories_id\`) VALUES (?, ?, ?, ?)`,
          )
          .bind(o++, newId, 'categories', catId)
          .run()
      }
    }
  }
  console.info('[seed:dev] d1', table, input.slug, input.locale, 'id', newId)
}

/**
 * Dev DBs sometimes have schema from `push` without migration `20260421_210000` columns.
 * Apply the same ALTERs as that migration when missing so Local API inserts succeed.
 */
async function ensureSiteScopeColumns(payload: Payload): Promise<void> {
  const db = payload.db as unknown as SQLiteAdapter
  const client = db.client
  if (!client?.prepare) return

  const tableHasColumn = async (table: string, column: string): Promise<boolean> => {
    const res = await client.prepare(`PRAGMA table_info(\`${table}\`)`).all<{ name: string }>()
    const rows = res.results ?? []
    return rows.some((row: { name: string }) => row.name === column)
  }

  if (!(await tableHasColumn('categories', 'site_id'))) {
    console.info('[seed:dev] Patching schema: categories.site_id')
    await client.exec(
      'ALTER TABLE `categories` ADD `site_id` integer REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null;',
    )
    await client.exec(
      'CREATE INDEX IF NOT EXISTS `categories_site_idx` ON `categories` (`site_id`);',
    )
  }

  if (!(await tableHasColumn('media', 'site_id'))) {
    console.info('[seed:dev] Patching schema: media.site_id')
    await client.exec(
      'ALTER TABLE `media` ADD `site_id` integer REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null;',
    )
    await client.exec('CREATE INDEX IF NOT EXISTS `media_site_idx` ON `media` (`site_id`);')
  }

  if (!(await tableHasColumn('site_blueprints', 'site_id'))) {
    console.info('[seed:dev] Patching schema: site_blueprints.site_id')
    await client.exec(
      'ALTER TABLE `site_blueprints` ADD `site_id` integer REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null;',
    )
    await client.exec(
      'CREATE INDEX IF NOT EXISTS `site_blueprints_site_idx` ON `site_blueprints` (`site_id`);',
    )
  }
}

async function main(): Promise<void> {
  process.env.PAYLOAD_SUPER_ADMIN_EMAILS = [
    process.env.PAYLOAD_SUPER_ADMIN_EMAILS,
    EMAILS.superadmin,
  ]
    .filter(Boolean)
    .join(',')

  const payload = await getPayload({ config })

  console.info('[seed:dev] Starting…')
  await ensureSiteScopeColumns(payload)

  const tenantIds: number[] = []
  const tenantBySlug = new Map<string, { id: number }>()

  for (const p of TENANT_PROFILES) {
    const list = await payload.find({
      collection: 'tenants',
      where: whereTenantSlug(p.slug),
      limit: 1,
      overrideAccess: true,
    })
    let doc = list.docs[0]
    if (!doc) {
      doc = await payload.create({
        collection: 'tenants',
        data: {
          name: p.name,
          slug: p.slug,
          domain: p.rootDomain,
        },
        overrideAccess: true,
      })
      console.info('[seed:dev] Created tenant', doc.id, doc.slug)
    } else {
      console.info('[seed:dev] Tenant exists', doc.id, doc.slug)
    }
    tenantIds.push(doc.id as number)
    tenantBySlug.set(p.slug, { id: doc.id as number })
  }

  const alphaId = tenantBySlug.get('seed-alpha')!.id
  const betaId = tenantBySlug.get('seed-beta')!.id

  let superList = await payload.find({
    collection: 'users',
    where: { email: { equals: EMAILS.superadmin } },
    limit: 1,
    overrideAccess: true,
  })
  let superUser = superList.docs[0] as SeedUserDoc | undefined
  if (!superUser) {
    superUser = (await payload.create({
      collection: 'users',
      data: {
        email: EMAILS.superadmin,
        password: PASSWORD,
        roles: ['super-admin'],
        tenants: [{ tenant: alphaId }, { tenant: betaId }],
      },
    })) as SeedUserDoc
    console.info('[seed:dev] Created super admin', superUser.email)
  } else {
    await payload.update({
      collection: 'users',
      id: superUser.id,
      data: {
        tenants: [{ tenant: alphaId }, { tenant: betaId }],
      },
      overrideAccess: true,
    })
    console.info('[seed:dev] Super admin exists', superUser.email, '(tenants synced to Alpha+Beta)')
  }

  const superForReq = (await payload.findByID({
    collection: 'users',
    id: superUser.id,
    overrideAccess: true,
  })) as SeedUserDoc

  const reqOpts = superReq(superForReq)

  const roleSeeds: { email: string; roles: SeedUserDoc['roles']; tenantId: number }[] = [
    { email: EMAILS.finance, roles: ['user', 'finance'], tenantId: alphaId },
    { email: EMAILS.ops, roles: ['user', 'ops-manager'], tenantId: alphaId },
    { email: EMAILS.lead, roles: ['user', 'team-lead'], tenantId: alphaId },
    { email: EMAILS.sitemgr, roles: ['user', 'site-manager'], tenantId: alphaId },
    { email: EMAILS.betaSitemgr, roles: ['user', 'site-manager'], tenantId: betaId },
  ]

  for (const { email, roles, tenantId } of roleSeeds) {
    const ex = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      overrideAccess: true,
    })
    if (ex.docs[0]) {
      await payload.update({
        collection: 'users',
        id: ex.docs[0].id,
        data: {
          tenants: [{ tenant: tenantId }],
        },
        overrideAccess: true,
      })
      console.info('[seed:dev] User exists', email, '(tenant assignment refreshed)')
      continue
    }
    await payload.create({
      collection: 'users',
      data: {
        email,
        password: PASSWORD,
        roles,
        tenants: [{ tenant: tenantId }],
      },
    })
    console.info('[seed:dev] Created user', email)
  }

  for (const p of TENANT_PROFILES) {
    const tenantId = tenantBySlug.get(p.slug)!.id
    console.info('[seed:dev] --- Seeding tenant', p.slug, '---')

    const siteSqlCols = await getSqliteTableColumnNames(payload, 'sites')
    const d1SitesNarrow = siteSqlCols != null
    const categorySqlCols = await getSqliteTableColumnNames(payload, 'categories')
    const d1Client = (payload.db as unknown as SQLiteAdapter).client
    const d1ClientOk =
      d1Client != null && typeof (d1Client as { prepare?: unknown }).prepare === 'function'
    const useD1CategoryRaw =
      d1ClientOk &&
      categorySqlCols != null &&
      categorySqlCols.has('slug') &&
      categorySqlCols.has('tenant_id')
    console.info(
      '[seed:dev] D1/sites scoping: d1SitesNarrow=',
      d1SitesNarrow,
      'siteColumnCount=',
      siteSqlCols?.size,
    )
    console.info(
      '[seed:dev] D1/categories: useD1CategoryRaw=',
      useD1CategoryRaw,
      'catColumnCount=',
      categorySqlCols?.size,
    )

    const pageSqlCols = await getSqliteTableColumnNames(payload, 'pages')
    const artSqlCols = await getSqliteTableColumnNames(payload, 'articles')
    const pagesRelsCols = await getSqliteTableColumnNames(payload, 'pages_rels')
    const articlesRelsCols = await getSqliteTableColumnNames(payload, 'articles_rels')
    const useD1PageArticleRaw =
      d1SitesNarrow && d1ClientOk && pageSqlCols != null && artSqlCols != null
    console.info(
      '[seed:dev] D1/pages+articles: useD1PageArticleRaw=',
      useD1PageArticleRaw,
      'pageCols=',
      pageSqlCols?.size,
      'artCols=',
      artSqlCols?.size,
    )

    /** D1: populating `site` / `sites` loads the full `sites` row and exceeds max columns. */
    const d0 = { depth: 0 } as const

    async function ensureSite(spec: SiteSpec) {
      /** D1: `sites` is wide — avoid unbounded selects. */
      const siteSelect = { id: true, blueprint: true } as const
      const found = await payload.find({
        collection: 'sites',
        where: whereTenantAndSlug(tenantId, spec.slug),
        limit: 1,
        overrideAccess: true,
        select: siteSelect,
        depth: 0,
      })
      if (found.docs[0]) {
        const row = found.docs[0] as { id: number }
        const refreshed = await payload.findByID({
          collection: 'sites',
          id: row.id,
          overrideAccess: true,
          select: siteSelect,
          depth: 0,
        })
        if (!refreshed) {
          throw new Error(`[seed:dev] site id ${row.id} missing`)
        }
        return refreshed
      }
      return payload.create({
        collection: 'sites',
        ...reqOpts,
        ...d0,
        data: {
          name: spec.name,
          slug: spec.slug,
          primaryDomain: spec.primaryDomain,
          status: 'active',
          tenant: tenantId,
        },
        overrideAccess: true,
      })
    }

    const site0 = await ensureSite(p.sites[0])
    const site1 = await ensureSite(p.sites[1])
    const sites = [site0, site1] as [{ id: number }, { id: number }]
    console.info('[seed:dev] Sites', site0.id, site1.id)

    if (p.slug === 'seed-alpha') {
      const demoSite = site1 as { id: number; slug?: string }
      const layoutWanted: Array<[string, string | number]> = [['site_layout', 'template1']]
      const layoutForDb = siteSqlCols ? layoutWanted.filter(([col]) => siteSqlCols.has(col)) : null
      let layoutApplied = false
      if (layoutForDb && layoutForDb.length > 0) {
        layoutApplied = await d1NarrowUpdateSites(payload, demoSite.id, layoutForDb)
      }
      if (!layoutApplied) {
        try {
          await payload.update({
            collection: 'sites',
            id: demoSite.id,
            ...reqOpts,
            ...d0,
            data: { siteLayout: 'template1' },
            overrideAccess: true,
          })
          layoutApplied = true
        } catch (e) {
          console.warn('[seed:dev] Template1 layout site update failed.', e)
        }
      }
      console.info(
        '[seed:dev] Template1 site layout →',
        p.sites[1].slug,
        'id=',
        demoSite.id,
        layoutApplied ? '· layout ok' : '· layout partial',
      )
    }

    const blueprintSlug = `${p.slug}-blueprint-default`

    if (d1SitesNarrow) {
      const bp = await d1SeedEnsureSiteBlueprint(payload, {
        tenantId,
        blueprintSlug,
        name: `${p.name} 默认模板`,
        description: '种子设计模板',
        site0Id: site0.id as number,
      })
      if (bp) {
        const bp1 = await d1SeedEnsureSiteBlueprint(payload, {
          tenantId,
          blueprintSlug: `${p.slug}-blueprint-site1`,
          name: `${p.name} 默认模板（站点2）`,
          description: '种子设计模板',
          site0Id: site1.id as number,
        })
        if (bp1) {
          console.info('[seed:dev] Site blueprint (D1 raw)', `${p.slug}-blueprint-site1`, 'id', bp1.id)
        }
        console.info('[seed:dev] Site blueprint (D1 raw)', blueprintSlug, 'id', bp.id)
      } else {
        console.warn(
          '[seed:dev] d1SeedEnsureSiteBlueprint returned null; skipping blueprint (site_blueprints table unavailable?)',
        )
      }
    } else {
      const bpFound = await payload.find({
        collection: 'site-blueprints',
        ...d0,
        where: whereTenantAndSlug(tenantId, blueprintSlug),
        limit: 1,
        overrideAccess: true,
      })
      if (!bpFound.docs[0]) {
        await payload.create({
          collection: 'site-blueprints',
          ...reqOpts,
          ...d0,
          data: {
            name: `${p.name} 默认模板`,
            slug: blueprintSlug,
            site: site0.id,
            tenant: tenantId,
            description: '种子设计模板',
          },
          overrideAccess: true,
        })
        console.info('[seed:dev] Created site blueprint', blueprintSlug)
      }

      const bpSlug1 = `${p.slug}-blueprint-site1`
      const bpFound1 = await payload.find({
        collection: 'site-blueprints',
        ...d0,
        where: whereTenantAndSlug(tenantId, bpSlug1),
        limit: 1,
        overrideAccess: true,
      })
      if (!bpFound1.docs[0]) {
        await payload.create({
          collection: 'site-blueprints',
          ...reqOpts,
          ...d0,
          data: {
            name: `${p.name} 默认模板（站点2）`,
            slug: bpSlug1,
            site: site1.id,
            tenant: tenantId,
            description: '种子设计模板',
          },
          overrideAccess: true,
        })
        console.info('[seed:dev] Created site blueprint', bpSlug1)
      }
    }

    if (p.slug === 'seed-alpha') {
      const bpForT1 = await payload.find({
        collection: 'site-blueprints',
        ...d0,
        where: whereTenantAndSlug(tenantId, blueprintSlug),
        limit: 1,
        overrideAccess: true,
        depth: 0,
      })
      const bpT1 = bpForT1.docs[0] as { id: number } | undefined
      if (bpT1) {
        const t1 = { ...SEED_ALPHA_TEMPLATE1_DEMO }
        try {
          await payload.update({
            collection: 'site-blueprints',
            id: bpT1.id,
            ...reqOpts,
            ...d0,
            data: { t1LocaleJson: t1 },
            overrideAccess: true,
          })
          console.info('[seed:dev] Set seed-alpha blueprint t1LocaleJson', blueprintSlug, bpT1.id)
        } catch (e) {
          const cols = await getSqliteTableColumnNames(payload, 'site_blueprints')
          const db = payload.db as unknown as SQLiteAdapter
          const client = db?.client as
            | {
                prepare: (q: string) => {
                  bind: (...a: unknown[]) => { run: () => Promise<unknown> }
                }
              }
            | undefined
          if (cols?.has('t1_locale_json') && client?.prepare) {
            await client
              .prepare('UPDATE `site_blueprints` SET `t1_locale_json` = ? WHERE `id` = ?')
              .bind(JSON.stringify(t1), bpT1.id)
              .run()
            console.info('[seed:dev] Set seed-alpha blueprint t1LocaleJson (D1 raw)', bpT1.id)
          } else {
            console.warn('[seed:dev] Could not set blueprint t1LocaleJson', e)
          }
        }
      }
    }

    async function ensureCategory(slug: string, name: string, siteId: number) {
      if (useD1CategoryRaw) {
        return d1EnsureCategoryRaw(
          payload,
          {
            tenantId,
            pslug: p.slug,
            slug,
            name,
            siteId,
          },
          categorySqlCols,
        )
      }
      const found = await payload.find({
        collection: 'categories',
        ...d0,
        where: {
          and: [
            { slug: { equals: slug } },
            { tenant: { equals: tenantId } },
            { site: { equals: siteId } },
            { locale: { equals: 'en' } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      })
      if (found.docs[0]) return found.docs[0]
      return payload.create({
        collection: 'categories',
        ...reqOpts,
        ...d0,
        data: {
          name,
          slug,
          locale: 'en',
          site: siteId,
          tenant: tenantId,
          description: `Seed category · ${p.slug}`,
        },
        overrideAccess: true,
      })
    }

    const cat0 = (await ensureCategory(
      p.categories[0].slug,
      p.categories[0].name,
      sites[p.categories[0].siteIndex].id,
    )) as { id: number }
    const cat1 = (await ensureCategory(
      p.categories[1].slug,
      p.categories[1].name,
      sites[p.categories[1].siteIndex].id,
    )) as { id: number }
    const cats = [cat0, cat1] as const

    const netList = await payload.find({
      collection: 'affiliate-networks',
      ...d0,
      where: whereTenantAndSlug(tenantId, p.network.slug),
      limit: 1,
      overrideAccess: true,
    })
    let network = netList.docs[0]
    if (!network) {
      network = await payload.create({
        collection: 'affiliate-networks',
        ...reqOpts,
        ...d0,
        data: {
          name: p.network.name,
          slug: p.network.slug,
          websiteUrl: p.network.websiteUrl,
          status: 'active',
          tenant: tenantId,
        },
        overrideAccess: true,
      })
      console.info('[seed:dev] Created affiliate network', network.id)
    }

    for (const off of p.offers) {
      const offerExists = await payload.find({
        collection: 'offers',
        ...d0,
        where: whereTenantAndSlug(tenantId, off.slug),
        limit: 1,
        overrideAccess: true,
      })
      if (offerExists.docs[0]) continue
      if (d1SitesNarrow) {
        const created = (await payload.create({
          collection: 'offers',
          ...reqOpts,
          ...d0,
          data: {
            title: off.title,
            slug: off.slug,
            network: network.id as number,
            status: 'active',
            targetUrl: off.targetUrl,
            tenant: tenantId,
          },
          overrideAccess: true,
        })) as { id: number }
        const c = (payload.db as unknown as SQLiteAdapter).client
        if (c && typeof (c as { prepare?: unknown }).prepare === 'function') {
          const prep = c as {
            prepare: (q: string) => { bind: (...a: unknown[]) => { run: () => Promise<unknown> } }
          }
          let o = 0
          for (const sid of [site0.id, site1.id]) {
            await prep
              .prepare(
                'INSERT INTO `offers_rels` (`order`, `parent_id`, `path`, `sites_id`) VALUES (?, ?, ?, ?)',
              )
              .bind(o++, created.id, 'sites', sid)
              .run()
          }
        }
        console.info('[seed:dev] Created offer', off.slug, '(+ sites rel, D1)')
        continue
      }
      await payload.create({
        collection: 'offers',
        ...reqOpts,
        ...d0,
        data: {
          title: off.title,
          slug: off.slug,
          network: network.id as number,
          status: 'active',
          sites: [site0.id as number, site1.id as number],
          targetUrl: off.targetUrl,
          tenant: tenantId,
        },
        overrideAccess: true,
      })
      console.info('[seed:dev] Created offer', off.slug)
    }

    async function ensureArticle(
      slug: string,
      title: string,
      siteId: number,
      categoryIds: number[],
      locale: 'zh' | 'en' = 'zh',
      excerpt?: string,
      bodyLines?: string[],
    ) {
      const body =
        bodyLines != null && bodyLines.length > 0 ? minimalLexicalBody(bodyLines) : undefined
      if (useD1PageArticleRaw && artSqlCols != null) {
        await d1EnsurePageOrArticleRaw(
          'articles',
          payload,
          artSqlCols,
          'articles_rels',
          articlesRelsCols,
          {
            tenantId,
            siteId,
            slug,
            locale,
            title,
            excerpt,
            bodyJson: body != null ? JSON.stringify(body) : null,
            categoryIds,
          },
          false,
        )
        return
      }
      const found = await payload.find({
        collection: 'articles',
        ...d0,
        where: whereTenantSlugLocale(tenantId, slug, locale),
        limit: 1,
        overrideAccess: true,
      })
      if (found.docs[0]) return
      await payload.create({
        collection: 'articles',
        ...reqOpts,
        ...d0,
        data: {
          title,
          slug,
          locale,
          excerpt: excerpt ?? undefined,
          site: siteId,
          categories: categoryIds,
          ...(body != null ? { body } : {}),
          status: 'published',
          publishedAt: new Date().toISOString(),
          tenant: tenantId,
        },
        overrideAccess: true,
      })
      console.info('[seed:dev] Created article', slug, locale)
    }

    async function ensurePage(
      slug: string,
      title: string,
      siteId: number,
      categoryIds: number[],
      locale: 'zh' | 'en' = 'zh',
      excerpt?: string,
      bodyLine?: string,
    ) {
      const body =
        bodyLine != null && bodyLine.length > 0 ? minimalLexicalBody(bodyLine) : undefined
      if (useD1PageArticleRaw && pageSqlCols != null) {
        const bodyJson = body != null ? JSON.stringify(body) : null
        await d1EnsurePageOrArticleRaw(
          'pages',
          payload,
          pageSqlCols,
          'pages_rels',
          pagesRelsCols,
          {
            tenantId,
            siteId,
            slug,
            locale,
            title,
            excerpt,
            bodyJson,
            categoryIds,
          },
          true,
        )
        return
      }
      const found = await payload.find({
        collection: 'pages',
        ...d0,
        where: whereTenantSiteSlugLocale(tenantId, siteId, slug, locale),
        limit: 1,
        overrideAccess: true,
      })
      if (found.docs[0]) return
      await payload.create({
        collection: 'pages',
        ...reqOpts,
        ...d0,
        data: {
          title,
          slug,
          locale,
          excerpt: excerpt ?? undefined,
          site: siteId,
          categories: categoryIds,
          ...(body != null ? { body } : {}),
          status: 'published',
          publishedAt: new Date().toISOString(),
          tenant: tenantId,
        },
        overrideAccess: true,
      })
      console.info('[seed:dev] Created page', slug, locale)
    }

    for (const a of p.articles) {
      const catId = cats[a.catKey].id
      const loc = a.locale ?? 'zh'
      await ensureArticle(
        a.slug,
        a.title,
        sites[a.siteIndex].id as number,
        [catId],
        loc,
        a.excerpt,
        a.bodyLines,
      )
    }
    for (const pg of p.pages) {
      const catId = cats[pg.catKey].id
      const loc = pg.locale ?? 'zh'
      await ensurePage(
        pg.slug,
        pg.title,
        sites[pg.siteIndex].id as number,
        [catId],
        loc,
        pg.excerpt,
        pg.bodyLine,
      )
    }

    async function ensureKeyword() {
      const kwSlug = p.keyword.slug
      const found = await payload.find({
        collection: 'keywords',
        ...d0,
        where: whereTenantAndSlug(tenantId, kwSlug),
        limit: 1,
        overrideAccess: true,
      })
      if (found.docs[0]) return found.docs[0]
      return payload.create({
        collection: 'keywords',
        ...reqOpts,
        ...d0,
        data: {
          term: p.keyword.term,
          slug: kwSlug,
          site: sites[p.keyword.siteIndex].id,
          status: 'active',
          tenant: tenantId,
        },
        overrideAccess: true,
      })
    }

    const keywordDoc = await ensureKeyword()

    const rankFound = await payload.find({
      collection: 'rankings',
      ...d0,
      where: {
        and: [{ tenant: { equals: tenantId } }, { searchQuery: { equals: p.ranking.searchQuery } }],
      },
      limit: 1,
      overrideAccess: true,
    })
    if (!rankFound.docs[0]) {
      await payload.create({
        collection: 'rankings',
        ...reqOpts,
        ...d0,
        data: {
          keyword: keywordDoc.id as number,
          site: sites[p.keyword.siteIndex].id,
          searchQuery: p.ranking.searchQuery,
          serpPosition: p.ranking.serpPosition,
          capturedAt: new Date('2026-04-01T12:00:00.000Z').toISOString(),
          notes: `Seed ${p.slug}`,
          tenant: tenantId,
        },
        overrideAccess: true,
      })
      console.info('[seed:dev] Created ranking', p.ranking.searchQuery)
    }

    const wj = await payload.find({
      collection: 'workflow-jobs',
      ...d0,
      where: {
        and: [{ tenant: { equals: tenantId } }, { label: { equals: p.workflowLabel } }],
      },
      limit: 1,
      overrideAccess: true,
    })
    if (!wj.docs[0]) {
      await payload.create({
        collection: 'workflow-jobs',
        ...reqOpts,
        ...d0,
        data: {
          label: p.workflowLabel,
          jobType: p.workflowJobType,
          status: 'pending',
          site: site0.id,
          input: { note: 'seed', tenant: p.slug },
          tenant: tenantId,
        },
        overrideAccess: true,
      })
      console.info('[seed:dev] Created workflow job', p.workflowLabel)
    }

    let platList = await payload.find({
      collection: 'social-platforms',
      ...d0,
      where: whereTenantAndSlug(tenantId, p.socialPlatformSlug),
      limit: 1,
      overrideAccess: true,
    })
    let platform = platList.docs[0]
    if (!platform) {
      platform = await payload.create({
        collection: 'social-platforms',
        ...reqOpts,
        ...d0,
        data: {
          name: p.socialPlatformName,
          slug: p.socialPlatformSlug,
          status: 'active',
          tenant: tenantId,
        },
        overrideAccess: true,
      })
    }

    const sa = await payload.find({
      collection: 'social-accounts',
      ...d0,
      where: {
        and: [{ tenant: { equals: tenantId } }, { handle: { equals: p.socialHandle } }],
      },
      limit: 1,
      overrideAccess: true,
    })
    if (!sa.docs[0]) {
      await payload.create({
        collection: 'social-accounts',
        ...reqOpts,
        ...d0,
        data: {
          platform: platform.id as number,
          site: site0.id,
          handle: p.socialHandle,
          status: 'active',
          tenant: tenantId,
        },
        overrideAccess: true,
      })
      console.info('[seed:dev] Created social account', p.socialHandle)
    }

    const kbSlug = p.knowledge.slug
    const kbFound = await payload.find({
      collection: 'knowledge-base',
      ...d0,
      where: whereTenantAndSlug(tenantId, kbSlug),
      limit: 1,
      overrideAccess: true,
    })
    if (!kbFound.docs[0]) {
      await payload.create({
        collection: 'knowledge-base',
        ...reqOpts,
        ...d0,
        data: {
          title: p.knowledge.title,
          slug: kbSlug,
          site: sites[p.knowledge.siteIndex].id,
          categories: [cats[p.knowledge.catKey].id as number],
          status: 'published',
          notes: `Seed KB · ${p.slug}`,
          tenant: tenantId,
        },
        overrideAccess: true,
      })
      console.info('[seed:dev] Created knowledge base', kbSlug)
    }

    const ann = await payload.find({
      collection: 'announcements',
      ...d0,
      where: {
        and: [{ tenant: { equals: tenantId } }, { title: { equals: p.announcementTitle } }],
      },
      limit: 1,
      overrideAccess: true,
    })
    if (!ann.docs[0]) {
      await payload.create({
        collection: 'announcements',
        ...superReq(superForReq),
        ...d0,
        user: { ...superForReq, collection: 'users' },
        data: {
          kind: 'system',
          tenant: tenantId,
          title: p.announcementTitle,
          body: p.announcementBody,
          isActive: true,
        },
        overrideAccess: true,
      })
      console.info('[seed:dev] Created announcement', p.announcementTitle)
    }

    const firstOffer = await payload.find({
      collection: 'offers',
      ...d0,
      where: whereTenantAndSlug(tenantId, p.offers[0].slug),
      limit: 1,
      overrideAccess: true,
    })
    const offer0 = firstOffer.docs[0]
    if (offer0) {
      const clickFound = await payload.find({
        collection: 'click-events',
        ...d0,
        where: {
          and: [
            { tenant: { equals: tenantId } },
            { destinationUrl: { equals: p.clickDestinationUrl } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      })
      if (!clickFound.docs[0]) {
        await payload.create({
          collection: 'click-events',
          ...reqOpts,
          ...d0,
          data: {
            occurredAt: new Date('2026-04-15T10:30:00.000Z').toISOString(),
            eventType: 'click',
            site: site0.id,
            offer: offer0.id as number,
            destinationUrl: p.clickDestinationUrl,
            referrer: 'https://example.com/referrer',
            metadata: { seed: true, tenant: p.slug },
            tenant: tenantId,
          },
          overrideAccess: true,
        })
        console.info('[seed:dev] Created click event', p.clickDestinationUrl)
      }

      const commFound = await payload.find({
        collection: 'commissions',
        ...d0,
        where: {
          and: [{ tenant: { equals: tenantId } }, { notes: { equals: p.commissionNotes } }],
        },
        limit: 1,
        overrideAccess: true,
      })
      if (!commFound.docs[0]) {
        await payload.create({
          collection: 'commissions',
          ...reqOpts,
          ...d0,
          data: {
            amount: p.slug === 'seed-alpha' ? 42.5 : 128,
            currency: 'USD',
            status: 'pending',
            recipient: superForReq.id,
            offer: offer0.id as number,
            site: site0.id,
            periodStart: new Date('2026-04-01T00:00:00.000Z').toISOString(),
            periodEnd: new Date('2026-04-30T00:00:00.000Z').toISOString(),
            notes: p.commissionNotes,
            tenant: tenantId,
          },
          overrideAccess: true,
        })
        console.info('[seed:dev] Created commission', p.commissionNotes)
      }
    }
  }

  console.info('[seed:dev] Done.')
  console.info('[seed:dev] Tenants:', TENANT_PROFILES.map((x) => x.slug).join(', '))
  console.info('[seed:dev] Login (super admin):', EMAILS.superadmin, '/', PASSWORD)
  console.info('[seed:dev] Beta site-manager only:', EMAILS.betaSitemgr, '/', PASSWORD)
  console.info('')
  console.info('[seed:dev] Blog template preview (after pnpm dev):')
  console.info(
    '  Set NEXT_PUBLIC_DEFAULT_SITE_SLUG=seed-site-a in .env, then open http://localhost:3000/zh/',
  )
  console.info(
    '  Or: http://localhost:3000/zh/?site=seed-site-a  |  second site: ?site=seed-site-b',
  )
  console.info('  Beta tenant: ?site=beta-saas-main')
  console.info('')
  console.info(
    '[seed:dev] Template1 demo (seed-site-b, seed-alpha): full shell + t1* copy in Admin',
  )
  console.info(
    '  http://localhost:3000/zh/?site=seed-site-b  |  http://localhost:3000/en/?site=seed-site-b',
  )
  console.info('  Root CMS pages: /zh/about, /zh/contact, /zh/privacy (and /en/…)')
}

main().catch((err) => {
  console.error('[seed:dev] Failed:', err)
  process.exit(1)
})
