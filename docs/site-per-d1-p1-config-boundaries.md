# P1 独立配置拆分清单

本清单记录 `f82fd59` 代码审查后的实施边界，不代表配置已拆分或 P1 已验收。现有 `src/payload.config.ts` 注册 37 个业务 collection、7 个 global，另有插件和 Payload 自动生成的集合。已通过 P0 的请求隔离不能替代下列业务归属改造。

2026-09-17 实施进展：中央注册表增加必填 `localSiteId`，保存迁移前数字 `sites.id`；身份 RPC、认证策略和本地身份同步均核对该值与可信上下文一致。`resolveVisibleSiteIds` 对映射后的站点上下文只返回当前数字 ID，不查询团队或枚举站点；内容/作者/原创证据 hook 对内部任务也执行归属检查。质量否决 hot-cache 已兼容数字及 populated 关系，保留站点归属。站点的 collection/global access 和完整独立 factory 尚未接入，以上基础改造不能单独解除旧权限包装或作为 P1 通过证据。

控制表仍只用于隔离测试，尚未部署；本次调整的是未发布的初始控制 schema，不会自动 ALTER 任何已部署数据库。P0 旧共享配置仍不提供 `localSiteId`，保留既有权限语义；新的完整站点配置必须要求映射，不能沿用该兼容分支。

后续实施：[独立站点配置 factory](site-per-d1-p1-site-config.md)已实现，并通过两个原生 D1/R2 的完整 schema 编辑和权限检查；它替换本站权限包装、约束插件任务并分离公开/私有文件。尚未挂载正式角色；独立中央配置、主数据同步及角色构建仍待完成，P1 未验收。

中央配置后续实施：[独立中央 factory 与成本账本](site-per-d1-p1-central-config.md)已实现中央关系图、租户权限、凭据登录及基于对账证明的财务保存。实际来源导出/投递、主数据同步、正式 schema/角色构建和管理动作尚未接入；两套 factory 的测试通过不代表角色已上线。

## 业务集合归属

“副本”必须带来源及版本，使用明确字段同步；不能复制整份中央文档，也不能覆盖已审定的站点内容。站内关系继续指向站内数字 ID；稳定中央 `siteId` 与旧 `sites.id` 分别保存、显式映射，不能互相转换或从 slug 猜测。

| 现有 collection | 中央配置 | 站点配置及处理 |
| --- | --- | --- |
| users | 原用户、凭据、团队/角色、会话 | 仅身份投影；使用已实现的自定义认证策略，无凭据/本地会话 |
| tenants | 租户主数据与组织权限 | 最小只读标识副本，保留迁移关系；不承载授权 |
| teams、announcements | 中央业务 | 不复制组织成员与公告权限逻辑 |
| site-portfolios | 组合/项目主数据 | sites 引用所需的只读最小副本或显式中央引用 |
| sites | 注册表、所有者、分组、域名、全局管理状态 | 当前站点配置及展示资料；本库只能有受上下文约束的站点，不保留跨站管理权限 |
| site-blueprints | 模板选用/发布操作的中央入口 | 当前站点设计文档、版本、与 sites 的布局同步及恢复验证 |
| site-layouts | 公共布局主数据 | 版本化布局副本 |
| affiliate-networks、offers | 联盟及商品主数据 | 明确字段副本；站点分类、展示位置、允许站点关系在本站维护 |
| authors | 公共作者主数据 | 明确字段副本；本站 slug、分类和展示归属不能被同步覆盖 |
| social-platforms | 平台主数据 | 版本化副本 |
| social-accounts | 中央可看汇总及站点引用 | 本站 handle/status/notes；当前 schema 没有凭据字段，不凭空设计或复制账号密钥 |
| categories、pages、redirects | 仅带站点 ID 的摘要/导航 | 本站内容与关系 |
| keywords、content-briefs、serp-snapshots | 仅汇总 | 本站研究与任务输入 |
| articles、rankings、workflow-jobs | 仅汇总/操作入口 | 本站文章、排名、生产任务；保留质量、修订及租约语义 |
| original-evidence、page-link-graph | 仅必要汇总 | 本站证据、关系图；原始研究资料属于私有存储 |
| media | 中央品牌/公共主数据所用媒体 | 本站上传、公开媒体及受限证据分别处理，不沿用整个集合匿名可读作为私有媒体策略 |
| site-quotas | 配额政策、预算和变更版本 | 政策副本与本地使用量；`usageYtd` 不能同时由两端独立写入并互相覆盖 |
| click-events | 去重后的汇总 | 本站原始事件，后续归档 |
| commissions、affiliate-earnings-imports、affiliate-earnings-rows、commission-statements | 财务与对账主数据 | 不复制员工财务信息；站点事件以完整跨库引用回传 |
| tenant-prompt-templates、pipeline-profiles、keyword-batch-presets | 公共/租户主模板与版本 | 经选定的版本副本及显式站点覆盖；保留文章已有配置快照 |
| knowledge-base | 公司知识、公共研究和手册外的共享知识 | 现有质量 hook 向该 slug 写入 veto/hot-cache，需保留本站质量记录或显式迁移至独立集合；不能直接删掉 collection |
| operation-manuals | 员工操作手册 | 通过中央入口阅读，不复制整套管理权限 |
| audit-logs | 中央操作审计及汇总事件 | 本站操作日志；操作者关联身份投影，汇总引用含 siteId |

## Global 与插件

| 配置 | 拆分要求 |
| --- | --- |
| commission-rules | 中央财务规则；站点不执行财务重算 |
| quota-rules | 中央规则；站点读取明确版本的执行参数 |
| admin-branding | 中央主数据及站点必要展示副本；媒体引用须在对应数据库内有效 |
| llm-prompts、prompt-library、pipeline-settings | 中央主版本、本站选定副本与覆盖；禁止凭据进入同步数据 |
| public-landing | 本站公开内容，不作为所有站点共享的可变 global |
| multiTenantPlugin | 中央保留组织隔离；站点权限改用实时 SitePrincipal。不能把 viewer/editor 映射成旧 super-admin/GM 以绕开访问规则 |
| payloadAiPlugin | 中央知识与站点内容分别显式配置集合；关闭站点初始化查询/seed。生成接口须接入权限与后续预算门禁，不能只检查 `Boolean(req.user)` |
| seoPlugin | 站点 articles/pages/media；保留 URL、标题、图片及 noIndex 语义 |
| workflowsPlugin | 本站执行、关系与运行记录；公共模板按版本同步。六种通用 task 必须受本站上下文及权限约束，不能沿用可跨集合任意写入的信任范围 |
| r2Storage | 各角色显式绑定；站点前缀与公开/私有策略分离，不能复制中央 bucket binding |
| mcpPlugin | 中央保管 API key；站点操作显式 siteId 且每次验证权限。现有 super-admin 自动扩权逻辑不能直接复制到站点 |
| Payload 自动集合 | preferences、locked-documents、jobs、kv 和版本表均归各自配置；sanitize 后检查关系及认证边界，不能只审计手写 collection 数组 |

## 已发现必须改造的跨边界调用

1. `recomputeCommissionStatement.ts` 直接读取 articles/media/sites 计算员工成本。独立中央库不再含各站文章和媒体明细，必须改用有去重键和对账状态的中央成本账本；不得以跨所有 D1 扫描替代。P3 汇总尚未实现前，此财务流程不能宣称完成迁移。
2. `writeVetoHotCache.ts` 将站点质量记录写进 knowledge-base，并把旧数字 site ID 解析为数字。需保留本地质量记录和显式站点映射；不能用稳定字符串 siteId 直接替换后静默丢失归属。
3. Authors 的 sites/headshot/categories、Offers 的 sites/categories/network、KnowledgeBase 的 categories 都有本库外键。中央主数据与站点副本需各自字段定义，不能浅拷贝现有 collection 后简单过滤另一端集合。
4. Sites 的 owner/createdBy/portfolio/profile/preset/logo/hero 与 Blueprint 的双向布局同步跨越多个所有权类别。必须先同步必要副本，再写引用；删除中央站点不能直接调用现有 `deleteSiteCascade` 在中央库执行本站级联。
5. `siteScopedCollectionAccess`、`resolveVisibleSiteIds`、tenant/GM 权限、field.filterOptions 依赖旧用户 roles/tenants。站点身份不包含这些字段；需替换权限及站点字段选择，但继续执行 locale、作者归属、GDPR、设计合法性与质量验证。
6. MinimalDashboard、团队绩效、StrategyPanel 等管理视图使用共享库统计。中央应读取汇总，本站应只展示本地编辑操作；不要在独立中央配置中保留会查询缺失集合的原 dashboard。
7. 公开文章/页面/媒体读取与后台读取需要不同 access 条件；不能把所有 read 一律改成 `sitePermission('read')`，从而使匿名公开页面失效，也不能公开草稿和身份投影。
8. 固定版本 automation 插件的 `WorkflowRunsCollection` 默认 CRUD 全部放行，通用文档 task 调用 Local API 未显式设置 `overrideAccess: false`。独立站点配置必须覆盖插件生成集合的权限，并对 task 的目标集合、动作和实时授权施加约束；仅在手写 collection 上换 access 无法覆盖这些路径。其 `onInit` 在不传 `seedWorkflows` 时只初始化日志；站点不得传启动 seed。

## 配置实现与验证顺序

1. 用独立 factory 显式接收中央 D1 或站点严格代理、身份策略和对应存储；导入配置不查询数据库、不取供应商模型、不 seed、不迁移。现有共享配置继续用于未迁移生产。
2. 云端分别构建中央与站点角色产物；分组复用相同站点产物，通过显式 binding 清单部署。不能仅改运行时变量就假定 Next 已编译配置换成另一角色；每个角色均保留提交 marker、资源 preflight 和源码编码检查。
3. 实现字段级主数据/身份投影及来源版本，保持旧 ID/URL 与引用完整；注册表不与旧 numeric site ID 混用。
4. 分别 sanitize 两套实际完整配置，验证所有关系可解析、站点无凭据/本地认证、中央不注册站点内容及其执行 hook。
5. 对两个真实 workerd D1 执行本站编辑链路：作者/商品/媒体、分类/文章/设计版本、质量 veto、任务创建与跨站拒绝。中央独立验证财务、组织权限与汇总缺失时的明确状态。
6. 接通中央服务绑定、可信 ingress、SSO 浏览器流程和新测试站 provision；云端构建、上线编辑与即时撤权全部通过后才判断 P1。

证据来源：现有 `src/payload.config.ts`、上述 collection/global/hook 源码及 [生产外键图](site-per-d1-schema-graph.json)。外键图用于核对真实迁移范围，不替代运行时插件 sanitize 后的审计。
