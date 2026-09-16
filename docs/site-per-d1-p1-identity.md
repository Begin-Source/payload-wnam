# P1：中央注册表与身份边界

状态：核心代码与本机定向测试已实现，尚未接通独立中央/站点部署，P1 不通过。完整目标及阶段门禁仍以 [执行方案](site-per-d1-execution-plan.md) 为准。

## 已实现

- `src/site-control/schema.ts`：显式中央初始化，建立站点注册表、用户站点授权、一次性票据及站点会话表。必须先建立中央 Payload Users schema；不在请求或 `onInit` 中自动迁移。
- `registry.ts`：稳定 siteId、D1 ID/binding/分组、schema/routing 版本、迁移状态、时区及生产开关。相同操作可重试，不能借重试把现有站点指向另一库。状态变更使用期望版本 CAS 并递增 routingVersion。跨库引用包含 `{ siteId, collection, recordId }`。
- `payloadSessionAuthority.ts`：每次读取原中央 `users_sessions` 及用户锁定状态，只选择必要字段。中央退出登录、会话过期、用户删除和锁定不会被站点缓存遮蔽。
- `sso.ts`：256 位随机票据，最长 60 秒，只保存 SHA-256 摘要；绑定站点、专用后台主机和路由版本。原子 D1 batch 将消费票据与会话写入一起提交。写入失败回滚消费，并发兑换只有一个成功。
- 站点会话不长于原中央会话，每次认证重新读取中央会话、站点状态和当前授权。授权降级/撤销即时生效，中央读取失败不会使用旧授权。中央用户删除会级联清除授权，避免数字 ID 复用继承权限。
- `src/site-runtime/siteIdentity.ts`：专用 `__Host-site-session` Cookie；只接受可信 ingress 设置的后台主机。身份投影仅保存中央用户 ID 和显示名，本地密码、JWT、API Key 与本地会话关闭。sanitize 后检查防止其他插件重新打开本地认证。公开匿名请求不查询中央服务。
- 写入 Origin 校验拒绝包括同站不同子域在内的跨源写入；后续必须由站点 ingress 接入，不能把这个独立函数的测试当作已上线 CSRF 防护。
- 云端源码编码检查现在遇到非 Latin-1 回归会停止构建，保留 P0 已验证的内存条件。

## 验证与范围

12 项定向测试通过，覆盖真实 workerd D1 batch、20 个并发兑换、60 秒边界、角色降级/撤销、中央退出/锁定/过期/不可用、插入失败回滚、用户 ID 复用、实际 Payload 认证策略与 Cookie/Origin 边界。静态检查和类型检查通过。

测试中的中央/站点代码尚未通过真实服务绑定互相调用；新增控制表没有迁移到生产或 P0 D1。当前部署仍使用 P0 临时密码账户。不得把这些单元/集成证据写成完整 SSO 或 P1 验收。

## 下一步

1. 独立中央和站点 Payload 配置，逐项处理 collection/global、插件、关系和业务 hook 的数据所有权；身份投影同步只允许明确字段。
2. 中央服务绑定认证与站点入口：签发身份必须取自经过认证的中央请求，兑换只允许中央源，站点 host 必须取自可信注册表映射。不得开放接收客户端 userId/sessionId 的签发接口。
3. 接入每次后台请求的中央核验与写入 Origin 校验、中央登录/退出、权限修改和浏览器跳转，验证失败关闭与公开读取独立性。
4. 中央注册表管理/建站命令、专用测试资源和显式迁移；禁止把函数参数可接受的任意 D1 binding 当成远程资源授权。
5. 已部署双站 SSO、即时撤权、独立配置、完整编辑路径、MCP 明确 siteId 与权限测试通过后，才判断 P1 放行。

依据：[Payload 自定义认证策略](https://payloadcms.com/docs/authentication/custom-strategies)。固定版本 3.82.1 的 `payload/dist/index.js` 也已核对：任意 auth collection 未禁用本地策略都可能重新启用 JWT，因此必须在插件 sanitize 后检查所有 auth collections。
