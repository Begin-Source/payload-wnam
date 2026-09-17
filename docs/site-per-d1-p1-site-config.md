# P1 独立站点配置

状态：本站配置 factory 和本地完整 schema 的读写验证已实现，尚未挂载正式站点角色或完成中央配置。P1 未验收；完整门禁仍见 [执行方案](site-per-d1-execution-plan.md)。

## 实现

`src/site-runtime/config.ts` 显式接收身份 RPC、两个独立 R2 binding、模型配置、AI 生成授权能力和外部任务执行能力。导入不读取旧 `payload.config.ts`，不发现远程模型、不自动 seed、不查询默认 D1。一个配置/实例由同组站点复用；所有业务及 Payload 自动集合、global 的操作都要求可信数字站点映射与原有严格 D1 请求上下文。

`configCollections.ts` 注册本站业务集合，保留内容质量、语言、分类、作者 GDPR、设计版本及布局同步 hook。排除中央组织、公告、员工财务、员工手册及 MCP 密钥；tenants/portfolios 只保留关系所需标识。身份集合仍是无凭据投影。复用业务定义前克隆，automation 插件的共享 workflow-runs 对象也在 sanitize 前克隆，防止一个角色污染另一个配置。

- viewer 只读；editor 可编辑草稿；publisher/manager 可发布及修改已发布文章/页面。站点元数据管理使用 manager，域名、归属、配额及审计/任务执行状态不允许本站 CRUD 改写。内部可信任务仍执行本站关系校验。
- 所有 sites 关系选择和校验都使用明确的 `localSiteId`；单值 site 字段默认来自该映射，支持上传等无需用户反复选站的操作。有站点归属的集合读写同时加入本站查询约束，版本表使用 `version.site`，下载须先通过文件记录归属检查；即使 R2 对象仍在本站前缀中，归属缺失的迁移记录也不能下载。原有团队/租户角色不授予本站权限。
- 公开文章/页面只读已发布记录，并限制公开字段，不返回成本、创建人及研究/任务元数据。身份、原创证据和私有文件不开放匿名读取。
- 公开 media 和 private-media 分别绑定不同的 R2 bucket，通过严格代理加 `sites/<siteId>/` 前缀。原创证据 media 关系指向 private-media；私有下载响应为 `private, no-store`。旧数据切换前必须迁移对应记录和对象，不能直接修改线上外键。
- 共享资料及配置增加只读 centralSource（recordId/revision/syncedAt）。本站原创记录可无来源；有来源则必须完整。这里只实现字段边界，尚未实现主数据同步、修订 CAS 或覆盖冲突处理。
- AI 插件关闭启动 seed，生成需要本站写权限及显式授权能力。automation 的文档 task 限定目标集合并强制 Local API `overrideAccess: false`；身份、控制、财务、审计和任务状态不属于通用 task 的写入目标。HTTP/邮件 task 需要 manager，并交给显式外部执行能力，没有直接调用供应商的默认路径。无后台身份的任务不会沿用保存的旧用户；P2 仍需接入任务授权与供应商配额/预算。

## D1 宽行更新修复

真实文章保存触发了 Payload 3.82.1 的 102 参数 upsert，超过测试 D1 的 100 参数限制。`payloadAdapter.ts` 仅在 Payload 把同一个行对象同时作为 insert values 和 conflict set 时，使用 SQLite 的 excluded 行复用对应值；保留同一条原子语句、全部字段和返回值。SQL 表达式及不同 conflict set 保持原行为。此适配仅用于新站点 factory，未修改固定版本依赖或旧共享适配器。

## 验证及边界

`tests/int/siteConfig.int.spec.ts` 从完整 factory 生成 schema，在内存中产生 SQL，显式初始化两个隔离 workerd D1 和两个 R2 bucket；不生成应用部署产物。测试实际 Payload 创建/编辑同 ID 分类与作者、跨站拒绝、文章发布角色与质量否决、质量记录站点归属、公开字段过滤、设计版本、双站同名公开/私有上传与文件访问权限。配置可重复 sanitize，原业务定义保持不变，启动无需站点上下文；操作缺少上下文或数字映射必须失败。

`tests/unit/siteConfigWorkflow.spec.ts` 验证四类文档任务强制访问控制、受限集合拒绝，以及外部能力调用的角色边界。此部分使用 Payload 替身，不等同于队列任务已上线。

R2 文件端点测试使用 SDK 为 Miniflare 提供的 development metadata 分支；完整站点角色在原生 Worker 中的上传/下载和浏览器界面仍待正式构建验证。当前生产及 P0 继续使用共享配置，不能把这些独立 schema 测试视为新角色已部署。

2026-09-17T03:08:50Z：提交 `d8537b3` 的 Cloudflare 构建 `4a9bc191-870e-4451-ac91-07b26acd09c3` 成功，503 项测试、14 项既有浏览器检查、原生身份 RPC/HTTPS 检查及 P0 部署后回归全部通过。P0 deployment `77495c2e-ede9-403b-ad42-66c2d00fbba8`，version `aefc5c3b-9972-4f69-ba4c-960a6c30a08a`；生产 deployment 仍为 `3046ffb1-b8ad-47ba-a373-9be5d0526c4b`。[发布证据与范围](site-per-d1-p1-site-config-validation.json)保留各项检查的适用边界；此发布不表示正式站点角色或 P1 已验收。

## 尚需接入

1. 独立中央配置、中央财务成本账本依赖、模板/作者/商品等主数据的字段同步及正式迁移。
2. 中央/站点角色各自构建、import map 与路由，可信 ingress、服务 binding、真实中央登录和 Payload 内置登录/退出衔接。
3. 现有单站管理动作与 admin 组件的服务入口适配；完整浏览器编辑与即时撤权验收。
4. 受控建站/退役/暂停恢复及 MCP 显式站点授权；P2 外部任务、供应商配额和预算能力；P3 公开缓存与私有存储上线策略。
