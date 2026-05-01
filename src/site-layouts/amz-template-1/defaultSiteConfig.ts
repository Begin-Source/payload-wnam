// 与 amz-template-1 `lib/site.config.ts` 的 `siteConfig` 同形；设计 JSON 缺省键时与此默认 deep merge。
//
// 使用说明：
// 1. 修改此文件中的任何配置项
// 2. 配置会自动应用到整个网站
// 3. 支持的配置包括：品牌、颜色、字体、SEO、导航、首页内容、页脚等

/** 首页 /products 分类卡片；`coverImage` 可选。默认：该分类下商品库中 `featured_home` 的主图（与首页 Featured 商品同源），否则无封面图 */
export type HomepageCategoryItem = {
  name: string
  slug: string
  description: string
  icon: string
  coverImage?: string
}

const homepageCategoryItems: HomepageCategoryItem[] = [
  {
    name: "General",
    slug: "general",
    description: "Replace with your category description (add more categories here as needed).",
    icon: "Image",
  },
]

export const defaultAmzSiteConfig = {
  // ==================== 品牌配置 ====================
  // 网站的基本品牌信息
  brand: {
    // 网站名称 - 会显示在 header、footer、SEO 标题等位置
    name: "Site Name",

    // 网站标语 - 简短的品牌口号
    tagline: "Site Tagline",

    // 网站描述 - 用于 SEO 和页脚简介
    description: "Site description placeholder.",

    // Logo 配置
    logo: {
      // Logo 类型：
      // - "lucide": 使用 lucide-react 图标库中的图标
      // - "svg": 使用自定义 SVG 代码
      // - "image": 使用图片文件
      type: "lucide" as const,

      // 当 type 为 "lucide" 时，指定图标名称
      // 可用图标：https://lucide.dev/icons/
      icon: "Image",

      // 当 type 为 "svg" 时，提供 SVG 路径数据
      svgPath: "",

      // 当 type 为 "image" 时，提供图片路径
      imagePath: "",
    }
  },

  // ==================== 颜色主题配置 ====================
  // 网站的配色方案 - 直接修改这些颜色值即可改变整个网站的配色
  // 颜色格式：OKLCH 色彩空间 - oklch(亮度 色度 色相)
  // 亮度(0-1): 0=黑 1=白 | 色度(0-0.4): 饱和度 | 色相(0-360): 颜色角度
  theme: {
    colors: {
      light: {
        // 主色 - 专业深灰色，适合摄影器材网站
        primary: "oklch(0.30 0.02 240)",

        // 次色 - 用于次要元素
        secondary: "oklch(0.45 0.02 240)",

        // 强调色 - 橙红色用于 CTA 按钮，代表快门按钮
        accent: "oklch(0.60 0.20 25)",

        // 背景色
        background: "oklch(0.99 0 0)",

        // 文字颜色
        foreground: "oklch(0.25 0.02 240)",

        // 卡片背景色
        card: "oklch(1 0 0)",

        // 边框颜色
        border: "oklch(0.9 0.01 240)",

        // 输入框背景色
        input: "oklch(0.9 0.01 240)",

        // 静音文字颜色（次要文字）
        muted: "oklch(0.95 0.01 240)",
        mutedForeground: "oklch(0.5 0.02 240)",
      },
      dark: {
        // 深色模式的颜色配置
        primary: "oklch(0.45 0.1 155)",
        background: "oklch(0.2 0.02 240)",
        foreground: "oklch(0.95 0.01 240)",
        card: "oklch(0.25 0.02 240)",
        border: "oklch(0.3 0.02 240)",
        input: "oklch(0.3 0.02 240)",
        muted: "oklch(0.3 0.02 240)",
        mutedForeground: "oklch(0.65 0.02 240)",
      }
    }
  },

  // ==================== 字体配置 ====================
  // 直接修改字体名称即可改变整个网站的字体
  fonts: {
    // 主字体 - 用于正文和大部分文本
    sans: "Geist",

    // 等宽字体 - 用于代码块
    mono: "Geist Mono",
  },

  // ==================== SEO 配置 ====================
  // 搜索引擎优化相关配置
  seo: {
    // 网站标题 - 显示在浏览器标签和搜索结果中
    title: "Site Title - Placeholder SEO Title",

    // 标题模板 - %s 会被页面标题替换
    titleTemplate: "%s | Site Name",

    // 网站描述 - 显示在搜索结果中
    description: "SEO description placeholder.",

    // SEO 关键词 - 帮助搜索引擎理解网站内容
    keywords: ["keyword-1", "keyword-2", "keyword-3"],

    // 作者信息
    author: "Site Name",

    // 网站 URL - 修改为你的实际域名
    siteUrl: "https://example.com",

    // 社交媒体账号
    social: {
      twitter: "@example",
    }
  },

  // ==================== 导航菜单配置 ====================
  // 网站顶部导航栏的菜单项
  navigation: {
    // 主导航菜单
    main: [
      { label: "Home", href: "/" },
      { label: "Products", href: "/products" },
      { label: "Reviews", href: "/reviews" },
      { label: "Guides", href: "/guides" },
      { label: "About", href: "/about" },
    ]
  },

  // ==================== 首页内容配置 ====================
  // 首页各个区域的文案和内容
  homepage: {
    // Hero 区域（首屏大标题区域）
    hero: {
      // 主标题
      title: "Hero Title",

      // 副标题/描述
      subtitle: "Hero subtitle placeholder.",

      // 搜索框占位符文本
      searchPlaceholder: "Search...",
    },

    // 分类区域（name/slug 须与商品库 `product.category` / categoryMap 一致，否则分类页无商品）。
    // Reviews 列表：若评测带 ASIN 且商品库有该 ASIN，筛选分类以商品库的 category 为准（与商品分类页一致）。
    categories: {
      title: "Product Categories",
      subtitle: "Product categories placeholder.",
      items: homepageCategoryItems,
    },

    // 特色产品区域（来自 CMS Offers.featuredOnHomeForSites）
    featuredProducts: {
      title: "Featured Products",
      subtitle: "Featured products placeholder.",
    },

    /** 首页「最新评测」文章列表文案 */
    latestReviews: {
      title: "Latest reviews",
      subtitle: "Fresh guides and recommendations from our team.",
    },

    // CTA 区域（邮件订阅）
    cta: {
      title: "CTA Title",
      subtitle: "CTA description placeholder.",
      emailPlaceholder: "Email",
      buttonText: "Submit",
    },
  },

  // ==================== 页面配置 ====================
  // 各个页面的标题和描述文字
  pages: {
    // Products 汇总页（按分类浏览商品）与 /category/[slug] 文案
    products: {
      title: "Products",
      description: "Browse gear by category. Expert-picked items with affiliate transparency.",
      /** 可选：显示在 /products 主描述下方 */
      indexNote: "",
      /** 分类详情页 H1：`{lead} {分类名} {suffix}`（suffix 可空） */
      categoryH1Lead: "Best",
      categoryH1Suffix: "— buying guide",
      /** 分类索引卡片：有商品时的计数文案，`{count}` 为数字 */
      categoryProductCountTemplate: "{count} products",
      /** 分类索引卡片：0 件商品 */
      categoryProductCountEmpty: "No products yet",
      /** 分类页底部 CTA */
      categoryBrowseOtherTitle: "Can't find what you're looking for?",
      categoryBrowseOtherDescription: "Browse our other categories for more recommendations.",
    },

    // Reviews 页面
    reviews: {
      title: "Reviews Title",
      description: "Reviews description placeholder. {count} reviews.",
    },

    // Guides 页面
    guides: {
      title: "Guides Title",
      description: "Guides description placeholder.",
      categories: ["General"],
      // CTA 区域配置
      cta: {
        title: "Guides CTA Title",
        description: "Guides CTA description placeholder.",
        primaryButton: {
          text: "View Reviews",
          href: "/reviews",
        },
      },
    },

  },

  // ==================== 页脚配置 ====================
  // 网站底部页脚的内容
  footer: {
    // 关于区域
    about: {
      title: "About Title",
      description: "About description placeholder.",
    },

    // 注意：分类链接现在从 homepage.categories.items 动态生成，无需在此配置
    // 注意：指南链接现在从 pages.guides.categories 动态生成，无需在此配置

    /** 页脚「Reviews」列中按分类筛选的链接文案。`{name}` 会替换为 homepage.categories 里的分类名（Products 列仍用原名）。 */
    reviewCategoryNavLabelTemplate: "{name} review",

    // 资源链接
    resources: [
      { name: "About Us", href: "/about" },
      { name: "Contact Us", href: "/contact" },
    ],

    // 法律链接
    legal: [
      { name: "Privacy Policy", href: "/privacy" },
      { name: "Terms of Service", href: "/terms" },
      { name: "Affiliate Disclosure", href: "/disclosure" },
    ],

    // 版权信息
    copyright: "Site Name. All rights reserved.",

    // 联盟声明
    affiliateNotice: "Affiliate notice placeholder.",
  },
}

export type AmzSiteConfig = typeof defaultAmzSiteConfig
