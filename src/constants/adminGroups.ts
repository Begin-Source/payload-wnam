/**
 * Payload Admin 侧栏 `admin.group` 文案 — 产品 IA（首页 / 网站 / 商务 / 运营 / 社媒 / 团队 / 财务 / 知识库 / 系统）。
 * 「网站」与「商务」为同级分组；`affiliate-networks`、`offers` 使用 `business`。
 * 侧栏分组顺序由 `payload.config` 中 `collections` 注册顺序决定：二者紧跟核心网站项之后、社媒之前，使 **网站 → 商务 → 社媒 → 运营…**。
 * 见 [admin_集合与菜单清单_b67b5100.plan.md](../admin_集合与菜单清单_b67b5100.plan.md)「产品 IA 定稿」。
 * `payload-mcp-api-keys` 侧栏分组为「系统」，在 [src/payload.config.ts](src/payload.config.ts) 的 `mcpPlugin.overrideApiKeyCollection` 中设置。
 */
export const adminGroups = {
  home: '首页',
  website: '网站',
  business: '商务',
  operations: '运营',
  social: '社媒',
  team: '团队',
  finance: '财务',
  knowledge: '知识库',
  system: '系统',
} as const
