import type { Field } from 'payload'

/** Blog chrome fields (template-style names) for globals / legacy; design uses `blogChromeDesignFields` on `site-blueprints`. */
export const blogChromeTemplateFields: Field[] = [
  {
    name: 'blogPrimaryColor',
    type: 'text',
    label: '博客 · 主色（顶栏/按钮）',
    admin: { description: 'CSS 颜色，如 #2d8659' },
  },
  {
    name: 'blogAccentColor',
    type: 'text',
    label: '博客 · 侧栏强调色',
    admin: { description: '如 #e6c84a' },
  },
  {
    name: 'blogContentBgColor',
    type: 'text',
    label: '博客 · 内容区背景',
    admin: { description: '如 #f0f0f0' },
  },
  {
    name: 'blogCardBgColor',
    type: 'text',
    label: '博客 · 卡片背景',
    admin: { description: '如 #ffffff' },
  },
  {
    name: 'blogHeaderTextColor',
    type: 'text',
    label: '博客 · 顶栏文字色',
    admin: { description: '如 #ffffff' },
  },
  {
    name: 'blogHeadingColor',
    type: 'text',
    label: '博客 · 标题色',
    admin: { description: '如 #333333' },
  },
  {
    name: 'blogBodyColor',
    type: 'text',
    label: '博客 · 正文色',
    admin: { description: '如 #444444' },
  },
  {
    name: 'aboutTitle',
    type: 'text',
    label: '侧栏 · 标题',
    defaultValue: 'About Me',
  },
  {
    name: 'aboutBio',
    type: 'textarea',
    label: '侧栏 · 简介',
  },
  {
    name: 'aboutImage',
    type: 'upload',
    relationTo: 'media',
    label: '侧栏 · 头像图',
  },
  {
    name: 'aboutCtaLabel',
    type: 'text',
    label: '侧栏 · 按钮文案',
    defaultValue: 'Learn more',
  },
  {
    name: 'aboutCtaHref',
    type: 'text',
    label: '侧栏 · 按钮链接',
    admin: { description: '相对路径如 /pages/about 或绝对 URL' },
  },
]

/** Design overrides on `site-blueprints` (design* prefix in merge). */
export const blogChromeDesignFields: Field[] = [
  { name: 'designBlogPrimaryColor', type: 'text', label: '博客 · 主色' },
  { name: 'designBlogAccentColor', type: 'text', label: '博客 · 侧栏强调色' },
  { name: 'designBlogContentBgColor', type: 'text', label: '博客 · 内容区背景' },
  { name: 'designBlogCardBgColor', type: 'text', label: '博客 · 卡片背景' },
  { name: 'designBlogHeaderTextColor', type: 'text', label: '博客 · 顶栏文字色' },
  { name: 'designBlogHeadingColor', type: 'text', label: '博客 · 标题色' },
  { name: 'designBlogBodyColor', type: 'text', label: '博客 · 正文色' },
  { name: 'designAboutTitle', type: 'text', label: '侧栏 · 标题' },
  { name: 'designAboutBio', type: 'textarea', label: '侧栏 · 简介' },
  { name: 'designAboutImage', type: 'upload', relationTo: 'media', label: '侧栏 · 头像图' },
  { name: 'designAboutCtaLabel', type: 'text', label: '侧栏 · 按钮文案' },
  { name: 'designAboutCtaHref', type: 'text', label: '侧栏 · 按钮链接' },
]

/** Global fallback on `public-landing`. */
export const blogChromeGlobalFields: Field[] = [
  {
    name: 'blogPrimaryColor',
    type: 'text',
    label: '博客兜底 · 主色',
    defaultValue: '#2d8659',
  },
  {
    name: 'blogAccentColor',
    type: 'text',
    label: '博客兜底 · 侧栏强调色',
    defaultValue: '#e6c84a',
  },
  {
    name: 'blogContentBgColor',
    type: 'text',
    label: '博客兜底 · 内容区背景',
    defaultValue: '#f0f0f0',
  },
  {
    name: 'blogCardBgColor',
    type: 'text',
    label: '博客兜底 · 卡片背景',
    defaultValue: '#ffffff',
  },
  {
    name: 'blogHeaderTextColor',
    type: 'text',
    label: '博客兜底 · 顶栏文字',
    defaultValue: '#ffffff',
  },
  {
    name: 'blogHeadingColor',
    type: 'text',
    label: '博客兜底 · 标题色',
    defaultValue: '#333333',
  },
  {
    name: 'blogBodyColor',
    type: 'text',
    label: '博客兜底 · 正文色',
    defaultValue: '#444444',
  },
  {
    name: 'aboutTitle',
    type: 'text',
    label: '侧栏兜底 · 标题',
    defaultValue: 'About Me',
  },
  {
    name: 'aboutBio',
    type: 'textarea',
    label: '侧栏兜底 · 简介',
  },
  {
    name: 'aboutImage',
    type: 'upload',
    relationTo: 'media',
    label: '侧栏兜底 · 头像图',
  },
  {
    name: 'aboutCtaLabel',
    type: 'text',
    label: '侧栏兜底 · 按钮文案',
    defaultValue: 'Learn more',
  },
  {
    name: 'aboutCtaHref',
    type: 'text',
    label: '侧栏兜底 · 按钮链接',
  },
]
