# P1 主数据版本发布与候选接收

状态：不可变中央发布、依赖版本绑定、本站候选接收及新版身份的模板编辑权限已实现。候选尚未应用为 Payload 关系副本；正式服务绑定、投递队列、应用/选择界面及远程迁移未接入，P1 未验收。

## 发布与传输数据

`masterSnapshot.ts` 定义 format=1，按集合显式列出字段。当前支持联盟、社交平台、布局目录、作者、Offer、SEO 流水线方案、关键词预设、提示词模板八类记录。每个快照绑定中央集合/记录 ID、修订、租户、源更新时间、字段和依赖版本；依赖使用 `{collection, recordId, revision, digest}`，不复制中央数字 ID 作为本站外键。

- 本站分类、展示位置、审定稿、站点关系、profile 默认选择及关键词 `pillarKeywordId` 不进入通用快照。Offer 的供应商原始响应也不进入候选。
- Offer.network 和 template.pipelineProfile 必须映射到已发布的确切依赖版本；来源 ID、集合与租户均校验。
- 中央关键词预设 schema 已移除 `pillarKeywordId`，站点预设保留它供本地选择。
- 作者头像需要独立资产导出能力；当前遇到已设置头像的作者会明确拒绝发布，不能静默丢失头像。嵌入 Payload relationship/upload 的富文本同样拒绝，待实现关系与资产映射。
- 仅布局目录允许全局租户 0，并限中央全域管理员发布。其他记录必须有明确租户。
- 单条快照最多 128,000 bytes，完整包最多 512,000 bytes、32 条发布及 16 层依赖；只接收根引用可达的完整依赖图，拒绝附带无关记录。

`publishMasterFromPayload` 要求独立中央角色和管理员/总经理身份，通过真实 Payload 读取权限取得当前源记录；租户权限不以内部 overrideAccess 绕过。调用方提供源更新时间和预期上个修订；源变化要求刷新。对已成功操作的重试，仍核验当前源访问权与租户，再返回原不可变发布。

`commitMasterRelease` 是经授权后使用的内部存储函数，不是公开 API。`INSERT ... SELECT` 在 D1 实际写入时检查预期修订与租户，唯一操作 ID 保证相同重试只保存一次；竞争发布、修订跳号、同操作不同内容及跨租户改归属均拒绝。数据库 trigger 禁止改写或删除已有发布。

## 本站候选接收

`exportMasterBundle` 依据稳定 siteId、注册路由版本及中央 Sites 的当前租户导出根版本和依赖，读取后复核路由和租户。必须由认证过调用 Worker/目标站点的中央 RPC 使用；该函数本身不替代传输入口认证。

`receiveMasterRelease` 从站点 ALS 取得目标，不接受浏览器指定数据库或目的站点。它调用显式 `readBundle` 能力，并校验稳定 ID、保留的 localSiteId、路由版本、完整字段及 SHA-256 摘要。摘要用于数据完整性，不能代替 RPC 身份认证。

接收时由 SQL 对照 `sites.tenant_id → tenants.centralSource.recordId`，区分中央与本站租户数字 ID。全部候选及可用版本头在一个 D1 batch 内写入，途中失败全部回滚。映射缺失或转岗变更时拒绝；重复投递幂等，晚到旧版本保留历史且不降低可用版本头。

候选表为 `site_master_releases`，`site_master_heads` 仅代表已收到的最高版本，**不是生效版本**。接收不会写 articles/offers 等 Payload 文档，也不会改变现有 URL、分类、展示位置、站点已选方案或员工修改过的本地副本。

## 站点模板编辑权限

旧 profile/preset/template hook 依赖中央用户的 `tenants`，不适用于只含本站授权的新身份。独立站点配置现在以已配置 Site.tenant 为归属：创建时补齐该租户，修改时校验原归属和提交值；collection read/update/delete 同样加租户条件。manager 可编辑本站选定副本，editor 不可编辑这些管理配置；外租户导入记录不可读写。旧共享配置和中央配置继续使用原 hook。

## 验证与未完成部分

- `masterSync.int.spec.ts` 使用一个中央、两个站点原生 Miniflare D1，覆盖并发发布、CAS/幂等、依赖、跨租户与路由拒绝、异构数字 ID、乱序重试、候选批次回滚、已有修订冲突及本站内容不变。传输能力是 fixture，非实际 RPC。
- `centralConfig.int.spec.ts` 在完整独立配置中运行真正的发布、总经理租户范围、只读来源时间检查及准确操作重试。
- `siteConfig.int.spec.ts` 在双库完整独立配置中创建、选择并编辑带租户的方案/预设/模板，同时验证角色和外租户导入边界。

下一步必须把候选应用为本地 Payload 关系副本，持久化明确的中央版本→本地 ID 映射，支持冲突审阅及员工明确选择，不能用“已收候选”代替“可用副本”。还需资产导出/复制及撤回、配额与 Global 版本、传输认证、队列与回执、正式迁移及角色管理界面。全部 DDL 目前仅在隔离测试显式运行；没有请求启动自动迁移，也没有生产主数据同步发布。
