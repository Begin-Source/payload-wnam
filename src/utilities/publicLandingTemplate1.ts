
import type { AppLocale } from '@/i18n/config'

/** Resolved Template1 copy for one locale; placeholders: {{siteName}}, {{category}}, {{n}}, {{year}} */
export type Template1LocaleBlock = {
  navAllReviews: string
  navCategories: string
  navAbout: string
  navContact: string
  navPrivacy: string
  navSearchSr: string
  navMenuSr: string
  homeTitle: string
  homeSubtitle: string
  browseCategory: string
  /** e.g. "About {{siteName}}" */
  aboutSidebarTitle: string
  fullStory: string
  topPicks: string
  /** e.g. "Latest in {{category}}" / "{{category}} · 最新" */
  bestIn: string
  fullReview: string
  moreTopPicks: string
  whyTrust: string
  trust1Title: string
  trust1Desc: string
  trust2Title: string
  trust2Desc: string
  trust3Title: string
  trust3Desc: string
  learnHowWeTest: string
  updated: string
  /** e.g. "{{n}} min read" */
  minRead: string
  footerCategoriesHeading: string
  footerCompanyHeading: string
  footerAffiliateLabel: string
  /** e.g. "© {{year}} {{siteName}}. All rights reserved." */
  footerCopyright: string
  footerBottom: string
}

const EN: Template1LocaleBlock = {
  navAllReviews: 'All reviews',
  navCategories: 'Categories',
  navAbout: 'About',
  navContact: 'Contact',
  navPrivacy: 'Privacy',
  navSearchSr: 'Search',
  navMenuSr: 'Menu',
  homeTitle: 'Independent product reviews',
  homeSubtitle: 'Expert-tested articles. Editorial standards you can rely on.',
  browseCategory: 'Browse by category',
  aboutSidebarTitle: 'About {{siteName}}',
  fullStory: 'Read our full story',
  topPicks: "Editor's picks",
  bestIn: 'Latest in {{category}}',
  fullReview: 'Full article',
  moreTopPicks: 'More picks',
  whyTrust: 'Why trust us',
  trust1Title: 'Editorially independent',
  trust1Desc: 'We do not accept payment for positive coverage.',
  trust2Title: 'Hands-on testing',
  trust2Desc: 'We exercise real-world judgment on what we publish.',
  trust3Title: 'Expert authors',
  trust3Desc: 'Reviewers are subject-matter contributors.',
  learnHowWeTest: 'Learn how we test →',
  updated: 'Updated',
  minRead: '{{n}} min read',
  footerCategoriesHeading: 'Categories',
  footerCompanyHeading: 'Company',
  footerAffiliateLabel: 'Affiliate disclosure:',
  footerCopyright: '© {{year}} {{siteName}}. All rights reserved.',
  footerBottom:
    'This site may participate in affiliate programs; editorial content is independent.',
}

const ZH: Template1LocaleBlock = {
  navAllReviews: '全部文章',
  navCategories: '分类',
  navAbout: '关于',
  navContact: '联系',
  navPrivacy: '隐私政策',
  navSearchSr: '搜索',
  navMenuSr: '菜单',
  homeTitle: '独立产品评测',
  homeSubtitle: '专家实测内容，可信赖的编辑标准。',
  browseCategory: '按分类浏览',
  aboutSidebarTitle: '关于 {{siteName}}',
  fullStory: '了解我们',
  topPicks: '编辑精选',
  bestIn: '{{category}} · 最新',
  fullReview: '阅读全文',
  moreTopPicks: '更多精选',
  whyTrust: '为何可信',
  trust1Title: '编辑独立',
  trust1Desc: '我们不接受付费换好评。',
  trust2Title: '真实体验',
  trust2Desc: '发布前进行实际场景评估。',
  trust3Title: '专业作者',
  trust3Desc: '作者具备相关领域经验。',
  learnHowWeTest: '了解我们的测试方法 →',
  updated: '更新于',
  minRead: '约 {{n}} 分钟阅读',
  footerCategoriesHeading: '分类',
  footerCompanyHeading: '站点',
  footerAffiliateLabel: '联盟披露：',
  footerCopyright: '© {{year}} {{siteName}} 保留所有权利。',
  footerBottom: '本站可能参与联盟计划；正文与评测保持独立。',
}

export const TEMPLATE1_DEFAULTS: Record<AppLocale, Template1LocaleBlock> = {
  en: EN,
  zh: ZH,
}

function firstNonEmptyString(...v: (string | null | undefined)[]): string | undefined {
  for (const x of v) {
    if (x == null) continue
    const t = String(x).trim()
    if (t) return t
  }
  return undefined
}

/** Flat Template1 fields (from merged JSON); kept for `blockFromSite`. */
export type SiteT1 = {
  t1NavUsePageTitleForAbout?: boolean | null
  t1NavUsePageTitleForContact?: boolean | null
  t1NavAllReviewsEn?: string | null
  t1NavAllReviewsZh?: string | null
  t1NavCategoriesEn?: string | null
  t1NavCategoriesZh?: string | null
  t1NavAboutEn?: string | null
  t1NavAboutZh?: string | null
  t1NavContactEn?: string | null
  t1NavContactZh?: string | null
  t1NavPrivacyEn?: string | null
  t1NavPrivacyZh?: string | null
  t1NavSearchSrEn?: string | null
  t1NavSearchSrZh?: string | null
  t1NavMenuSrEn?: string | null
  t1NavMenuSrZh?: string | null
  t1HomeTitleEn?: string | null
  t1HomeTitleZh?: string | null
  t1HomeSubtitleEn?: string | null
  t1HomeSubtitleZh?: string | null
  t1BrowseCategoryEn?: string | null
  t1BrowseCategoryZh?: string | null
  t1AboutSidebarTitleEn?: string | null
  t1AboutSidebarTitleZh?: string | null
  t1FullStoryEn?: string | null
  t1FullStoryZh?: string | null
  t1TopPicksEn?: string | null
  t1TopPicksZh?: string | null
  t1BestInEn?: string | null
  t1BestInZh?: string | null
  t1FullReviewEn?: string | null
  t1FullReviewZh?: string | null
  t1MoreTopPicksEn?: string | null
  t1MoreTopPicksZh?: string | null
  t1WhyTrustEn?: string | null
  t1WhyTrustZh?: string | null
  t1Trust1TitleEn?: string | null
  t1Trust1TitleZh?: string | null
  t1Trust1DescEn?: string | null
  t1Trust1DescZh?: string | null
  t1Trust2TitleEn?: string | null
  t1Trust2TitleZh?: string | null
  t1Trust2DescEn?: string | null
  t1Trust2DescZh?: string | null
  t1Trust3TitleEn?: string | null
  t1Trust3TitleZh?: string | null
  t1Trust3DescEn?: string | null
  t1Trust3DescZh?: string | null
  t1LearnHowWeTestEn?: string | null
  t1LearnHowWeTestZh?: string | null
  t1UpdatedEn?: string | null
  t1UpdatedZh?: string | null
  t1MinReadEn?: string | null
  t1MinReadZh?: string | null
  t1FooterCategoriesHeadingEn?: string | null
  t1FooterCategoriesHeadingZh?: string | null
  t1FooterCompanyHeadingEn?: string | null
  t1FooterCompanyHeadingZh?: string | null
  t1FooterAffiliateLabelEn?: string | null
  t1FooterAffiliateLabelZh?: string | null
  t1FooterCopyrightEn?: string | null
  t1FooterCopyrightZh?: string | null
  t1FooterBottomEn?: string | null
  t1FooterBottomZh?: string | null
}

const T1_STRING_KEYS: (keyof SiteT1)[] = [
  't1NavAllReviewsEn',
  't1NavAllReviewsZh',
  't1NavCategoriesEn',
  't1NavCategoriesZh',
  't1NavAboutEn',
  't1NavAboutZh',
  't1NavContactEn',
  't1NavContactZh',
  't1NavPrivacyEn',
  't1NavPrivacyZh',
  't1NavSearchSrEn',
  't1NavSearchSrZh',
  't1NavMenuSrEn',
  't1NavMenuSrZh',
  't1HomeTitleEn',
  't1HomeTitleZh',
  't1HomeSubtitleEn',
  't1HomeSubtitleZh',
  't1BrowseCategoryEn',
  't1BrowseCategoryZh',
  't1AboutSidebarTitleEn',
  't1AboutSidebarTitleZh',
  't1FullStoryEn',
  't1FullStoryZh',
  't1TopPicksEn',
  't1TopPicksZh',
  't1BestInEn',
  't1BestInZh',
  't1FullReviewEn',
  't1FullReviewZh',
  't1MoreTopPicksEn',
  't1MoreTopPicksZh',
  't1WhyTrustEn',
  't1WhyTrustZh',
  't1Trust1TitleEn',
  't1Trust1TitleZh',
  't1Trust1DescEn',
  't1Trust1DescZh',
  't1Trust2TitleEn',
  't1Trust2TitleZh',
  't1Trust2DescEn',
  't1Trust2DescZh',
  't1Trust3TitleEn',
  't1Trust3TitleZh',
  't1Trust3DescEn',
  't1Trust3DescZh',
  't1LearnHowWeTestEn',
  't1LearnHowWeTestZh',
  't1UpdatedEn',
  't1UpdatedZh',
  't1MinReadEn',
  't1MinReadZh',
  't1FooterCategoriesHeadingEn',
  't1FooterCategoriesHeadingZh',
  't1FooterCompanyHeadingEn',
  't1FooterCompanyHeadingZh',
  't1FooterAffiliateLabelEn',
  't1FooterAffiliateLabelZh',
  't1FooterCopyrightEn',
  't1FooterCopyrightZh',
  't1FooterBottomEn',
  't1FooterBottomZh',
]

/** Build flat Template1 fields from `{ t1LocaleJson }` (e.g. site-blueprints row). */
export function siteT1FromLocaleJson(
  row: { t1LocaleJson?: unknown } | null | undefined,
): SiteT1 {
  const raw = row?.t1LocaleJson
  const j =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const str = (key: keyof SiteT1): string | null | undefined => {
    const v = j[key as string]
    return typeof v === 'string' ? v : undefined
  }
  const out: SiteT1 = {}
  if (typeof j.t1NavUsePageTitleForAbout === 'boolean') {
    out.t1NavUsePageTitleForAbout = j.t1NavUsePageTitleForAbout
  }
  if (typeof j.t1NavUsePageTitleForContact === 'boolean') {
    out.t1NavUsePageTitleForContact = j.t1NavUsePageTitleForContact
  }
  for (const k of T1_STRING_KEYS) {
    const v = str(k)
    if (v !== undefined) (out as Record<string, unknown>)[k] = v
  }
  return out
}

export type Template1Theme = {
  t1NavUsePageTitleForAbout: boolean
  t1NavUsePageTitleForContact: boolean
  en: Template1LocaleBlock
  zh: Template1LocaleBlock
}

function blockFromSite(
  s: SiteT1,
  loc: 'en' | 'zh',
  def: Template1LocaleBlock,
): Template1LocaleBlock {
  const e = loc === 'en'
  return {
    navAllReviews:
      firstNonEmptyString(e ? s.t1NavAllReviewsEn : s.t1NavAllReviewsZh, def.navAllReviews) ??
      def.navAllReviews,
    navCategories:
      firstNonEmptyString(e ? s.t1NavCategoriesEn : s.t1NavCategoriesZh, def.navCategories) ??
      def.navCategories,
    navAbout:
      firstNonEmptyString(e ? s.t1NavAboutEn : s.t1NavAboutZh, def.navAbout) ?? def.navAbout,
    navContact:
      firstNonEmptyString(e ? s.t1NavContactEn : s.t1NavContactZh, def.navContact) ??
      def.navContact,
    navPrivacy:
      firstNonEmptyString(e ? s.t1NavPrivacyEn : s.t1NavPrivacyZh, def.navPrivacy) ??
      def.navPrivacy,
    navSearchSr:
      firstNonEmptyString(e ? s.t1NavSearchSrEn : s.t1NavSearchSrZh, def.navSearchSr) ??
      def.navSearchSr,
    navMenuSr:
      firstNonEmptyString(e ? s.t1NavMenuSrEn : s.t1NavMenuSrZh, def.navMenuSr) ?? def.navMenuSr,
    homeTitle:
      firstNonEmptyString(e ? s.t1HomeTitleEn : s.t1HomeTitleZh, def.homeTitle) ?? def.homeTitle,
    homeSubtitle:
      firstNonEmptyString(e ? s.t1HomeSubtitleEn : s.t1HomeSubtitleZh, def.homeSubtitle) ??
      def.homeSubtitle,
    browseCategory:
      firstNonEmptyString(e ? s.t1BrowseCategoryEn : s.t1BrowseCategoryZh, def.browseCategory) ??
      def.browseCategory,
    aboutSidebarTitle:
      firstNonEmptyString(
        e ? s.t1AboutSidebarTitleEn : s.t1AboutSidebarTitleZh,
        def.aboutSidebarTitle,
      ) ?? def.aboutSidebarTitle,
    fullStory:
      firstNonEmptyString(e ? s.t1FullStoryEn : s.t1FullStoryZh, def.fullStory) ?? def.fullStory,
    topPicks:
      firstNonEmptyString(e ? s.t1TopPicksEn : s.t1TopPicksZh, def.topPicks) ?? def.topPicks,
    bestIn: firstNonEmptyString(e ? s.t1BestInEn : s.t1BestInZh, def.bestIn) ?? def.bestIn,
    fullReview:
      firstNonEmptyString(e ? s.t1FullReviewEn : s.t1FullReviewZh, def.fullReview) ??
      def.fullReview,
    moreTopPicks:
      firstNonEmptyString(e ? s.t1MoreTopPicksEn : s.t1MoreTopPicksZh, def.moreTopPicks) ??
      def.moreTopPicks,
    whyTrust:
      firstNonEmptyString(e ? s.t1WhyTrustEn : s.t1WhyTrustZh, def.whyTrust) ?? def.whyTrust,
    trust1Title:
      firstNonEmptyString(e ? s.t1Trust1TitleEn : s.t1Trust1TitleZh, def.trust1Title) ??
      def.trust1Title,
    trust1Desc:
      firstNonEmptyString(e ? s.t1Trust1DescEn : s.t1Trust1DescZh, def.trust1Desc) ??
      def.trust1Desc,
    trust2Title:
      firstNonEmptyString(e ? s.t1Trust2TitleEn : s.t1Trust2TitleZh, def.trust2Title) ??
      def.trust2Title,
    trust2Desc:
      firstNonEmptyString(e ? s.t1Trust2DescEn : s.t1Trust2DescZh, def.trust2Desc) ??
      def.trust2Desc,
    trust3Title:
      firstNonEmptyString(e ? s.t1Trust3TitleEn : s.t1Trust3TitleZh, def.trust3Title) ??
      def.trust3Title,
    trust3Desc:
      firstNonEmptyString(e ? s.t1Trust3DescEn : s.t1Trust3DescZh, def.trust3Desc) ??
      def.trust3Desc,
    learnHowWeTest:
      firstNonEmptyString(e ? s.t1LearnHowWeTestEn : s.t1LearnHowWeTestZh, def.learnHowWeTest) ??
      def.learnHowWeTest,
    updated: firstNonEmptyString(e ? s.t1UpdatedEn : s.t1UpdatedZh, def.updated) ?? def.updated,
    minRead: firstNonEmptyString(e ? s.t1MinReadEn : s.t1MinReadZh, def.minRead) ?? def.minRead,
    footerCategoriesHeading:
      firstNonEmptyString(
        e ? s.t1FooterCategoriesHeadingEn : s.t1FooterCategoriesHeadingZh,
        def.footerCategoriesHeading,
      ) ?? def.footerCategoriesHeading,
    footerCompanyHeading:
      firstNonEmptyString(
        e ? s.t1FooterCompanyHeadingEn : s.t1FooterCompanyHeadingZh,
        def.footerCompanyHeading,
      ) ?? def.footerCompanyHeading,
    footerAffiliateLabel:
      firstNonEmptyString(
        e ? s.t1FooterAffiliateLabelEn : s.t1FooterAffiliateLabelZh,
        def.footerAffiliateLabel,
      ) ?? def.footerAffiliateLabel,
    footerCopyright:
      firstNonEmptyString(e ? s.t1FooterCopyrightEn : s.t1FooterCopyrightZh, def.footerCopyright) ??
      def.footerCopyright,
    footerBottom:
      firstNonEmptyString(e ? s.t1FooterBottomEn : s.t1FooterBottomZh, def.footerBottom) ??
      def.footerBottom,
  }
}

export function mergeTemplate1FromSite(
  siteT1Row: { t1LocaleJson?: unknown } | null | undefined,
): Template1Theme {
  return mergeTemplate1Layers(null, siteT1Row)
}

function mergeSiteT1Layers(base: SiteT1, override: SiteT1): SiteT1 {
  const out: SiteT1 = { ...base }
  if (typeof override.t1NavUsePageTitleForAbout === 'boolean') {
    out.t1NavUsePageTitleForAbout = override.t1NavUsePageTitleForAbout
  }
  if (typeof override.t1NavUsePageTitleForContact === 'boolean') {
    out.t1NavUsePageTitleForContact = override.t1NavUsePageTitleForContact
  }
  for (const key of T1_STRING_KEYS) {
    const v = override[key]
    if (typeof v === 'string' && v.trim()) {
      const writable = out as Record<string, unknown>
      writable[key] = v
    }
  }
  return out
}

/**
 * Merge Template1 copy layers: landing-template defaults first, then per-site overrides.
 * Each source may be a Payload row with `t1LocaleJson` or the raw JSON object itself.
 */
export function mergeTemplate1Layers(
  templateT1: { t1LocaleJson?: unknown } | Record<string, unknown> | null | undefined,
  siteT1: { t1LocaleJson?: unknown } | Record<string, unknown> | null | undefined,
): Template1Theme {
  const fromSource = (
    source: { t1LocaleJson?: unknown } | Record<string, unknown> | null | undefined,
  ): SiteT1 => {
    if (source && typeof source === 'object' && 't1LocaleJson' in source) {
      return siteT1FromLocaleJson(source as { t1LocaleJson?: unknown })
    }
    return siteT1FromLocaleJson({ t1LocaleJson: source })
  }

  const s = mergeSiteT1Layers(fromSource(templateT1), fromSource(siteT1))
  return {
    t1NavUsePageTitleForAbout: Boolean(s.t1NavUsePageTitleForAbout),
    t1NavUsePageTitleForContact: Boolean(s.t1NavUsePageTitleForContact),
    en: blockFromSite(s, 'en', EN),
    zh: blockFromSite(s, 'zh', ZH),
  }
}

export function template1BlockForLocale(
  theme: Template1Theme,
  locale: AppLocale,
): Template1LocaleBlock {
  return locale === 'zh' ? theme.zh : theme.en
}

export function applyTemplate1Placeholders(
  template: string,
  vars: { siteName?: string; category?: string; n?: number; year?: number },
): string {
  let o = template
  if (vars.siteName != null) o = o.split('{{siteName}}').join(vars.siteName)
  if (vars.category != null) o = o.split('{{category}}').join(vars.category)
  if (vars.n != null) o = o.split('{{n}}').join(String(vars.n))
  if (vars.year != null) o = o.split('{{year}}').join(String(vars.year))
  return o
}
