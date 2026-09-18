# 建站申请的 Cloudflare 构建派发：实现约束

状态：2026-09-18 已按本文约束启用并完成真实 Queue/Cron/Deploy Hook 验收；[云端结果与恢复记录](site-per-d1-p1-dispatch.md)。本文不替代完整执行计划，P2–P5 仍须分别验收。

## 已核实的平台能力

- Deploy Hook 固定一个分支，POST 返回 `build_uuid`。只有 queued/initializing 阶段合并重复触发；进入 running 后重复 POST 可以新建构建。因此网络超时不能作为再次触发的依据。[官方 Hook 说明](https://developers.cloudflare.com/workers/ci-cd/builds/deploy-hooks/)
- 构建环境提供 `WORKERS_CI_BUILD_UUID`，可与当前 Git SHA、分支及提交匹配的 release marker 一同检查。不能通过仅匹配分支或最近一次提交推测当前构建 ID。[官方配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- Builds 支持 started、failed、canceled、succeeded 事件投递到 Cloudflare Queue，包含构建 UUID、账户、Worker 名称、仓库/分支/提交和事件订阅 ID。可用固定订阅的 Queue 消费者接收终态，避免向普通中央 Worker 添加账户管理令牌。[官方事件结构](https://developers.cloudflare.com/workers/ci-cd/builds/event-subscriptions/)
- Builds 管理 API 和构建部署令牌用途不同；API 文档要求用户级令牌。不能假设现有部署令牌可以管理或读取所有构建配置。[官方 API 指引](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)

## 必须保持的交接

人员申请仍只保存当前六项业务输入。申请与待派发记录需要同库原子写入；取消和实际预约的权限竞争继续由现有 D1 触发器裁决。派发只选择已审定的分组/代码，不允许浏览器传入构建分支、资源 ID 或可执行路径。

每次触发前先持久化尝试 ID、原申请 UUID、明确分支和状态，使用条件更新争抢发送权。Hook URL 只存 Worker secret，不放入数据库、页面、源码或日志。成功响应必须保存确切 build UUID；网络异常、无法解析响应、进程在 POST 后终止都保留“结果不明”，不按租约过期自动再次 POST。一个正在运行的构建可以因重复触发出现多个竞争者，实际执行仍须按原申请和分组日志互斥。

云端执行器先检查自己的 build UUID、代码版本和完整构建门禁，再领取对应持久申请。准备、创建、初始化、部署、核验、激活仍复用已有日志，禁止为重试另造站点 UUID 或重新生成计划。构建成功并不等于该申请完成；界面的“已建成”始终来自原六步完成回执。

事件只从明确绑定的 Queue 入口接受，不暴露可伪造构建终态的公共 HTTP 接口。消费者检查账户、订阅 ID、Worker、仓库和预定分支；按 build UUID 幂等保存观察结果，终态不能被晚到的 started 事件覆盖，矛盾终态要求核查。Hook 响应丢失时，单凭相同分支/提交/时间不能认领其他构建；由云端执行器的确切构建身份交接，或由受限维护流程查询平台证据后关联。缺失事件不能推断失败。

## 接通前仍需解决

1. 新的中央兼容迁移、派发表/观察表、取消处理及原生 D1 并发和故障测试。
2. 固定分支 Hook、专用事件 Queue/订阅、重复/乱序/失败/取消与未知触发的真实云端验收。
3. 六步执行器当前使用负责人密码做浏览器验收。自动申请不能要求保存真人密码，也不能复用合成账号重置机制；需要明确的运行检查与人员首次登录验收协议，并证明不会放松权限及激活保护。
4. 有界批次与后续申请续接；一个构建不能无界清空队列。同组恢复优先于新操作，后续普通发布保持完整历史。
5. 人员可理解的等待/失败/核查/重试状态，重试前读取真实构建终态与已有基础设施回执。任何新重试必须回到原 UUID。

以上工作须在 Cloudflare Builds 安装依赖、执行全部测试与构建后，再启用固定测试资源的自动路径。本地仅修改源码/文档、静态检查和 Git。
