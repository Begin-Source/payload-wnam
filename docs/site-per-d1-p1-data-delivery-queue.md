# P1 固定引用 Queue 投递

状态：真实 Cloudflare Queue 生产者、站点消费者、专用死信队列及主数据候选远程投递已经通过；经理端投递历史/重试界面，以及 Config、Asset 和撤回的真实远程投递验收尚未完成，因此完整 P1 仍未放行。

## 已实现链路

- Central Worker 在校验中央会话、实时经理权限、站点路由和固定引用后，先写入 `site_data_deliveries`，再向目标分组 Queue 发送消息。
- 操作级能力由稳定 Worker secret 和 `operationId` 通过 HMAC 派生。D1 仅保存能力摘要，原始能力只存在于 Worker secret 和加密 Queue 消息中；同一请求重试会生成完全相同的消息。
- Queue 消息固定 `siteId`、Worker 分组、路由版本、类型、引用和引用摘要。站点消费者在写入前重新从中央路由服务核对绑定、数据库、主机、schema 和路由版本。
- 站点消费者支持主数据、配置和资产候选接收。资产字节只暂存到私有 R2；撤回先写 D1 tombstone，再覆盖公有/私有对象，普通投递不会自动改变经理已经选择的版本。
- 候选持久化后才提交成功回执。若站点已写入但回执响应丢失，重复消息先验证候选并幂等补交回执，不会重新读取或覆盖候选。
- 失败只记录有界错误码并按 Queue 延时重试；中央日志最多记五次尝试并进入 `dead`，Cloudflare consumer 绑定专用 DLQ。

## 云端构建与远程验收

实现提交为 `aebcde8`。首轮 Cloudflare Build `99e5bcea-0903-49c1-82fc-365b9d1a61d4` 在部署前失败：新增 Queue 集成测试的精简 D1 fixture 缺少 `site_quotas` 表；其余 139 个测试文件和 740 项测试已通过。`fac340a` 只补齐该 fixture，并触发 Build `e46ec5f7-4a8c-438f-91da-fabf341871a3`。该构建于 `2026-09-18T14:30:57.015Z` 成功结束，140 个测试文件、742 项测试全部通过，随后完成两个角色部署及真实 HTTPS/Queue smoke。

本轮 Central deployment 为 `5d83e093-2f39-471f-9420-2e0cce3488d9`，version 为 `b9a380c6-46e4-4002-8e41-f5ab5cd56fce`；Site deployment 为 `86bcbc68-c759-46c2-aeef-fcde107e7048`，version 为 `30f95e76-b1a0-4a56-8aad-f2f08eae9923`。生产 Worker deployment 保持 `3046ffb1-b8ad-47ba-a373-9be5d0526c4b`。

Cloudflare Queue `payload-wnam-p1-data-group-1`（`8e1846e9fcce4b4ba163f185063a9580`）由 Central Worker 生产，Site Worker consumer `e65dbcb57ed84913a040dc0257057d78` 消费；consumer 配置为 batch 10、并发 1、最多重试 5 次，并绑定 `payload-wnam-p1-data-group-1-dlq`。

远程 smoke 通过真实中央浏览器会话提交 `master` 投递 `e2d85fec-c07b-4694-8f97-3d37ab55eac9`，目标为 `p1-a`、路由版本 155。中央 D1 在一次尝试后于 `2026-09-18T14:23:00.637Z` 记录 `succeeded`，固定引用摘要与回执摘要均为 `ce828faed10479e20a6da739828ceba702e24a36c33483aa097c99a42531eec2`。直接查询站点 A D1 确认 `authors/990001@1` 候选存在，中央和站点内容摘要同为 `125bb77c8d0227b332443d7daf7bd089aaaa69f2f86dc37d19e6eb465c04e53d`。完整机器可读证据见[验证记录](site-per-d1-p1-data-delivery-queue-validation.json)。

## 剩余边界

本轮远程验收实际传输的是主数据。Config、Asset、资产撤回和第五次失败进入 DLQ 由原生 D1/R2 集成测试及 Queue consumer 测试覆盖，尚未各自通过真实远程 Queue 验收。经理端还没有投递历史、候选审阅和受控重试界面；真人员工交接、邮件以及完整多组管理也未完成。该 Queue 只属于 P1 共享版本数据投递，不能作为 P2 内容生产队列、发布队列、供应商限速或每日调度已经完成的证据。
