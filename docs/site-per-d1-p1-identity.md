# P1：中央注册表与身份边界

状态：身份核心、原始 SQL 隔离补强及云端 P0 回归已通过，尚未接通独立中央/站点部署，P1 不通过。完整目标及阶段门禁仍以 [执行方案](site-per-d1-execution-plan.md) 为准。

## 已实现

- `src/site-control/schema.ts`：显式中央初始化，建立站点注册表、用户站点授权、一次性票据及站点会话表。必须先建立中央 Payload Users schema；不在请求或 `onInit` 中自动迁移。
- `registry.ts`：稳定 siteId、D1 ID/binding/分组、schema/routing 版本、迁移状态、时区及生产开关。相同操作可重试，不能借重试把现有站点指向另一库。状态变更使用期望版本 CAS 并递增 routingVersion。跨库引用包含 `{ siteId, collection, recordId }`。
- `localSiteId` 保存原数字 `sites.id`，注册时必填，不能从稳定字符串 siteId 推断。不同 D1 可以保留相同数字 ID；同一注册操作不能改写既有映射。中央身份响应携带映射，RPC 客户端、认证策略及身份投影同步逐层核对可信上下文。旧 P0 上下文保留兼容分支，完整站点配置必须要求显式映射。
- `payloadSessionAuthority.ts`：每次读取原中央 `users_sessions` 及用户锁定状态，只选择必要字段。中央退出登录、会话过期、用户删除和锁定不会被站点缓存遮蔽。
- `sso.ts`：256 位随机票据，最长 60 秒，只保存 SHA-256 摘要；绑定站点、专用后台主机和路由版本。原子 D1 batch 将消费票据与会话写入一起提交。写入失败回滚消费，并发兑换只有一个成功。
- 站点会话不长于原中央会话，每次认证重新读取中央会话、站点状态和当前授权。授权降级/撤销即时生效，中央读取失败不会使用旧授权。中央用户删除会级联清除授权，避免数字 ID 复用继承权限。
- `src/site-runtime/siteIdentity.ts`：专用 `__Host-site-session` Cookie；只接受可信 ingress 设置的后台主机。身份投影仅保存中央用户 ID 和显示名，本地密码、JWT、API Key 与本地会话关闭。sanitize 后检查防止其他插件重新打开本地认证。公开匿名请求不查询中央服务。
- 写入 Origin 校验拒绝包括同站不同子域在内的跨源写入；中央/站点 POST 交接已有严格 Origin 检查，并通过真实浏览器验证。普通后台写入仍必须由正式站点 ingress 接入，不能把 fixture 当作现有部署的 CSRF 防护。
- 原始 SQL 与 nonce 存储已移除可变全局 D1 引用。站点上下文优先于调用方提供的原始 client；已标记的站点配置在缺失上下文时仍走严格代理，不会选择默认库。旧共享配置/CLI 从各自 adapter 获取绑定，nonce 测试使用显式 resolver。
- 云端源码编码检查现在遇到非 Latin-1 回归会停止构建，保留 P0 已验证的内存条件。
- 站点可见范围工具识别新身份，仅返回本站数字 ID，不查询中央团队或遍历站点；内容、作者、原创证据 hook 也约束可信内部任务的站点归属。质量否决 hot-cache 保留数字或 populated 关系中的站点 ID。collection/global 的旧角色 access 包装仍须由独立配置替换，不能仅凭此工具更新声称完整编辑权限已接通。

## 验证与范围

初始身份核心的 12 项定向测试通过，覆盖真实 workerd D1 batch、20 个并发兑换、60 秒边界、角色降级/撤销、中央退出/锁定/过期/不可用、插入失败回滚、用户 ID 复用、实际 Payload 认证策略与 Cookie/Origin 边界。静态检查和类型检查通过。

原始 SQL 隔离补强另通过 16 项定向测试（含 7 项新增），覆盖真实双 D1 同 ID 窄更新、同 nonce 并发唯一消费、错误原始 client、上下文缺失及路由过期。现有完整配置的 8 项 API 集成测试（租约、并发 tick、版本恢复与 nonce）也通过；未执行本地应用构建。

`17a6130f2957cb45d9cea87bf924d47d3e3805b4` 已通过 Cloudflare 构建 `16d2a773-54c5-4deb-a8d1-eda508668e96`：466 项测试、14 项浏览器检查、双站线上 smoke。2026-09-16T20:58:56Z 发布检查通过，P0 deployment `097284ad-8698-45cb-8a0d-e752ecb713a4`，version `e10a3083-c14c-46cc-bae9-179cde740011`。生产 deployment 仍为 `3046ffb1-b8ad-47ba-a373-9be5d0526c4b`。此记录对应身份核心提交。

原始 SQL 修复 `f82fd59210d6b6737f3fcea9c5830b977a79a4ad` 随后通过构建 `3b57e68f-801f-4dd6-8b40-2f4fcc98c142`：473 项测试、14 项浏览器检查；2026-09-16T21:14:50Z 双站线上 smoke 与发布检查通过，包含 40 个并发读取、12 个公开页面、R2、真实队列、nonce 及租约/心跳 SQL。P0 deployment `96460824-09e7-4def-a889-95c5be4caf60`，version `eb56bdc8-ca30-4d09-b35c-454ecc653465`；生产部署仍未改变。源码 non-Latin-1 为 0；云端诊断请求前堆 40,373,268 bytes、登录后 76,687,132 bytes，这些是 workerd 堆测量，不是新一轮线上容量验收。

中央/站点代码已在云端 workerd 中通过真实 named Service Binding 互调，并通过 Chromium 直接 HTTPS 的双站 POST 交接；[服务边界证据](site-per-d1-p1-service-boundary.md)明确了合成中央登录及最小站点身份集合的范围。新增控制表仍未迁移到生产或 P0 D1，当前部署仍使用 P0 临时密码账户，独立完整 Payload 配置尚未接入。不得把这些 fixture 证据写成生产 SSO 或 P1 验收。

## 下一步

1. 按 [配置拆分清单](site-per-d1-p1-config-boundaries.md) 实现独立中央和站点 Payload 配置。已核对全部 37 个业务 collection、7 个 global 及插件，并标记财务成本、质量 hot-cache 与关系副本等跨边界调用；身份投影同步只允许明确字段。
2. [服务与浏览器交接](site-per-d1-p1-service-boundary.md)已实现 named RPC、中央认证身份适配及 POST 交接；尚需挂载独立角色与正式入口。中央服务绑定认证与站点入口：签发身份必须取自经过认证的中央请求，兑换只允许中央源，站点 host 必须取自可信注册表映射。不得开放接收客户端 userId/sessionId 的签发接口。
3. 将已经过云端 RPC/浏览器检查的会话及身份投影同步接入完整后台：每次请求中央核验、普通写入 Origin 校验、中央登录/退出及权限修改；验证完整公开内容读取仍独立于中央。
4. 中央注册表管理/建站命令、专用测试资源和显式迁移；禁止把函数参数可接受的任意 D1 binding 当成远程资源授权。
5. 已部署双站 SSO、即时撤权、独立配置、完整编辑路径、MCP 明确 siteId 与权限测试通过后，才判断 P1 放行。

依据：[Payload 自定义认证策略](https://payloadcms.com/docs/authentication/custom-strategies)。固定版本 3.82.1 的 `payload/dist/index.js` 也已核对：任意 auth collection 未禁用本地策略都可能重新启用 JWT，因此必须在插件 sanitize 后检查所有 auth collections。

后续 `4208e39` 已完成云端原生身份服务/浏览器链路及身份投影同步验证，并通过 485 项测试、14 项既有浏览器检查与部署后回归；见 [本轮完整证据](site-per-d1-p1-service-validation.json)。当前 P0 仍为临时登录，正式配置接入与 P1 验收尚未完成。

`cbcfc2e` 随后加入数字站点 ID 映射及内容归属校验，通过 31 项定向测试、云端 492 项全套测试、14 项既有浏览器检查、原生 RPC/Chromium 映射故障注入和 P0 线上回归。[验证记录](site-per-d1-p1-local-id-validation.json)含部署身份与明确测试范围。生产部署未变；完整独立配置、真实编辑链路及 P1 放行仍待完成。
