import type { Field } from 'payload'

/**
 * Template1 shell copy (en/zh), stored as **one JSON field** (`t1LocaleJson`) so Cloudflare D1
 * Single JSON on `site-blueprints` keeps D1 column count low. See `publicLandingTemplate1.ts` for key names.
 */
export const template1SiteFields: Field[] = [
  {
    name: 't1LocaleJson',
    type: 'json',
    label: 'Template1 文案 (en/zh)',
    defaultValue: {},
    admin: {
      description:
        'JSON 对象：键与历史独立字段一致（如 t1NavAllReviewsEn、t1HomeTitleZh、t1NavUsePageTitleForAbout 等）。留空则用 public-landing 全局或代码默认。可粘贴 `scripts/seed-dev-data.ts` 中 `SEED_ALPHA_TEMPLATE1_DEMO` 结构作参考。',
    },
  },
]

/** 与 t1 同形 JSON；仅当 `sites.siteLayout` 为 `template2` 时参与 merge。 */
export const template2SiteFields: Field[] = [
  {
    name: 't2LocaleJson',
    type: 'json',
    label: 'Template2 文案 (en/zh)',
    defaultValue: {},
    admin: {
      description:
        '与 Template1 键名一致，用于整站第二套设计（template2）。留空则与 Template1 一样用代码默认中英文。',
    },
  },
]
