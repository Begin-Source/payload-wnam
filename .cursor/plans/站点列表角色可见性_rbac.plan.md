---
name: 站点列表角色可见性 RBAC
overview: 按角色收窄 Admin「站点」集合读取范围——站长仅看自己创建的站点；组长看自己团队中站长创建的站点（与用户表中角色的并集）；运营经理与总经理看租户内全部站点；历史无创建人记录仅 GM/运营可见。沿用 multi-tenant 租户隔离。
todos:
  - id: schema-created-by
    content: sites 增加 createdBy（relationship users，可空）+ D1 migration；新建站点 beforeChange 默认写入 req.user（users）
    status: pending
  - id: access-sites-read
    content: 替换 Sites access.read（及必要时 update/delete/create）：叠加 denyPortalAndFinance + 角色 where（组长解析 teams.lead→members）
    status: pending
  - id: bypass-internal-apis
    content: 审计创建站点路径（种子/internal/job）：overrideAccess 或显式填 createdBy，避免破坏 Cron
    status: pending
  - id: verify-mt-plugin
    content: 确认与 plugin-multi-tenant 叠加顺序仍是租户 AND 角色 where；generate:types
    status: pending
isProject: true
---

# 站点列表：按角色的可见性（已定稿）

## 业务规则（你方确认）

| 角色 | `sites` 列表可见范围 |
|------|---------------------|
| 站长 `site-manager` | **仅** `createdBy === 当前用户` 的站点 |
| 组长 `team-lead` | 自己团队中 **`members`（站长）所创建** 的全部站点（`createdBy ∈ members`） |
| 运营经理 `ops-manager` | **租户内全部**站点（与现有多租户上下文一致） |
| 总经理 `general-manager` | **租户内全部**站点 |

### 已定边界

- **多角色同一账号**：取 **并集**（站长 ∪ 组长规则各自算出文档集合再合并）。
- **旧数据**：尚无 **`createdBy`**（为空）的站点 — **仅** **总经理 / 运营经理** 可见；**站长 / 组长** 列表中 **不出现**该批文档（直至管理员补创建人或脚本回填）。

### 不变前提

- **Super Admin / system-admin / env 超管邮件**：维持既有全局绕过（[`userHasUnscopedAdminAccess`](src/utilities/superAdmin.ts)），不参与租户内收窄逻辑。
- **Finance / 仅公告 Portal**：维持 [`denyPortalAndFinanceCollection`](src/utilities/userAccessTiers.ts) 行为。
- **租户隔离**：[`multiTenantPlugin`](src/payload.config.ts) 对 `sites` 的包仍在；最终应为 **`租户约束 ∧ 角色 where`**。

## 现状缺口（为何要改）

- [`Sites.access`](src/collections/Sites.ts) 使用 [`loggedInSuperAdminAccessFor('sites')`](src/collections/shared/loggedInSuperAdminAccess.ts)，集合层对「登录用户」过宽；**未按创建人或团队收窄**。
- [`Site`](src/payload-types.ts) **无** `createdBy` 字段；无法落实「站长只看自己创建」。
- [`Teams`](src/collections/Teams.ts) 有 `lead`、`members`，但 **未参与 `sites` read**。

## 实现要点

### 1. 数据模型

- 在 [`Sites`](src/collections/Sites.ts) 增加 **`createdBy`**：`relationship` → `users`，**可选**（兼容旧行）。
- **`beforeChange`（create）**：若 `req.user` 为 `users` 集合且未指定 `createdBy`，写入当前用户 id。
- **Migration**：给 `sites` 表增加 `created_by_id`（可空 FK）；**不回填**旧数据（符合「仅 GM/运营可见空创建人」——通过 **access where `createdBy` 存在** 对站长/组长生效）。

### 2. `read`（以及一致的 `update`/`delete`，按需）

新建辅助模块（例如 `src/collections/access/sitesAccess.ts`）或内联，逻辑概要：

1. 若不满足 `denyPortalAndFinanceCollection` → false。
2. 若 `userHasUnscopedAdminAccess(user)` → `true`（全站）。
3. 若 `userHasTenantGeneralManagerRole(user)` **或** `userHasRole(user, 'ops-manager')` → **true**（租户由插件收窄）；可与现 [`superAdminOrTenantGMPasses`](src/utilities/superAdminPasses.ts) 对齐，注意 **运营经理** 需显式列入「租户全量」分支（当前不在 GM pass 里，但插件 + loggedIn 已是租户全量，实施时写清楚避免回归）。
4. 若 `userHasRole(user, 'team-lead')`：解析 **`teams`** where `lead === user.id`，汇总 **`members` id 列表**，返回 where：`createdBy in [...]`（若同时有站长角色，与下一步 **OR**）。
5. 若 `userHasRole(user, 'site-manager')`：where：`createdBy equals user.id`。
6. **多角色**：上述 **OR** 合并（并集）。
7. **站长/组长**：额外约束 **`createdBy` 非空**（使空创建人站点仅此二者不可见）；GM/运营不加此约束。

**性能**：组长路径可能对 `teams` 做一次 `find`（带 `req`）；可将结果缓存到单次请求或限制 depth。

### 3. `create`

- 站长/组长/运营等在租户内创建：默认带上 `createdBy`；**GM/超管**代建时可手动指定或沿用写入用户。

### 4. 审计绕过路径

- 搜索 `collection: 'sites'` + `create` / `update`，确认种子、internal token、`overrideAccess: true` 的 job **仍能创建站点**；必要时在这些路径 **显式设置 `createdBy`**（运营账号或系统占位用户）。

### 5. 验收

- 同租户两站长 A/B：A 只见自己的站；B 只见自己的站。
- 组长 L：`members` 含 A 时可见 A 创建的站，不可见 B 的（除非 L 兼站长且规则并集包含自己创建的）。
- 运营 / GM：租户内全部站（含 `createdBy` 为空的老数据）。
- 旧站 `createdBy` 空：站长与组长列表 **无**该记录；GM/运营可见。

## 参考文件

- [`src/collections/Sites.ts`](src/collections/Sites.ts)
- [`src/collections/shared/loggedInSuperAdminAccess.ts`](src/collections/shared/loggedInSuperAdminAccess.ts)
- [`src/collections/Teams.ts`](src/collections/Teams.ts)
- [`src/payload.config.ts`](src/payload.config.ts)（`multiTenantPlugin` · `sites`）
- [`src/utilities/userRoles.ts`](src/utilities/userRoles.ts)
