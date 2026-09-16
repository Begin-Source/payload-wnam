# P1 身份服务与浏览器交接

实施状态：代码和定向测试已实现，云端原生 RPC / Chromium 检查待本次构建验证。尚未挂载到独立中央/站点生产配置；本文件不代表 P1 放行。

## 服务能力

`SiteIdentityService` 是 Cloudflare named WorkerEntrypoint，只提供 authenticate、redeem、logout。中央角色将其作为命名导出，站点通过指定 entrypoint 的 Service Binding 调用。它不提供签发方法、broker getter、数据库访问或 HTTP 入口；`fetch` 返回 404。

中央 D1 与 Payload 原会话查询只存在服务端。错误仅返回 denied/unavailable，不返回原 SQL、用户记录、令牌或基础设施报错。站点客户端每次请求调用服务，检查返回身份及路由版本；RPC 前后均校验当前上下文，没有公开 HTTP URL 或缓存授权降级路径。

`logout` 按会话摘要、siteId 和专用后台主机删除记录，幂等执行，不依赖当前授权仍然有效。用户已被撤权或站点暂停时仍可销毁原会话，另一站点不能借相同 token 删除本会话。

## 身份投影同步

`syncSiteIdentityProjection` 仅在可信站点上下文中接收新近核验的中央 principal；显式写入 centralUserId/displayName 和时间戳，不复制角色、密码、散列或会话。中央用户 ID 唯一键使并发首次访问只生成一条记录；刷新显示名保留原本地 ID 和创建时间，未变化时不写库。两座真实 workerd D1 的 3 项测试覆盖 ID 保留、字段白名单、并发唯一性、缺失上下文、跨站及过期路由。

## 浏览器路径

1. 用户从 `https://hub.beginos.org` 同源 POST `/auth/enter-site`，表单只能包含 siteId。`centralIdentityFromPayload` 调用中央 `payload.auth`，禁用自动登录，只接受验证后的 users/local-jwt 与原 `_sid`；API key、匿名身份、客户端提供的 userId/sessionId 均不能签发。
2. 中央 broker 再读原会话和当前站点权限。响应为自动提交的 POST 表单，目标是注册表对应的专用主机 `/auth/site-login`，另有无脚本时的继续按钮。票据在表单体中，不放进 URL；响应 no-store、no-referrer、禁止嵌入，CSP 只允许当前 nonce 脚本及目标表单 origin。
3. 站点入口必须先建立可信 SiteContext，再调用 `siteSessionGateway`。它验证 canonical URL 与上下文主机，拒绝查询参数，仅接受来自中央 origin 的 POST。表单流实际读取最多 512 bytes，不信任 Content-Length，不接受重复或额外字段。
4. 通过 Service Binding 兑换成功后，站点设置 `__Host-site-session`（Secure、HttpOnly、SameSite=Strict、Path=/、无 Domain），并 303 到固定 `/admin`，不接受 returnTo/open redirect。
5. `/auth/site-logout` 仅允许当前站点同源 POST。中央删除会话后清除 Cookie、303 到中央入口；中央不可用时返回 503 并清除本地 Cookie，不伪称远程撤销成功。

普通后台写入仍需在正式 ingress 调用 `assertSiteWriteOrigin`。这些函数尚未挂入当前 P0 临时密码入口；新增路由不对现有生产开放。

## 检查及边界

- `tests/unit/siteSessionTransport.spec.ts`：8 项请求级检查，覆盖中央原会话身份、无凭据 URL 交接、跨源/伪造字段/重复字段/超长 body、匿名及错误脱敏、Cookie/固定跳转、错误主机、退出失败处理及 RPC 后路由变化。
- `tests/int/siteControlSso.int.spec.ts`：原 8 项 D1 测试之外增加按站点退出和撤权后删除会话，合计 9 项。
- `scripts/ci-site-identity.mjs`：只允许 Cloudflare Builds；云端打包两个 runtime fixture，在 Miniflare/workerd 中启动中央与站点 Worker，使用 named RPC binding 和三座隔离 D1。20 个并发兑换只能成功一次，20 个并发身份读取核对两站相同本地 ID 的隔离；覆盖降级、撤权、退出和中央异常。
- 同一云端脚本使用真实 Chromium 执行中央 POST → 自动表单 → 站点兑换 → `/admin`，检查 CSP/redirect/Cookie。浏览器网络入口通过 Playwright route 桥接到 fixture；服务间 RPC 与 D1 都由真实 workerd 执行。
- 中央浏览器登录是 fixture 注入的合成会话，站点是最小身份集合；不是已经部署的独立完整 Payload 配置。公开独立性此处只验证 fixture 响应，不能替代正式公开内容回归。
- CI 在原 14 项浏览器检查后执行该脚本；只有所有检查通过才生成当前提交 release marker。没有本地构建、部署或伪造 CI 状态。

## 正式接入仍需完成

独立配置与字段级投影同步；中央角色挂载 authenticated entry 路由并导出 named 服务；站点分组绑定该服务并从可信注册表建立 ingress；普通后台写入 Origin 检查及完整自定义认证策略；真实中央登录/退出、权限管理、建站与 MCP 指定站点；云端部署后完整编辑和即时撤权验收。

依据：[Cloudflare Service Binding / WorkerEntrypoint](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/)。固定 Payload 3.82.1 的 `auth/strategies/jwt.js` 已核对：验证 JWT 后检查原 users.sessions 并将 sid 设置为 `_sid`；中央 broker 仍对 D1 原会话作二次实时核验。

构建修复记录：`3c35cf7` 的构建 `30904bdc-627b-4797-bb63-9cd4e71952ba` 在首个 fixture POST 被 Miniflare 开发代理 Origin 校验拒绝，未进入发布。测试配置缺少 hub/站点 routes；补齐精确测试域名，使代理放行到应用的原有严格 Origin 检查，不放松应用校验。
