# P1 版本数据的内部传输

状态：内部服务、请求绑定客户端、560 项单元/集成测试、14 项浏览器检查、原生数据 RPC 检查及 P0 部署后回归均已通过。正式独立角色尚未挂载，P1 未验收。

## 服务与请求身份

`SiteDataService` 是独立 named WorkerEntrypoint，只提供 `readMaster`、`readConfig`、`readAsset`；HTTP fetch 返回 404。中央角色须显式绑定 `CENTRAL_D1` 与私有 `MASTER_ASSET_ARCHIVE`，站点通过选择该 entrypoint 的 Service Binding 调用。服务没有发布、票据签发、任意 SQL、管理令牌或数据库 getter。

每次读取都通过 `SiteLoginBroker` 检查站点会话、Payload 原中央会话、账号锁定、注册表状态、路由版本和当前经理授权。先验证权限，再读取固定版本。异步读取完成后再次验证，若期间撤权、降级、登出或本地站点 ID/路由改变，则不返回数据。任何基础设施错误只返回 `unavailable`，权限拒绝返回 `denied`；不返回原异常、SQL、会话令牌。

`siteDataClient(req, service)` 从可信 SiteContext 获取 siteId、localSiteId、专用后台主机和 routingVersion，从 host-only Cookie 获取会话。它要求独立站点 Payload 和当前经理身份，拒绝缺失/重复 Cookie。返回的读取 capability 只属于创建它的请求；即使目标还是同一个站点，也不能交给另一个请求复用。RPC 前后都检查上下文，返回 principal 必须匹配当前员工和本站映射。

该能力可直接用于已有的 `receiveMasterRelease`、`receiveConfigRelease`、`copyAssetToSite` 和 `synchronizeAssetWithdrawal`。传输成功不自动应用作者、模板、品牌或配额候选，也不替代显式的本地审阅与选择。

## 数据与权限边界

- 主数据仍读取固定依赖图与原摘要，限定注册站点当前中央租户。
- Global 配置可分发到多个租户；站点配额仍限定具体 siteId 与租户。
- 资产按原协议校验来源、大小和摘要；撤回只传元数据，不返回字节。
- 中央不可用时不使用缓存授权或公开下载路径降级。
- 这是员工会话驱动的交互能力。后台同步队列不能借用过期员工会话，后续须有独立的受限投递授权及回执协议。
- 正式站点的修改入口仍需执行 Origin/CSRF 检查；内部读取客户端不是公开 HTTP 控制器。

## 验证层次

`dataDelivery.int.spec.ts` 的五项原生 D1/R2 测试覆盖实际中央会话与权限表、租户边界、全局配置、撤权期间的异步 R2 读取、撤回、基础设施错误脱敏、登出、锁定和暂停路由。

`siteDataClient.spec.ts` 的五项请求测试覆盖可信作用域、Cookie、跨请求复用、伪造 principal、RPC 异常及异步路由变化。这层使用服务替身，不单独证明 Service Binding 运行时行为。

`ci-site-data-fixture.mjs` 由云端身份检查脚本调用，运行两个实际 workerd Worker、三个隔离 D1 和三个 R2 桶。使用真实 named Service Binding 完成主数据/配置候选写入、五次并发二进制资产复制及本地 ID 映射、跨租户拒绝、撤回和重试、经理降级立即拒绝。它使用最小角色 schema；完整 Payload 字段、文件端点和关系验证由既有资产集成测试覆盖。

服务并未挂到当前 P0 共享配置 Worker，也未替代真实独立角色的浏览器验收。云端 fixture 与 P0 部署后回归必须分开记录。

## 发布证据

提交 `427ef23` 的 Cloudflare 构建 `e898aa7e-1efa-44a6-8ebf-12e5550598b9` 成功；2026-09-17T09:45:04Z P0 线上回归与发布检查通过。P0 deployment `f996359a-1f8b-4611-93ce-d43439e4e4d8`，version `3757f91c-5feb-4868-8f06-fe95ec1efc4f`；生产 deployment 保持 `3046ffb1-b8ad-47ba-a373-9be5d0526c4b`。本轮未安装本地依赖或执行本地测试/构建。[结构化证据](site-per-d1-p1-data-service-validation.json)分别记录 Node 原生测试、workerd 数据 RPC、身份浏览器链路和共享配置 P0 回归。

## 后续正式接入

独立中央/站点构建入口、导出和绑定服务、按角色生成类型/import map/schema 并迁移测试资源；真实中央登录和站点审阅界面；发布来源投递、机器授权、队列重试/回执和覆盖各站的资产撤回。随后完成建站/暂停恢复/MCP 明确 siteId 及全链路 P1 验收，再进入 P2–P5。
