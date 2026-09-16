# 设计与任务流程维护说明

## 发布方式

1. 从当前 main 创建功能分支，小批提交并推送 Begin-Source/payload-wnam。
2. Workers Builds 对分支运行 `pnpm run ci:build`。依次执行 ESLint、严格 TypeScript、隔离 D1 集成与单元测试、OpenNext 打包，以及桌面/移动端的七模板 CSS 浏览器回归。测试数据只存在于 Cloudflare 构建容器。
3. 全部成功后将通过验证的提交合入 main。生产仍完整执行门禁，随后校验账户及 D1/R2 ID、记录旧部署和 D1 bookmark、执行增量迁移、部署 Worker。
4. 部署后自动检查公开首页、产品、评测、站点地图、后台登录以及未登录接口的拒绝状态。构建失败不会发布新 Worker。部署后的检查失败会标记发布异常，但不会自动回滚已发布版本；应查看日志并选择修复或回退。

不要直接调用底层 `opennextjs-cloudflare deploy` 绕过门禁。本地不需要安装依赖或构建。

## AI 设计配置

- AMZ 1/2 共用配置结构校验。未知字段、错误类型、危险链接、非法颜色/字体及过大配置均会被拒绝；错误包含具体字段路径。
- AI 输出在写入前校验，导航及固定分类、页脚资源/法律链接由程序保留。有效设计直接应用。
- 已有的异常 JSON 在读取时按字段回退默认值，避免一处错误导致整个页面崩溃；不会因此批量覆盖生产旧数据。日志只记录蓝图 ID 和修复字段路径。
- Site Blueprints 使用 Payload 原生历史版本，最多保留 20 份，不启用草稿审批。已有蓝图补充初始快照。
- 在蓝图编辑页查看历史并恢复。恢复仍经过写入校验和站点/租户权限检查；损坏历史不可恢复。快照记录从本次迁移开始，更早历史不能凭空重建。
- 七种模板各自拥有根类名。新增模板时同时更新 documentSurface、样式作用域与浏览器回归。不要重新加入全局 `h1`、`p` 或 `:root` 主题覆盖。

## 工作任务

- D1 条件更新原子领取任务，成功者获得随机租约。租期 180 秒，每 30 秒续期；站点内容批次开始前也会确认续期。
- 进度、结果和释放操作都校验租约。过期执行者无法覆盖新执行者的状态。
- 同一站点的内容 runner 同时只允许一个有效租约。kick 先过滤可恢复任务再限制扫描数量，避免永久失败任务堵住恢复窗口。
- 租约过期的普通任务回到 pending；runner 可从持久化进度继续。没有租约的旧 running 任务按更新时间判断是否陈旧。人工强制恢复也不会抢走仍有效的租约。
- 管理列表可查看 heartbeatAt、leaseExpiresAt、attemptCount、errorCode。RUNNER_UPSTREAM_BLOCKED 表示已识别的上游阻断；永久错误需要修正输入。
- 租约防止同时执行和旧结果覆盖。外部 AI 请求若已产生费用、但进程在保存结果前中断，恢复时仍可能重做该外部请求；目前不保证跨服务的严格 exactly-once。

## Pipeline 接口签名

兼容两种已有明文 token：`x-internal-token: PAYLOAD_SECRET`，或 URL 的 `token` 参数。新客户端优先使用签名；日志和文档不要记录真实 token。

V1：HMAC-SHA256(secret, `METHOD:path:timestamp`) 的 64 位十六进制结果放在 `x-internal-token`，并带 `x-pipeline-timestamp`。时间戳可用秒或毫秒，最多过去 5 分钟、未来 30 秒。V1 在时间窗内仍可重放。

V2 使用以下头：

- `x-pipeline-signature-version: 2`
- `x-pipeline-timestamp`: 当前 Unix 时间戳
- `x-pipeline-nonce`: 每次请求独立的 UUID 或 16–128 位字母/数字/下划线/连字符
- `x-internal-token`: 以下消息的 HMAC-SHA256 十六进制值

```text
v2
METHOD
/path
canonicalQuery
timestamp
nonce
bodySha256Hex
```

每一项用一个换行符连接，末尾没有换行。METHOD 大写；canonicalQuery 使用 URLSearchParams，去掉 token 后按键稳定排序并序列化，保留重复参数值的顺序。请求体按实际发送的字节计算 SHA256，上限 2 MB。空请求体也要计算空字节哈希。

服务端先验证签名，再以唯一键原子写入 nonce 哈希。重复使用被拒绝；D1 不可用时返回 503，不能绕过防重放。内部转发对新的目标路径、参数和请求体重新签名。每次重试生成新 nonce。

## 后台组件与验证边界

- CollectionQuickActions 负责列表入口，具体快速创建与设计表单在 `components/quickActions/`。
- 建站面板模型在 `components/siteLaunch/panelModel.ts`；任务详情格式化在 `adminBackgroundActivity/bannerFormatters.ts`。
- 关键词抽屉首次打开时加载代码，记住首次点击的模式，失败可重试；后续打开复用已加载组件。
- CI 覆盖真实隔离 D1 并发领取、旧租约写入拒绝、无费用 tick、设计写入/恢复及跨租户拒绝、nonce 并发去重、签名篡改/过期、路由回退、延迟加载和七模板桌面/移动样式。
- 七模板浏览器测试使用实际构建 CSS 和固定页面夹具；生产自动检查为只读 HTTP 检查，不代表付费生成、第三方 API 和登录后的全部人工操作已经端到端验证。

## 回退

在 Cloudflare Worker 的 Deployments 中选择发布日志记录的上一版本。新增字段、历史表和 nonce 表保留，旧代码可以继续工作；迁移 down 不删除数据。代码回退不会自动恢复数据库内容。

如需恢复误改设计，优先使用蓝图历史。D1 Time Travel 会影响整个数据库，必须先确认恢复范围和时间点，再使用发布前记录的 bookmark。不要把普通代码回退等同于全库恢复。
