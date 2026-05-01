# AMZ 视觉对齐：`amz-template-old` ↔ payload-wnam

对照目录：`/Users/sunny/yourprojects/amz-template-old`。集成侧：

- **`amz-template-1`**：`src/site-layouts/amz-template-1/`（根目录为 chrome/主题，`pages/` 为路由级组件），对齐参考站的主要视觉与信息架构。
- **`amz-template-2`**：`src/site-layouts/amz-template-2/` — 与 template-1 **共用** `amzSiteConfigJson` / 合并逻辑；**差异**主要在路由级页面（如文章 **三栏 + TOC**、`/[locale]/product/[asin]`）。前台按 `sites.siteLayout` 在 `(frontend)` 各 `page.tsx` 分支加载对应 `pages/` 实现。

路由：`src/app/[locale]/(frontend)/`（前缀 `/{locale}` + 可选 `?site=`）。整站壳注册表见 `src/site-layouts/registry.ts`。

## 路由对照（完整）

| 参考 `app/` | Payload（示例 `en`） | 说明 |
|-------------|----------------------|------|
| `/` | `/[locale]/` | `AmzTemplateHomePage`（layout 1 或 2 各自目录） |
| `/reviews` | `/[locale]/reviews` | `AmzReviewsPage` |
| `/review/[slug]` | `/[locale]/posts/[slug]` | **v1**：`AmzArticlePage`（单栏）；**v2**：三栏 + TOC + 侧栏 |
| `/products` | `/[locale]/products` | `AmzProductsPage` |
| `/product/[asin]`、`/product/[asin]/[slug]` | `/[locale]/product/[asin]` | Active Offer 按 ASIN + 站点范围；无文档则 404。Canonical slug 重定向未实现（参考站行为）。 |
| `/category/[category]` | `/[locale]/categories/[slug]` | `AmzCategoryPage` |
| `/guides`、`/guides/[slug]` | `/[locale]/guides` | `AmzGuidesPage`（详情仍为 posts） |
| `/search` | `/[locale]/search` | `AmzSearchPage` |
| `/about`、`/contact`、`/privacy`、`/terms`、`/disclosure` | `/[locale]/about` 等或 CMS `pages` | `cmsStaticPageRoute` / `AmzStaticPage` |
| `feed.xml`、`robots.ts`、`sitemap` | 项目内其它实现 | 不以 UI 对齐为目标 |

## 壳层与参考的差异（刻意或非同等）

| 项目 | 参考 | 集成 |
|------|------|------|
| MDX 自定义块（ProsCons 等） | MDX 组件 | 依赖 CMS HTML/Lexical；无则无法 1:1 |
| `/product/.../slug` 规范链 | 重定向到 canonical slug | 仅 `/product/[asin]` |
| Analytics | `@vercel/analytics`、`GoogleAnalytics` | 未接入；可按 env 后续加 |
| 根 `layout` metadata | `siteConfig` + `getSiteUrl()` | `[locale]/(frontend)/layout` 按站点主题与 `getPublicSiteTheme` |
| 字体 | Geist + `next/font` 在参考根 layout | AMZ 使用 `amz-globals` / `theme-generator`；**v1** 根类 `amz-template-1-root`，**v2** `amz-template-2-root`（独立 globals 文件避免变量打架） |
| Footer 位置 | `SiteMobileLayoutPad` 内：children + footer | 已与参考一致：`AmzChrome` 内 footer 在 pad 内 |

## 迭代记录（实施要点）

- **AmzChrome**：`flex min-h-screen flex-col`；footer 放入 `AmzSiteMobileLayoutPad` 与参考一致。
- **工程结构**：`amz-template-1` 的 chrome/主题与 `pages/` 路由组件统一在 `src/site-layouts/amz-template-1/`；整站 layout 由 `src/site-layouts/registry.ts` 调度。
- **根首页 `page.tsx`**：AMZ 分支不再预取文章列表（仅 Template1 / ReviewHub / 默认博客需要），减少无为主页查询。
- **首页**：与参考 `app/page.tsx` 一致——Hero含 `layout="hero"` 搜索条与波浪 → 分类带 `layoutVariant="home"` → `bg-muted/30` 的 Featured Offers（最多 5 件 + 「View All Reviews」）→ `AmzHomeCta`。Featured 区使用 **分模板** `pages/AmzFeaturedOfferCard.tsx`（template-1 / template-2 各一份，不共用 UI）：双 CTA 对齐旧站 ProductCard——**Read Expert Review**（站内 `posts/[slug]`，数据来自 [`getFeaturedHomeRowsForSite`](src/utilities/publicSiteQueries.ts) 通过 `articles.relatedOffers` 反查）、**View on Amazon**（橙色 `#FF9900` + 外链图标，`offer.targetUrl`）。未关联文章时仅显示外链按钮。[`AmzOfferCard`](src/site-layouts/amz-template-1/pages/AmzOfferCard.tsx) 仍用于 `/products`、分类与文章内嵌。参考站首页**无**文章栅格，故不再渲染原「Latest reviews」文章区（`latestReviews` 配置仍存在于 JSON 默认值，供将来扩展）。
- **分类栅格**：`AmzCategoryBrowseGrid` 支持 `layoutVariant: 'home' | 'default'`；首页用 `py-16 md:py-24` 与 `gap-6` / `xl:grid-cols-5`。
- **Reviews / Guides**：`main.min-w-0 flex-1 overflow-x-clip`、`py-12`、`max-w-7xl`、标题 `text-4xl md:text-5xl`；Guides 首 chip 在英文下为 「All Guides」，对齐参考 filter 文案。**Reviews**：**v1** 仍为居中 chips + `AmzArticleCards`；**v2** 为侧栏 Categories（`lg:w-80`、`border-2` 圆角盒）+ 主区「Showing *n* reviews」与搜索条 + `md:grid-cols-2 lg:grid-cols-3` 双 CTA 卡片（`AmzReviewListingCard`，数据含 `relatedOffers`），URL 支持 `?category=`、`?search=`。**Guides**：**v1** 仍为居中 chips + 网格 `AmzArticleCards`；**v2** 为同类侧栏 + 搜索 + 卡片栅格 `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`（`AmzGuideListingCard`，阅读时间服务端由 Lexical 预计算），URL 支持 `?category=`、`?search=`。
- **Search**：`AmzSearchPage` 对齐 `search-results` 层次（图标 + H1、 pill 搜索、结果区 / 无结果 / 空查询 CTA + 双按钮）；内容为统一「文章」列表（无参考站 reviews/guides 分列）。
- **Products**：`main` + `max-w-7xl`、H1 尺度与商品栅格 `gap-6`、`md:grid-cols-2 lg:grid-cols-5`。
- **Category / Article / Static**：`main` 包裹；分类 H1 左对齐 + 可选 CMS `description`；文章标题 `text-4xl md:text-5xl`；静态页 `prose-lg` + 与 about 参考接近的 H1。
- **amz-template-2**：文章区为三栏 grid（TOC | 正文 | 侧栏 related + quick links），正文 prose 容器带 `data-amz-article-prose` 供 TOC 提取；`/product/[asin]` 使用 `getActiveOfferByAsinForSite`。首页 Featured 双按钮卡片与 template-1 同策略（各自目录内 `AmzFeaturedOfferCard`）。
