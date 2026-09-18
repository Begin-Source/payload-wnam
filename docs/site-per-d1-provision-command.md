# 云端建站命令

`pnpm run site:provision --request <计划.json> --dry-run` 与 `--apply` 接通同一份持久建站日志的 database、schema、seed、deploy、verify、activate 六步。命令只允许在 Cloudflare Builds 中运行，必须有当前 Git 提交对应的 release marker 和已通过构建的完整站点产物。本地不安装依赖、不测试、不构建，也不直接运行这个命令。

## 输入与运行

`operations/p1-release.json` 当前选择 `operations/provision/p1-d.json`，它是固定 D 站操作，不是可重复创建新站的模板。`operations/provision/p1-c.json` 保留 C 的历史输入；四站清单上线后，旧 C 请求不包含 D，会因清单/来源不匹配而拒绝执行。不能通过修改旧计划或回执绕过检查。扩组后的历史站点由独立的 [`site:verify`](site-per-d1-site-verify.md) 按当前完整清单和各站原始所有权凭证核验。

旧恢复轮曾通过源码摘要保护的仅恢复模式补完验收。`86c9306` 已移除该选择并完成中央 v5、申请界面和动态控制器的实际发布，历史建站回执保持原值。D 文件现在是审定历史锚点，普通发布读取中央完整历史，不再固定重入 D。

计划 JSON 严格包含以下字段，不接受密码、Token、任意执行命令或部署代码路径：

- `plan`：`ProvisionInput` 的完整明确输入，包括永久 siteId、本地记录 ID、租户、负责人、操作 UUID、schema 版本和摘要、分组、binding、Worker tag、预期原 deployment、原清单摘要、时区与账户。派生的数据库名称、后台域名及生产开关由代码计算。
- `baseline`：现有分组的完整源清单，保留全部 D1、域名、R2、服务绑定、兼容配置和变量。其 JSON 属性顺序也是已保存摘要的一部分，不应在恢复时重新排序。
- `central`、`centralWorkerTag`：明确中央源清单、D1/R2、Worker 名称及 tag。
- `zoneId`：固定 beginos.org 区域。账户仍固定基源科技，仓库仍为 Begin-Source/payload-wnam。

仅在通过检查后的 Cloudflare 部署阶段调用：

```sh
pnpm run site:provision --request operations/provision/p1-d.json --dry-run
pnpm run site:provision --request operations/provision/p1-d.json --apply
```

新操作需要把 `SITE_PROVISION_EMAIL` / `SITE_PROVISION_PASSWORD` 通过云端环境提供给真实负责人登录验收；命令不重置人员密码。负责人邮件必须对应计划 ownerUserId。账户 API 凭据沿用受限 Cloudflare Builds 环境，不传入普通 Worker、数据库记录或浏览器。

执行前核验账户/区域归属、中央与分组 Worker tag、数据库名称/UUID/读副本、R2 归属和关闭的公开入口、完整绑定集合、既有域名和目标 DNS。明确源清单遗漏已登记站点、原 deployment 已改变、已有域名不归本组等情况均中止，不能用当前 CLI 默认账户或自动创建替代。

## 按持久申请 ID 执行

`4675520` 在验证分支 `feat/site-admission-executor` 接通以下入口：

```sh
pnpm run site:provision --request-id <申请UUID> --group p1-group-1 --fleet operations/fleet/p1.json --dry-run
pnpm run site:provision --request-id <申请UUID> --group p1-group-1 --fleet operations/fleet/p1.json --apply
```

文件来源和申请来源必须二选一，重复选项、额外资源字段、任意 fleet 路径和未明确的模式均拒绝。分组与 fleet 来自受限云端维护选择，不由普通浏览器请求指定。入口先调用同一云端规划器：预览仅检查，apply 先保存不可变计划，再调用既有六步执行器；不需要人员导出、编辑基础设施 JSON。

规划器生成的文件只用于两个云端进程之间交接。执行器在初始检查和各阶段 preflight 中重新读取中央申请，核对原 UUID、分配的数字 ID、人员输入及完整准备请求。apply 要求计划已持久化；文件被替换、中央计划不一致或申请已取消时拒绝。未准备的预览重新检查当前提交人/负责人资格，不保存计划。真正预约仍由同一条 D1 INSERT 中的触发器重新核对取消与权限，交接检查不替代这一原子保护。

中断后再次运行同一 UUID：规划器重用原准备请求，执行器从原六步日志恢复。完成后预览/apply 沿用原只读核验边界；如果分组后来又加入其他站，历史请求不能覆盖或重新解释新的完整清单，应使用独立 `site:verify`。自动派发及面向人员的后续状态对账仍待实现。

本入口已在 `8799a84` 用于[真实 E 申请建站](site-per-d1-p1-admission-e.md)，全部六步及只读重入通过；负责人浏览器验收仍要求云端临时环境中的对应登录凭据，不重置真人密码。原生完整 Payload/D1 测试已把真实持久申请接入全部六步，覆盖资料写入与上传回执前中断、一次建库/上传、完成后只读重入及原回执保持；Cloudflare 创建 API、上传和浏览器验收在该测试中仍为受控替身。

构建 `a48b6ada-92ec-43c9-bb43-eebc00cc5647` 于 `2026-09-18T03:31:02.317Z` 成功结束，GitHub 检查 completed/success：714 项测试 / 132 个文件、14 项既有浏览器检查及完整中央/站点/主应用和内部服务通信回归通过。申请层 12 项、命令边界 6 项、完整 Payload seed/恢复 5 项均通过。[本轮证据](site-per-d1-admission-executor-validation.json)包含终态及直接部署核对；远程生产和 P1 部署未变，唯一远程申请仍为前轮已取消的合成记录。

## 恢复语义

编排器重新读取持久 checkpoint，不接受调用方指定进度。checkpoint 0/1 进入建库/schema，2 进入 seed，3/4/5 进入部署核验与激活。每个原有阶段仍持有自己的中央租约与不可变回执，未明的外部创建或上传只核对来源，不盲目重放。

预览只检查当前可检查的阶段，并返回剩余步骤；它不承诺尚未创建的数据库已完成 schema 或运行态验证，不预约操作、不创建 D1、不写入应用记录。维护代理的临时连接和云端本地报告文件不等于业务写入。

checkpoint 6 的 `--apply` 也只读：核验当前部署/绑定、实际远程检查服务、域名、原站点归属及 active 路由，返回 `mutations: false`，不重跑 seed、不重传、不更改原六步回执。后续正常发布可能使用新 Worker 版本；历史建站 deployment 仍保留在回执中，不伪装成最新发布。

部署使用本提交已构建的共享站点产物，增加目标绑定和域名并保留原组全部成员。云端生成 `.cloudflare-ci/provision/<operationId>/target.json` 和对应模式的报告。P1 的[普通分组发布](site-per-d1-p1-provision-d.md)通过[动态完整历史与逐组发布协调](site-per-d1-fleet-management.md)，从 `operations/fleet/p1.json` 中的 C/D 审定锚点接入中央已完成申请，生成当前全部成员清单。建站预约和普通发布通过中央日志互斥，不能把旧三站清单强行上传。中央申请界面已部署；按申请 ID 的执行入口本轮接通，真实新增 E 申请执行已通过；自动派发及完整多组云端入口仍待验收。

## 激活验收与边界

先用命名内部 RPC 验证实际 D1 绑定、schema 所有权、站点/租户/负责人投影、提交与域名，再允许原子切换路由。随后通用浏览器验收通过中央表单登录、真实站点选择器和单次票据进入目标站，核对当前身份、原生站点编辑页、移动端、host-only Cookie、资源错误和退出。通用验收不改权限、不写测试内容，也不退出该用户的其他会话。

失败恢复仍由原 finalizer 执行：有效租约与预期版本下退回 provisioning、增加路由版本并使旧会话失效；人工暂停或租约已被接管时不得覆盖。命令本身不替代独立的撤权、并发跨站写入、故障和容量验收。

原生 D1/完整 Payload 集成测试从空操作执行全部六步，在本地资料写完/中央未完成、上传完成/回执未完成两处注入异常，验证同操作仅建库一次、上传一次、后续阶段恢复以及完成后的回执不变。测试中 Cloudflare 创建/上传使用受控替身；真实云端命令重入与浏览器验收应单独查看构建证据，不能据此声称通用新站创建已在真实 API 上完成。

首轮命令提交的云端类型检查发现浏览器 JSON 响应为 unknown，已增加明确响应结构校验后重新提交。该轮未进入部署；修复轮结果见下。

参考：[Wrangler 程序化 API](https://developers.cloudflare.com/workers/wrangler/api/)、[配置与原生绑定](https://developers.cloudflare.com/workers/wrangler/configuration/)、[Payload Local API 脚本](https://payloadcms.com/docs/local-api/overview)。依赖和兼容日期保持现有固定版本。


## 前轮实际验证：C 站只读重入

提交 `0848d185ab407247a9c8359359a8717468fb2eeb` / 构建 `798ef56b-1d64-45fa-a09b-62e9f4839b25` 于 `2026-09-17T20:01:13.034Z` 成功结束。124 个文件、635 项测试（新增四项输入/清单检查、一项完整原生 D1/Payload 命令恢复检查）、14 项既有浏览器检查、角色构建和三站 HTTPS 回归通过。

新增通用负责人浏览器验收于 `19:59:58.216Z` 通过。随后命令 `--dry-run` / `--apply` 分别于 `20:00:33.256Z` / `20:01:03.054Z` 返回 checkpoint 6、`mutations: false`，实际读取当前站点 Worker 的命名服务及 D1。`20:02:46.649Z` 的[直接核验](site-per-d1-provision-command-validation.json)确认六步历史回执完全不变，完成时间仍为 `19:24:07.827Z`、lease epoch 11、lease until 0。

本轮普通发布的中央 deployment 为 `bf7a5fa2-5f53-4bb6-8b48-f97d6b827073`；站点 deployment 为 `0ffbeecb-db65-4ac1-8b17-52cafe7b1275` / version `8fc20502-4fcf-4fcd-8a23-24f71a7df8a6`，来源提交为 `0848d18`。这与历史建站回执指向的 `cd09e7d` 是不同的概念，重入命令未改写旧回执。

A/B/C 均 active，路由版本为 41/1/2、生产开关均关闭，经理权限完整；生产 deployment `3046ffb1-b8ad-47ba-a373-9be5d0526c4b` 未变。历史取消轮的 B/C 合成会话仍各一条，可兑换票据为 0；当前验收主动退出已通过。

上述是 C 已完成操作的重入证据。后续[真实 D 站创建与分组发布](site-per-d1-p1-provision-d.md)单独记录首次 API 创建、六步执行及发布协调结果；中央建站入口、通用多组管理、其余 P1 和 P2–P5 继续实施。
