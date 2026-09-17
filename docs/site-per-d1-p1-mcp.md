# P1 中央站点管理 MCP

提交 `e1664b3` 已通过 Cloudflare 构建、完整 Worker 和实际 HTTPS 验收；2026-09-17T16:47:12Z 独立 P1 发布通过。完整目标和 P1 其余要求仍未完成。[构建、失败修复与直接 API 核验记录](site-per-d1-p1-mcp-validation.json)。

## 入口和身份

独立中央角色提供 `/mcp`，P1 地址为 `https://p1-hub.beginos.org/mcp`。它使用 Streamable HTTP 的无状态 JSON 响应模式；POST 处理 MCP 请求，GET 不提供 SSE 订阅，认证后的 GET/DELETE/OPTIONS 返回 405。它不向站点角色安装通用 MCP CRUD 插件，也不暴露共享旧配置的默认数据库。

客户端必须显式配置 `Authorization: Bearer <中央 Payload 登录 JWT>`。沿用真实中央登录和原会话有效期；每次请求重新验证 JWT、用户锁定与原会话，不能把 MCP 连接当成永久授权。浏览器 Cookie 不授权 MCP，也不能补救错误的 Bearer；验证 JWT 时只传递调用方的 Authorization，不携带 Cookie。凭据不出现在工具参数、URL、日志或文档中。

此版本面向支持自定义 Bearer 请求头的客户端，不提供 OAuth 授权发现、授权码交换、长期服务账号或 API Key。用户退出中央会话后，旧 JWT 即使签名尚有效，也会被 MCP 拒绝。没有另行复制身份数据库或密码。

只接受部署明确选择的中央 origin；请求带 Origin 时必须精确匹配，拒绝 `null` 和其他来源。忽略调用方的站点头，不接受 URL 查询参数。单次 JSON 上限 16 KiB，不信任 Content-Length，拒绝批量 JSON-RPC 数组。所有响应 private/no-store，无跨请求共享的 MCP 会话、用户或站点变量。

## 工具与权限

| 工具 | 必填参数 | 权限与结果 |
| --- | --- | --- |
| `get_site` | `siteId` | 该站任一有效授权；返回状态、路由/schema 版本、当前角色及生产开关 |
| `pause_site` | `siteId`、`expectedRoutingVersion`、`operationId` | 该站当前经理；只允许 active→paused，撤销本站旧票据/会话 |
| `resume_site` | 同上 | 该站当前经理；只允许 paused→active，旧 Cookie 不恢复，生产开关不变 |

工具 schema 均要求明确稳定 `siteId`，拒绝数字本地 ID、域名、站点数组、额外 `userId`/`role`/`databaseId` 字段。即使只分配一个网站，也不能省略目标或自动猜测。先用 `get_site` 获取路由版本，改变状态时生成唯一操作 ID；网络重试保持站点、动作、预期版本和操作 ID 完全相同。

管理操作使用与 HTTP/后台按钮相同的[原子生命周期逻辑](site-per-d1-p1-lifecycle.md)：写入语句内再次验证有效会话与经理授权；状态改变和回执一起提交，重试不重复改变版本。迁移/准备/停用中的站点不能由此恢复；暂停 CMS 不代表 P2 生产任务已经排空或取消。

权限不足、版本冲突、服务不可用等工具执行失败返回 `isError: true`，结构化结果含 `status` 和不含基础设施细节的 `message`；客户端不能只检查 HTTP 200。401 表示需要重新登录，403 表示该站权限不足，409 表示状态或操作冲突，503 表示服务不可用。参数校验错误由 SDK 返回工具错误。传输层的缺少凭据、非法来源、超长/非法请求或协议头错误分别使用相应 HTTP 错误。

## 实现与云端验证

- SDK 固定为锁文件中已有的 `@modelcontextprotocol/sdk@1.27.1`，提升为直接依赖；使用项目现有 Zod 4.3.6。锁文件只补直接引用及该现有 peer 组合，不升级已锁定包。本地没有安装依赖。
- 使用 SDK 的真实 `McpServer`、Web Standard Streamable HTTP transport 和输入 schema；不手写 JSON-RPC 分发器。不提供 elicitation/sampling，明确拒绝相应 JSON Schema 编译能力，避免在 Worker 实例化默认动态代码编译器。
- 新增原生 D1 集成测试使用真实 SDK 客户端，但身份回调为替身；覆盖并发用户隔离、明确目标、越权、幂等/冲突、即时撤权、Cookie/Bearer 分离、协议与请求边界。JWT 验证必须由下列完整 Worker 检查补证。
- 完整中央 Worker 和远程 P1 检查使用真实中央登录 JWT、真实 SDK 客户端及实际 MCP 路由。SDK 的 HTTP 经 Chromium 发出，隔离 fixture 保持浏览器域名映射；远程验收正常使用 DNS/TLS。测试不输出 JWT/Cookie。
- 验证错误/缺失目标、无授权站点、Cookie 单独请求、有效 Cookie 搭配错误 Bearer、暂停/恢复和同操作重试。远程另验证旧站点 Cookie 拒绝、另一站不变、已有 MCP 客户端即时撤权和中央原生退出后的 401。
- 云端顺序调整为中央构建→中央完整检查→站点构建→双站完整检查，其后保留全部共享构建、14 项既有浏览器、原生 RPC、P0 及 P1 部署后检查。仍须同一提交全部通过才能生成发布标记。

本轮不新增数据表；中央保持 v2，站点保持 v1。通用建站、主数据界面与队列、邮件/真实员工交接、完整运维命令及 P2–P5 仍未完成。

## 已验证结果

- 构建 `8981d700-a3b3-4de2-936b-69784384f5de` 最终成功：118 个测试文件、599 项测试（含 6 项新增 MCP 测试）、14 项既有浏览器检查通过。所有依赖安装、测试、构建和部署均在 Cloudflare 完成。
- 完整中央 Worker 使用真实 JWT 与 SDK 通过目标/身份边界、暂停/恢复、重试及会话撤销检查；完整双站 Worker 检查通过，浏览器错误为零。
- 实际 `p1-hub.beginos.org/mcp` 通过同组检查，以及站点旧 Cookie 拒绝、另一站不变、已连接客户端即时撤权、原生中央退出后的 HTTP 401。真实 SDK 的后续请求也被拒绝。
- 中央 deployment `fc1a0c26-b09e-47fa-aa07-dcff9d2eb33f`；站点 deployment `6073d86c-7885-4247-813c-4ccfd6fd0942`。
- 2026-09-17T16:48:21Z 直接核验 A/B 均 active，版本分别为 11/1。此前 A 为 5；本轮 UI 四次和 MCP 两次状态变化各有一条回执，重试未额外推进版本。经理授权恢复、站点会话及可兑换票据均为零。旧轮次创建的一条中央会话行仍保留；本轮真实退出和旧 JWT 拒绝由实际 HTTPS 检查证明，不以总行数代替会话验证。
- 三个 D1 的初始化摘要未变、新建对象数均为 0；两个 P1 Worker 的 workers.dev/预览关闭。生产 deployment 仍为 `3046ffb1-b8ad-47ba-a373-9be5d0526c4b`，`hub.beginos.org` 仍属于原生产 Worker。
- 首次构建 `f4c49d95-9a66-4d89-8f6f-5d530bfc1a71` 在测试类型检查处失败，未部署；修正 SDK 结构化结果的类型收窄后上述完整链路通过。

实现依据 [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)、[MCP Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)及 SDK 1.27.1 的公开源代码；实际兼容性由云端真实 SDK 客户端验收确定。
