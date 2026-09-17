# P1 独立远程角色

本阶段为独立中央后台和双站后台的远程部署，不替代 P1 其余功能或 P2–P5 验收。

- 账号：基源科技 `d487cf34c606620b442632a72272014d`。
- 中央：`payload-wnam-p1-central`，`https://p1-hub.beginos.org`。
- 站点组：`payload-wnam-p1-sites`，稳定 ID `p1-a`、`p1-b`，入口 `cms-site-p1-a.beginos.org`、`cms-site-p1-b.beginos.org`，本地站点 ID 分别 37、82。
- 三个独立 D1 和四个独立 R2 的固定 ID 见 [资源记录](site-per-d1-p1-resources.json)。初始核验为新建空库、WNAM、关闭 D1 读副本和 R2 直接公开访问。
- 生产 `payload-wnam` / `hub.beginos.org` 的资源和域名归属保留。

## 发布和初始化

依赖安装、所有测试、类型生成、构建、schema 初始化、部署和浏览器检查只在 Cloudflare Builds 执行。`ci-p0-deploy.mjs` 在原 P0 回归通过后调用 `ci-p1-deploy.mjs`。两者都要求当前提交匹配成功构建标记，P1 额外核对账号、资源名称/ID、D1 读副本、R2 公开策略、域名归属和原生产版本。

完整角色测试生成单独的 schema-only 文件；远程初始化不读取带账号/数据的 fixture 文件。完整角色迁移同时覆盖配置/资产版本表；迁移自身创建成本版本号和 ID 水位等内部状态，重试不重置已有计数。`p1-schema.ts` 在空库中建立固定操作 ID、schema 摘要与完成状态。相同操作可续跑并保留数据；未知对象、不同摘要、已完成库出现缺失或变更均拒绝，不自动删表或改表。这是专用 P1 新库初始化，不代表通用 fleet-migrate 已完成。

`p1-bootstrap.ts` 通过云端远程 storage bindings 和独立 Payload factories 准备两个租户、站点注册/映射及单独合成用户。密码和两个 Worker 的 secret 每轮在 Cloudflare 内随机生成，不写入仓库或输出。仅允许这个专用用户存在，禁止把真实员工账号当作可重置的测试账号。

角色部署复用本次通过检查的独立 OpenNext 产物。中央先部署，站点通过三个 named Service Bindings 连接中央身份、主数据和路由服务。写入 secret 会产生新部署；待真实 HTTPS 连续就绪后，执行中央原生登录、选择器双站进入、同 ID 并发读写、原生后台、实时撤权和退出检查。测试撤权在 finally 中恢复。部署跨 Worker 不具备原子性，发布后检查失败须前向修复，不能声称自动回滚。

## 信任入口与未完成事项

`CENTRAL_ORIGIN` 必须由角色部署显式配置，只接受当前批准的生产/P1 中央 origin。一个角色只接受配置的那个 origin；请求头不能替换入口。站点票据 POST、匿名跳转和退出使用同一显式配置，禁止 P1 与生产中央入口混用。

邮件发送尚未接入真实供应商。独立角色使用明确失败的适配器，避免 Payload 开发日志传输输出认证邮件/重置令牌；不能把日志输出当作邮件送达。

首次远程构建/部署/浏览器结果待记录。建站生命周期、MCP、主数据投递/界面、完整运维命令、生产迁移和容量试运行继续按总方案推进。

2026-09-17T14:00:43Z，项目构建令牌补充仅限 `beginos.org` Zone 的 DNS Read 权限，以执行发布前域名冲突检查；没有增加 DNS 写权限。
