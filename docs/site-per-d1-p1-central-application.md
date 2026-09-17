# 独立中央应用

本项接入 P1 的完整中央 Payload 后台、REST API 和站点进入入口。2026-09-17T11:00:30Z，提交 `ea98d9c` 的完整中央 Worker/浏览器检查通过。完整计划仍以 [执行方案](site-per-d1-execution-plan.md) 为准。

## 应用边界

- `roles/central/app` 使用 Payload 原生 RootLayout、RootPage、REST handlers 和 server functions，沿用现有后台 CSS。应用根路径转到 `/admin`。
- `src/application-roles/central.ts` 仅创建中央配置。运行时明确要求 `CENTRAL_D1`、`CENTRAL_MEDIA`、`MASTER_ASSET_ARCHIVE`、足够长度的 `PAYLOAD_SECRET`；无共享 D1、R2 或 process secret 回退，媒体和归档必须是不同绑定。
- 构建配置仅在 Cloudflare Builds 且角色标记匹配时使用不可访问资源的占位 capability。构建和 import map 生成不会连接远程数据库，也不在启动时迁移。
- 中央 Worker 默认 HTTP 入口仅接受 `https://hub.beginos.org`，覆盖来源主机头、移除伪造站点头，后台响应为 `private, no-store`。named `SiteIdentityService`、`SiteDataService` 与完整应用一同打包。
- `/auth/enter-site` 使用真实中央 Payload JWT 会话认证，再由已有 broker 核验实时原会话和站点授权，生成 60 秒单次 POST 票据。
- AI 调用 capability 暂时拒绝；P2 接入预算/供应商限制后才允许执行。后台已挂载不等于供应商任务可用。

## 云端构建与检查

`scripts/ci-role-build.mjs` 在 `.cloudflare-ci/roles/central` 准备独立源码树。排除共享应用路由、中间件及 Worker，入口配置替换为中央角色；依赖复用本次 Cloudflare 安装的 lockfile 版本。每个角色有独立 import map、Next/OpenNext 输出和 Worker dry-run 包。共享应用构建产物保持供现有 P0 发布门禁使用。Wrangler/OpenNext 显式指定角色配置，避免继承上层 CI 配置；生成的类型须包含全部中央绑定。

角色构建包含 Wrangler 类型生成、Payload import map 生成、类型检查、OpenNext 打包、已验证的源码编码处理及 Wrangler dry-run。角色 manifest 的数据库 ID 是 CI 合成值，`remote: false`，不能作为正式部署清单。

`scripts/ci-role-central.mjs` 在云端启动完整中央 Worker，使用完整中央 factory 测试导出的合成 schema/数据及独立 D1/R2。Miniflare 使用显式模块清单与原生 Static Assets 路由，匹配完整 Worker 的动态模块和静态资源加载方式。Chromium 限定只能请求本次合成中央主机，该主机映射到云端隔离监听端口；仅此浏览器允许该监听器的自签名证书。Chromium 登录真实 Payload 后台，检查资源加载、主数据创建读取、中央无站点文章 API、真实 JWT 签发票据、无授权站点拒绝、会话撤销及桌面/手机布局。合成 fixture（含合成账号 hash）、截图和报告只在忽略目录 `.cloudflare-ci` 内生成，不进入仓库。

以上检查必须全部成功后 `ci-build.mjs` 才写入匹配提交的 release marker；随后既有流程执行 P0 部署及线上回归。

## 部署与未完成范围

2026-09-17 只读核验 Cloudflare 账号 `d487cf34c606620b442632a72272014d`：`hub.beginos.org` 的 Worker custom domain ID 为 `c167e7cd229ceeee3554b16fb07d1366d3cd2880`，当前属于生产 `payload-wnam`（zone `8d8fd673a6aeacf85360bc9e397d3002`）。独立角色不能直接覆盖这个入口；正式中央切换须使用执行方案的迁移、校验和恢复流程。

本项云端完整 Worker 检查仍是隔离验证，不能称为独立中央远程部署完成。站点应用、角色 schema 迁移/资源清单、完整 SSO 进入与退出界面、主数据选择界面、建站/运维及 P1 其余要求继续实施。P1 不验收。

## 接入期间已定位的问题

- 页面需要 `Promise<SanitizedConfig>`，角色配置保持 Payload 的异步接口。
- 旧写作辅助模块放在 `app/api/pipeline` 内；角色源码树保留这些被引用的辅助模块，排除所有旧 HTTP route controllers。
- 上层 Wrangler 配置可能被自动发现；角色命令显式传入 manifest，并断言生成的绑定类型。
- Miniflare 自动模块扫描不支持完整 OpenNext 包的动态 import，改为显式枚举打包模块。
- 隔离 HTTPS 浏览器曾因自签名证书阻断登录页/资源请求；针对隔离监听器调整浏览器参数，并采用原生 Static Assets 路由。固定版本中显式 host routes 直接指向用户 Worker、绕过资源路由，因此单角色监听器使用 assets-aware fallback。浏览器前先检查真实构建 JS/CSS 可读。不能将 HTTP 200 当作后台已可用。
- Payload 登录表单的 SSR 输入框早于客户端初始化出现，自动化必须等待官方 `data-form-ready` 信号；否则初始化会覆盖刚填写的值。还需等待网络稳定及字段校验（按上游登录 helper 保留 500 ms），提交前断言输入值保留，登录必须返回真实 HTTP 200。

正式部署前仍须接入中央账号邮件发送能力；当前没有配置邮件适配器，不能把密码重置/验证邮件列为已完成。

## P0 发布恢复

提交 `ea98d9c` 的全部构建检查通过，随后 P0 已部署为 `b4652653-52bc-4c09-9a51-3cf6b52dcd3a` / version `4e6bfc22-79df-4457-aeaa-e2e1ed59f8de`。线上 smoke 在测试登录成功后访问 `/admin/login` 返回 401，该轮发布未通过。生产仍为 deployment `3046ffb1-b8ad-47ba-a373-9be5d0526c4b` / version `34efc5b4-0c21-4dd7-a61d-f279b49068f5`。

测试凭据轮换会创建新部署；这次失败发生在轮换后，边缘生效延迟是待验证原因。恢复采用修正后云端重新发布：两站必须连续四轮通过携带新 gate Cookie 的匿名后台 GET（90 秒上限），随后仍执行全部线上 smoke。就绪检查不替代认证、隔离、并发及公开页面验收，也不把失败部署视为已通过或自动回滚。

恢复提交 `7086951` 的构建 `4e173867-675a-4aa1-8171-2b0271ed1fd7` 最终成功。该轮观察到两站第一轮均为 401，随后连续四轮均为 200，支持凭据生效延迟判断；2026-09-17T11:17:45Z 完整线上 smoke 通过（40 并发读取、12 并发公开页面、7 个共同服务两站的 isolate、4 项配置图标视图）。最终 P0 deployment 为 `999a2b50-d52d-4189-ad59-ae63787a1fe8`，version `65c64d43-ae2c-44a1-b22f-99449ed9b5bc`；生产部署未变。

[本轮验证证据](site-per-d1-p1-central-application-validation.json)记录全部 564 项测试、14 项既有浏览器检查、完整中央应用、原生 RPC、九轮失败及恢复的边界。所有依赖安装、构建、自动化测试和部署均在 Cloudflare 完成。本地仅编辑、读源码、检查 JavaScript 语法和 diff。
