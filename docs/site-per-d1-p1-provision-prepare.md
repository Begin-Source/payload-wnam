# P1 实际建库与 schema 准备

待 Cloudflare 验证。本轮把建站日志的前两步接到实际资源：创建/核对独立 D1，以及初始化固定 schema。执行完成停在 checkpoint 2；站点资料、分组部署、实际新站 SSO 和激活仍待接通，不能据此宣布完整 `site:provision` 工具完成。

## 执行范围

`scripts/site-operations/` 提供可复用的账户 API 客户端、受控 schema 初始化及准备执行器。只读预览不创建日志、数据库或 schema；apply 使用已有 180 秒租约和 30 秒心跳，先记录意图，再执行外部操作和提交回执。

当前 `scripts/ci-p1-provision-prepare.ts` 是明确的 P1 调用入口，只有同一提交的 Cloudflare 发布门禁和既有 P1 线上回归通过后才运行。它固定测试站 `p1-c`、数字 ID 103、租户 1、负责人 7、操作 UUID `f8d779c3-12a4-491c-b368-00f274be2bfd`，复用中央 D1 与分组 `p1-group-1` 的已核验身份。

它每次核对账户、中央 D1、目标 Worker tag、完整 D1 binding 清单、运行变量、服务/R2 绑定及兼容配置。第一次计划记录当时 deployment；重试保留原计划，准备数据库期间要求当前组配置仍与固定基线一致，并确认本次调用未改变 deployment。数据库准备不会上传 Worker 或添加分组绑定；后续部署执行器仍须独立检查当时版本和变更。

仅准备一个新测试资源，不批量建库；账户配额仍由 API 执行时约束。本轮成功不能证明千站配额或推广容量已经验证。

## 外部操作与恢复

- API 仅访问明确选定的 Cloudflare 账户；Token 只放请求头，不记录响应错误正文，不跟随重定向。
- 读取可重试网络/5xx；明确 `success:false` 的 429 可按 Retry-After 与退避重试，总请求尝试最多五次。超过 60 秒的等待交回操作流程，不截短供应商指定等待时间。
- 创建的 5xx、超时、网络错误或不完整成功响应视为结果不明，不自动重发 POST。恢复按固定完整名称查询，拒绝多重匹配、旧资源、改变的 UUID 或开启读副本的资源；查不到时继续保留 pending，等待后续核验。
- 数据库名称包含完整操作 UUID。只有已有意图且创建时间不早于意图的匹配资源才可恢复；新意图之前发现同名资源则拒绝接管。名称和时间核验仍不是 Cloudflare 提供的跨系统事务；外部在途请求需要实际对账。
- schema 必须匹配本次云端验证工件的完整 SHA-256 摘要。新库先写入绑定账户、站点、操作和数据库 UUID 的 `site_schema_bootstrap`；非空无主库拒绝初始化。逐批 CREATE 可恢复，已有对象定义或完成后的缺失对象都视为漂移。
- 初始化明确运行站点运行态迁移以建立必要计数器，最后再核对完整对象集合；已有数据和高水位不得被重置。中央日志的 schema 回执与 checkpoint 原子提交。

## 验证边界

新增云端测试使用原生 D1，但 Cloudflare HTTP 是替身，覆盖 API 退避/脱敏/写入不明、名称歧义、schema 归属与中断、原生日志恢复及重复执行。实际 P1 调用另使用真实 API 和远程 D1。

首次 P1 调用在数据库创建完成但中央回执尚未保存时主动抛出测试中断；随后以新执行器调用恢复同一意图。它不伪造网络超时，不声称实际杀死了 CI 进程。之后重复准备，核对 UUID 与两个回执完全一致；已有操作后续发布不再注入该故障。

准备后的新库不出现在站点注册表、不接入域名、不启用生产，也不能作为“新站全链路可用”的验收证据。下一步沿同一操作完成 seed、deploy、verify、activate，再提供完整云端命令和建站入口。

API 字段及分页依据 [D1 创建](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/create/)、[D1 列表](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/list/)与 [Cloudflare API 限速](https://developers.cloudflare.com/fundamentals/api/reference/limits/)。
