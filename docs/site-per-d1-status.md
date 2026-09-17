# 一站一 D1 执行证据

目标始终为 [完整执行方案](site-per-d1-execution-plan.md)，以下是执行状态，不替代验收要求。2026-09-16T20:12Z，P0 原型可行性门槛通过；仅允许进入 P1 实施，不代表生产迁移、容量或完整计划验收通过。P1 实施中，P2–P5 尚待实施。

## 基线与发布身份

- GitHub：`Begin-Source/payload-wnam`，API 验证 ID `1224379860`，部署分支 `main`。
- Cloudflare：基源科技 `d487cf34c606620b442632a72272014d`。
- Worker：`payload-wnam`，tag `a53ec5c30f6f4623909113bf36ca914f`。
- 现有 D1：`f2aac41b-418d-47de-8bb3-edda485b1e2b`，读取到存储 9,236,480 bytes；R2：`payload-wnam`。
- 开始实施时线上版本：`34efc5b4-0c21-4dd7-a61d-f279b49068f5`，部署 `3046ffb1-b8ad-47ba-a373-9be5d0526c4b`。登录页 GET 返回 200。
- 默认分支触发器 `c632f23b-1a46-4b75-994d-50996db8ed89`：`ci:build` → `ci:deploy`。非生产触发器 `e11169cd-47d9-4a8c-812a-06894dcce930` 在 `feat/site-per-d1` 上运行独立 P0 发布脚本，其他非生产分支仍只验证。
- 依赖版本维持现有 lockfile。禁止本地构建和绕过云端部署链路。

## 放行矩阵

| 要求 | 当前证据或缺口 | 状态 |
| --- | --- | --- |
| P0 请求上下文、D1 代理、同 ID 并发和 batch | `src/site-runtime/{context,d1}.ts` 的 6 项单测通过；真实 adapter 3 项测试通过 | 原型已验证 |
| P0 workerd 原生执行 | 提交 `c7cf614` 的云端 fixture、440 项单元/集成测试、Next 打包和 14 项 E2E 通过；[构建证据](site-per-d1-p0-validation.json) | 原型已验证 |
| P0 完整 Payload、后台、上传、内部缓存审计 | `6f43fba` 的 454 项测试、14 项浏览器检查、部署及线上 REST/后台/R2/队列/公开缓存/流式响应检查通过；5 个 isolate 共同服务两站；[最新证据](site-per-d1-p0-runtime-optimization.json) | 可行性通过 |
| P0 现有用量基线 | [生产基线](site-per-d1-baseline.json)含 CPU、D1 读写/存储与账本用量；供应商账单未对账，不能作为真实单篇成本 | 基线已记录，成本验收待后续 |
| P0 冷启动、CPU 与内存 | `6f43fba` 启动 30 ms；403 请求无执行错误；CPU P95 87.913 ms；内存 P95 104,548,730 bytes、P99.9 106,280,960 bytes；[原始查询及边界](site-per-d1-p0-runtime-optimization.json) | 小规模原型通过；非容量验收 |
| P1 中央/站点配置、注册表、关系边界和主数据副本 | 注册表/CAS/跨库引用和身份映射已实现；[站点 factory](site-per-d1-p1-site-config.md)、[中央 factory/成本账本](site-per-d1-p1-central-config.md)及[主数据发布/候选接收](site-per-d1-p1-master-sync.md)有原生 D1 验证；[副本应用/提示词选择](site-per-d1-p1-master-copies.md)已实现；[运行 Global/配额版本](site-per-d1-p1-config-sync.md)已实现；[媒体复制/撤回、头像与品牌图](site-per-d1-p1-assets.md)已通过原生验证；[交互式内部数据服务](site-per-d1-p1-data-service.md)已通过原生 RPC 验证；[完整中央应用](site-per-d1-p1-central-application.md)已接入并通过云端完整 Worker/后台检查；[完整站点应用](site-per-d1-p1-site-application.md)也已通过云端双站后台检查；[中央站点选择器](site-per-d1-p1-site-chooser.md)已通过实际点击进入验证；[独立远程角色](site-per-d1-p1-remote-roles.md)已部署并通过实际双站后台/SSO；[通用 D 建站与四站普通发布](site-per-d1-p1-provision-d.md)已实际通过；队列投递、其余管理界面和通用多组管理待接入 | 实施中，未通过 |
| P1 60 秒单次票据、host-only Cookie、实时权限撤销 | 云端原生 Service Binding、Chromium 双站 HTTPS 登录及即时撤权通过；真实中央 Payload 密码登录、JWT 签发站点票据与会话撤销已在完整中央 Worker 中通过；最新 661 项测试通过；完整站点后台、中央选择器实际点击、真实双站 SSO、实时撤权和原生退出已通过云端验证；独立远程中央和双站后台已部署，真实 HTTPS 撤权/退出通过；其余 P1 要求仍待完成 | 实施中，未通过 |
| P1 建站、进入、暂停/恢复、MCP 明确 siteId | 中央选择器、进入 API 和完整站点接收入口已接入；[经理暂停/恢复与明确目标 API](site-per-d1-p1-lifecycle.md)及[中央 MCP](site-per-d1-p1-mcp.md)已部署并通过真实 HTTPS 验收；[建站日志](site-per-d1-p1-provision-journal.md)和[真实 D1 创建/恢复/schema 准备](site-per-d1-p1-provision-prepare.md)已验证，[资料初始化与跨库恢复](site-per-d1-p1-provision-seed.md)已在原库完成，[分组部署、实际三站 SSO/隔离和 C 激活](site-per-d1-p1-provision-activation.md)已通过云端验证，原操作达到 checkpoint 6；[云端建站命令](site-per-d1-provision-command.md)已接通，已完成站点重入通过实际验证；[首次通用 D 站创建与单组发布协调](site-per-d1-p1-provision-d.md)已通过实际四站验收和上传中断恢复；[多请求历史与逐组协调](site-per-d1-fleet-management.md)已通过原生多组恢复和实际单组四站核验；中央建站入口、动态请求和完整多组云端入口仍待完成 | 实施中，未通过 |
| P2 持久步骤链、公平调度、独立发布队列 | 未实现 | 待实施 |
| P2 供应商 DO 配额、预算、429、结果不明核查 | 未实现 | 待实施 |
| P2 180 秒租约/30 秒心跳、版本检查、Outbox、最多 5 次尝试、死信 | 未实现 | 待实施 |
| P2 时区、每日 10 个发布槽、统一质量门禁和旧审核失效 | 未实现 | 待实施 |
| P3 可信域名路由、缓存策略/清理、公开/私有 R2 | fixture 不是产品实现 | 待实施 |
| P3 五分钟汇总、事件去重、每日对账、无跨库扫描 | 未实现 | 待实施 |
| P3 30 天归档、日志脱敏和采样、存储/预算/队列告警 | 未实现 | 待实施 |
| 运维命令：provision/migrate/fleet-migrate/verify/resume | `site:provision` 已接通云端六步编排、预览及恢复，实际 C 历史重入、D 首次创建、单组发布协调与四站浏览器验收通过；[当前站点只读核验](site-per-d1-site-verify.md)已通过实际四站 81 表检查及原发布恢复；[历史清单与逐组恢复](site-per-d1-fleet-management.md)已接通；完整多组云端入口、内嵌引用全图、混合 schema、迁移与其余命令仍待完成 | 实施中，未通过 |
| P4 单站冻结、数据图复制、校验、原子路由切换和恢复 | 未执行，目标冻结 ≤15 分钟、最多 5 站 | 待实施 |
| P4 回退、兼容应用回滚、恢复对账、旧库 30 天保留 | 未演练 | 待实施 |
| P4 真实站与真实供应商连续 72 小时 | 未开始；模拟不可替代 | 待实施 |
| P5 5→50→200→1,000 站每批至少 48 小时 | 未开始；须前一批问题关闭及配额验证 | 待实施 |
| 容量：20 员工 P95 <2 秒 | 未运行 | 待实施 |
| 容量：120 req/s 一小时、5xx <0.1%、多种缓存率 | 未运行 | 待实施 |
| 容量：模拟 1,000 站/每日 10,000 篇连续 3 天 | 未运行 | 待实施 |
| 配额、计费和年度成本按实测修订 | 未完成；不得将规划预算写成验证结果 | 待实施 |
| 交付：迁移/容量/试运行报告、员工手册、故障恢复手册、发布清单 | 本文仅为证据索引，完整交付待完成 | 待实施 |

## P1 最新发布：多请求历史清单与逐组发布协调

`420558b` / 构建 `1090e048-c523-4ec1-b89d-0ee00ae468f7` 于 `2026-09-17T23:46:05.298Z` 成功结束，661 项测试（129 个文件）、14 项既有浏览器检查、完整角色构建和真实四站回归通过。[多请求历史与逐组协调](site-per-d1-fleet-management.md)按不可变 C/D 日志生成当前四站清单；原生 D1 测试覆盖两组历史解析和三组发布失败后恢复，实际远程验证仍为一个四站组。

[恢复证据](site-per-d1-fleet-management-validation.json)保留首轮构建超时记录。运行提交 `d26506b` 的站点 deployment `b88d798e-6080-460d-affc-ab85dc5301d3`、中央 deployment `2dcf80c8-a92d-4492-87d0-c7b202195989` 与 P0 deployment 均保留；源码摘要保护恢复，未重复上传。原组发布于 23:44:35Z 完成，重复执行及已完成 D 的 apply 均无改写。[四站逐表报告](site-per-d1-fleet-management-site-report.json)包含 324 表，由 36 段云端库存日志重建，完整报告与各站内容摘要均一致。

23:46:30Z 直接核验确认无 pending 发布、租约归零、C/D 六步原回执及 schema 不变；四站 active、路由版本 77/1/2/2、生产关闭、经理权限恢复。生产 deployment 保持原值。历史存储会话 5 条、当时未到期 3 条、可兑换票据 0 条；当前轮退出通过。全部安装、测试、构建与部署都在 Cloudflare。中央建站入口、动态请求执行、完整多组云端入口及其余 P1、P2–P5 继续实施。

## P1 前轮发布：当前站点核验与上传后恢复

`2a03a87` / 构建 `6b12fbc1-0661-45db-9689-72de5a5dc9a8` 于 `2026-09-17T22:31:27.943Z` 成功结束，通过 654 项测试（128 个文件）、14 项既有浏览器检查、完整角色与真实四站回归。[当前站点只读核验](site-per-d1-site-verify.md)独立使用当前完整清单和各站原始归属凭证，已完成 A/B/C/D 各 81 表内容库存、实际绑定/路由、SQL 外键、媒体及任务检查。真实库媒体对象和任务行均为 0；非空场景与故障由原生集成测试覆盖，不代表 P2/P4 验收。

[构建及恢复证据](site-per-d1-site-verify-validation.json)记录前两次失败、上一轮构建超时和本轮完整恢复。`7c4282a` 已上传的站点 deployment `a044acd1-42f9-4b2a-a9a5-32c51d6ab04e`、version `68db86fb-e4e6-4a32-b2c8-0816a6a5bc47` 保留，源码摘要确认应用运行源码未变；本轮仅补完验收，未重复上传。releaseId `a538d63060deaefb2fa0ddf30f6fa87932028c0c15357e4890a73c6f46455d90` 于 22:30:09Z 完成，重复执行及完成后的 D 预览/apply 均无改写。

[逐表报告](site-per-d1-site-verify-report.json)从云端四站元数据和 36 段库存日志重建；完整报告摘要及四站内容摘要均与云端结果一致。22:32:18Z 直接核验确认无 pending 发布、组租约释放、C/D 原始六步回执和 schema 不变，四站 active、路由版本 65/1/2/2、经理权限恢复、生产关闭。中央 deployment `56184f65-5ca2-4e85-b5a7-a9620acce21c`；生产 deployment 保持原值。历史中断轮仍有 5 条已存会话，其中 3 条未到期，可兑换票据为 0；不宣称历史会话已清空。本轮安装、测试、构建、部署均在 Cloudflare。

当前 `operations/p1-release.json` 显式固定仅恢复选择；后续普通功能发布须移除该选择，否则运行源码变化会拒绝发布。中央建站入口、多组管理、主数据界面/队列、完整数据图与混合版本核验、其余 P1 和 P2–P5 继续实施，完整目标未完成。

## P1 前轮发布：真实 D 站与普通分组发布

`a1c1ca1` / 构建 `ced02adf-34ae-4565-9252-d3b7ebe5eb6b` 于 `2026-09-17T20:44:02.902Z` 成功结束，通过 641 项测试（125 个文件）、14 项既有浏览器检查、完整角色及实际四站回归。[通用 D 建站和单组普通发布](site-per-d1-p1-provision-d.md)已完成真实建库、schema、资料、上传、核验、激活六步；首次预览 checkpoint 0/无写入，实际 apply checkpoint 6。D 数据库 `40885d2c-87a7-4801-91cd-73f3d760c9f9` 唯一、WNAM、读副本关闭。

中央兼容迁移到 v4 仅新增 3 个对象，总计 266 个；新站预约和普通发布通过中央 D1 原子互斥、合计四个运维租约。普通发布在实际上传成功、回执保存前注入异常，恢复识别同一版本而不重传；四站同 ID 并发读取/隔离更新、C/D 分别即时撤权、生命周期/MCP/手机/退出全部通过，重复执行回执不变。完成后的 D `--dry-run` 和 `--apply` 均实际核验最新普通发布，返回 `mutations: false`。

[20:44:24Z 直接核验](site-per-d1-p1-provision-d-validation.json)确认 C/D 历史建站回执未改写、租约释放、无 pending 发布；A/B/C/D active、路由版本 47/1/2/2、生产关闭、经理权限恢复。中央 deployment `51b316e6-da60-41a5-82a5-62b2e4ccbff6`、站点 deployment `9375c118-760a-4481-a54b-539b04dde48c`；生产 deployment 未变。历史 B/C 两条合成会话仍存储且未到期，可兑换票据为 0，当前四站退出通过。全部安装/测试/构建/部署均在 Cloudflare。

中央建站界面、多组/多请求编排、扩组后的历史站点通用核验和部署纠偏、其余 P1 与 P2–P5 继续实施。当前 D 请求保留四站，旧 C 请求不包含 D 会拒绝执行，不把历史请求文件当作当前通用核验工具。完整目标保持未完成。

## P1 前轮发布：云端建站命令

`0848d18` / 构建 `798ef56b-1d64-45fa-a09b-62e9f4839b25` 成功，通过 635 项测试、14 项既有浏览器检查、完整角色及真实三站回归。[`site:provision`](site-per-d1-provision-command.md) 接通严格计划/清单输入、六步断点编排和只读重入；原生 D1/Payload 命令测试覆盖跨库 seed 和上传回执两处中断，建库/上传各一次。真实通用浏览器验收也已通过。

云端 `--dry-run` 与已完成操作的 `--apply` 均实际验证 C，返回 `mutations: false`。[20:02:46Z 直接核验](site-per-d1-provision-command-validation.json)确认六步历史回执、完成时间及租约不变，A/B/C active、版本 41/1/2、生产关闭，权限完整。中央 deployment `bf7a5fa2-5f53-4bb6-8b48-f97d6b827073`、站点 deployment `0ffbeecb-db65-4ac1-8b17-52cafe7b1275`；生产 deployment 未变。历史取消轮的两条 B/C 合成会话仍保留，可兑换票据为 0；当前退出验证通过。

首轮类型检查失败发生在部署前，补充浏览器 JSON 响应结构校验后重新通过。全部安装、测试、构建和部署均在 Cloudflare。真实首次通用新站创建、生成清单与普通发布的分组协调、中央建站入口、P1 其余项目及 P2–P5 均待继续；不能把 C 的只读重入当作新站首次实际创建证据。

## P1 前轮发布：C 分组部署、验证与激活

`88894a2` 的构建 `20f15bfa-9836-4141-87d3-f6c580c0b411` 成功，通过 630 项测试、14 项既有浏览器检查及真实三站 HTTPS/Chromium 验收。上传后注入中断、同操作恢复、实际远程绑定核验、三站同 ID 并发隔离、C 即时撤权和原有生命周期/MCP/退出检查均通过。修复了租约交接时旧执行器清理继任者会话的问题，并通过原生 D1 回归。

[直接核验](site-per-d1-p1-provision-activation-validation.json)于 `2026-09-17T19:24:37.531Z` 确认 C 原操作 checkpoint 6、六步回执齐全、租约释放，原 D1、active/版本 2/生产关闭。站点 deployment `895b9f03-5a60-4d66-a951-9ba2d7a2d013` 保留原 `cd09e7d` 产物和回执，本轮最新提交只修复云端执行器并从实际取消后的 checkpoint 5 继续验收，未重复上传站点。中央 deployment `aa45fcca-11ff-4bb2-93e5-5e533cc934a4`，A/B active、版本 35/1，生产 deployment 与域名归属未变。

三站经理权限恢复，可兑换票据为 0；取消轮遗留 B/C 各一条合成测试会话，关联旧中央会话并于 21:06:46Z 到期，不宣称历史会话为零。本轮自身的退出和撤权验证通过。安装、测试、构建和部署均在 Cloudflare 执行。[实现与边界](site-per-d1-p1-provision-activation.md)记录了类型检查失败、主动取消和恢复过程。通用建站命令/中央入口、P1 其余要求与 P2–P5 继续待完成。

## P1 前轮发布：资料初始化与跨库恢复

`7425375` 的构建 `7c66b1c5-ce31-4861-9e1a-a354758eaa15` 成功，通过 623 项测试、14 项既有浏览器检查、完整角色及实际 HTTPS 回归。首次构建的 Miniflare 同步代理竞态已通过[固定版本补丁](miniflare-sync-reply-backport.md)修复；没有升级依赖、跳过测试或转为本地安装。2026-09-17T18:35:53Z 实际初始化及发布通过。

C 继续原操作 `f8d779c3-12a4-491c-b368-00f274be2bfd`、原数据库 `02e8be38-7dfb-4c48-86e1-30e586961fc9`：实际站点资料写入后注入中断，再补齐中央站点记录与经理权限，重复执行保留回执和资料。[直接核验](site-per-d1-p1-provision-seed-validation.json)于 18:37:06Z 确认 checkpoint 3、租约释放、无 pending step，C 为 provisioning/版本 1/生产关闭，users 仅存显示身份投影。分组仍只绑定 A/B，C 尚无域名或实际 SSO 验收；下一步必须继续原操作的 deploy/verify/activate。

中央 deployment `abb39cdc-4ee3-4658-af41-5a730f26f4cb`、站点 deployment `24909cbe-ebcd-428a-8389-ecaee0e1b79e`；A/B active、版本 29/1，经理授权恢复，站点会话与可兑换票据为零；生产 deployment 和域名归属未变。全部安装、测试、构建和部署在 Cloudflare 完成。完整建站命令、P1 其余要求及 P2–P5 均未完成。

## P1 前轮发布：真实建库与 schema 准备

`3aca286` 的构建 `e9e39791-bee7-4620-abc5-8757bd66e3a3` 成功，通过 616 项测试、14 项既有浏览器检查、完整角色及实际 HTTPS 回归，并以真实 API 创建和恢复新测试库。2026-09-17T17:52:34Z 发布通过；中央 deployment `484811a0-0a79-462c-8376-d457d9ca15da`、站点 deployment `56d735ef-ce61-4350-a085-ef3a852aed5c`。

新 D1 `02e8be38-7dfb-4c48-86e1-30e586961fc9` 属于 `p1-c` 操作 `f8d779c3-12a4-491c-b368-00f274be2bfd`。真实建库后、回执前注入中断，随后恢复并重复准备，UUID 和两个回执不变。17:53:45Z 直接核验 WNAM、读副本关闭、504 个应用/运行态对象、checkpoint 2、租约已释放；C 尚无站点/用户/租户资料、分组绑定、域名或 active 路由。A/B active、版本 23/1，权限恢复，站点会话和可兑换票据为零，生产部署/域名未变。[验证记录](site-per-d1-p1-provision-prepare-validation.json)区分 HTTP 替身测试与真实远程创建/恢复。安装、测试、构建、部署全部在 Cloudflare 执行；下一步必须继续原操作的 seed/deploy/verify/activate，完整建站与 P1/P2–P5 仍未完成。

## P1 前轮发布：建站持久计划与操作日志

`1f8c90f` 的构建 `c1d8904b-5fde-4d26-947e-6deda373efb0` 成功，通过 609 项测试、14 项既有浏览器检查、完整中央/双站 Worker、RPC 和实际 HTTPS 回归。2026-09-17T17:22:54Z 发布通过；中央 deployment `37badf26-e568-4dc1-b355-8c2fb552d71f`、站点 deployment `b6d4f7c9-cd96-4fb4-ae3c-8465e4dba533`。

中央以一笔兼容迁移从 v2 升至 v3，只增加五个日志对象并保留历史；目标摘要 `a97d4714d6af58802fc39203f4e1ae29609330e7c66b047bc6a336410de034db`。2026-09-17T17:23:58Z 直接核验五对象及两次迁移历史存在，原生命周期回执保留；A/B active、版本 17/1，授权恢复、站点会话和可兑换票据为零，生产部署和域名未变。[验证记录](site-per-d1-p1-provision-journal-validation.json)明确区分原生 D1 的执行租约/回执测试与真实资源创建：本轮日志为空，未创建新站，`site:provision` 执行器仍待接通。全部安装、构建、测试和部署在 Cloudflare 完成。

## P1 前轮发布：中央 MCP

`e1664b3` 的构建 `8981d700-a3b3-4de2-936b-69784384f5de` 成功，通过 599 项测试、14 项既有浏览器检查、完整中央/双站 Worker、原生 RPC 和实际 HTTPS MCP。2026-09-17T16:47:12Z 发布通过；中央 deployment `fc1a0c26-b09e-47fa-aa07-dcff9d2eb33f`，站点 deployment `6073d86c-7885-4247-813c-4ccfd6fd0942`。真实 SDK/中央 JWT、明确 siteId、Cookie/Bearer 分离、幂等暂停/恢复、已有连接的权限撤销和原生中央退出均通过。

2026-09-17T16:48:21Z 直接核验：A/B 均 active，版本 11/1；本轮 A 的六次变化均有唯一回执，经理授权恢复、站点会话和可兑换票据为零。三个 D1 schema 摘要未变、新建对象均为零；生产 deployment `3046ffb1-b8ad-47ba-a373-9be5d0526c4b` 与生产域名归属未变。[完整证据](site-per-d1-p1-mcp-validation.json)保留首次部署前类型检查失败及修复，并区分替身身份集成测试、完整 Worker 与真实远程 SDK 验收。安装、测试、构建和部署全部在 Cloudflare 完成。

下一项为通用建站及运维流程；主数据界面/投递、邮件与真实员工交接及 P2–P5 继续保持待完成。以下历史记录中的“尚未完成”描述各自发布当时的状态。

## P0 测试边界

- 单元测试使用替身 D1，只证明上下文及语句所有权边界。
- 云端 runtime fixture 使用 workerd 与 Miniflare 的两个隔离 D1，不使用生产数据、供应商调用或账户管理令牌。
- 云端 fixture 成功也不代表已部署 D1、完整 Payload 编辑器、认证、缓存或生产任务全部验证。必须补齐剩余证据才允许 P0 放行。
- P1 已移除共享可变 binding 及原始 SQL 的默认库回退；站点请求一律经严格代理，旧共享配置从各自 adapter 取绑定。P0 初始提交的严格代理仅用于先行验证；后续切换必须覆盖原始 SQL、nonce、租约及所有入口，禁止在新站点服务保留默认库回退。
- 已创建 [两个远程测试 D1](site-per-d1-p0-resources.json)，关闭读副本。两个库均完成 107 项历史迁移和独立合成账号初始化，已绑定隔离测试 Worker。云端 fixture 使用自己的本地隔离 D1，不能混淆这两组资源。
- 历史发布：实现推送到 `feat/site-per-d1` 后，提交 `c7cf614` 的原型构建成功。`f39f791` 在新库迁移时因 CLI 文件排序先 ALTER 后 CREATE 失败；后续改为显式使用 migrations index 的依赖顺序。`f7c53e9` 完成迁移并部署 P0，但登录返回 500，定位到全局对象缺少 beforeOperation 数组。该问题已由后续提交修复，以下保留逐轮证据。
- 生产仍为版本 `34efc5b4-0c21-4dd7-a61d-f279b49068f5`；2026-09-16T14:48Z 登录页返回 200。本轮没有迁移或部署生产应用。
- P5 真实推广需要现有 3 站以外的站点清单、域名、负责人和生产预算；清单位置尚未指定，不将模拟站点计为真实推广完成。
- `c537c37` 已修复登录 500，构建 `e1e101c0-83dc-4b1e-bb0d-a7dcda0ba708` 通过 447 项测试、完整打包和 14 项浏览器检查。部署后真实 REST/后台、R2、队列重复投递、nonce 和租约/心跳检查通过，记录 6 个共同服务两站的 isolate。生产部署仍未变；P0 因公开页面剩余验证和内存占用问题继续保持未通过。
- `59dc12d` 构建 `256e2a68-8767-454f-92de-b93bd6f49054` 进一步通过 12 个并发公开页面、伪造主机头、同 ID 内容和草稿 404 检查，7 个 isolate 共同服务两站。生产部署未变；剩余资源问题由仅在云端运行的完整 workerd 堆用量诊断继续定位。
- 历史压缩版本 `6a94323` 构建 `b51405fe-04c1-4a0c-95e4-4801b794877d` 全链路成功，但线上内存 P95 仍为 137,775,000 bytes，当时未通过资源门槛。
- 最新 `6f43fba` 构建 `bf043b0e-a6e4-4385-8256-ea9c54ed66f7` 全链路成功。仅云端 P0 构建转义正则字面量并由编译器转换 Unicode 模板字面量，保留模板 raw/cooked、接收对象及调用点语义。上传代码的非 Latin-1 字符从 13,024 个降至 0；相同诊断的请求前堆从约 77 MB 降至 40,370,072 bytes，登录后为 76,724,144 bytes。实际线上内存 P95 99.7 MiB、P99.9 101.4 MiB，满足 P0 小规模可行性门槛。明确 GC 仍未确认，不能将诊断值称为回收后的保留内存。
- 同轮保留全部 1,699 个 Lucide 图标与 5,829 个名称/别名，按实际使用创建组件；每个图标输出与原库对比通过，两套模板各完成桌面/手机线上检查。不同线上窗口的请求组成不同，不作严格同负载百分比比较。
- 生产仍为部署 `3046ffb1-b8ad-47ba-a373-9be5d0526c4b`；P0 验收时部署为 `4ebd6b54-64dc-4d1b-b8c5-62174990994c`。后续进入 P1：独立中央/站点配置、关系边界、注册表和实时中央认证；将已验证的源码编码条件纳入后续站点构建回归门禁。当前编码处理仅作用于 P0 分支，不能假定未来生产构建自动具备相同内存余量。

## P1 实施记录

- `17a6130` 实现中央注册表、单次票据、实时中央会话核验与无凭据身份投影核心。`f82fd59` 移除可变全局 D1 引用，原始 SQL/nonce 强制使用站点上下文。
- `f82fd59` 云端构建 `3b57e68f-801f-4dd6-8b40-2f4fcc98c142` 成功：473 项测试、14 项浏览器检查、完整双站线上 smoke；2026-09-16T21:14:50Z 发布检查通过。该轮 P0 deployment `96460824-09e7-4def-a889-95c5be4caf60`，生产 deployment 仍为 `3046ffb1-b8ad-47ba-a373-9be5d0526c4b`。
- [身份与验证边界](site-per-d1-p1-identity.md)及[独立配置拆分清单](site-per-d1-p1-config-boundaries.md)记录当前实现和全部 37 个业务集合的归属。独立配置、共享主数据同步、正式角色的服务绑定/浏览器 SSO、建站及 MCP 明确 siteId 尚未完成，P1 保持未通过。

- `4208e39` 的构建 `c59fe93c-f449-4124-b5e1-c51ecfd7f9c9` 最终通过 485 项测试、14 项既有浏览器检查、新增 workerd RPC/Chromium HTTPS 双站身份检查及部署后回归。最新 P0 deployment `01264593-495f-4564-afac-1dc9dee79f58`，生产未变；[验证证据及范围](site-per-d1-p1-service-validation.json)。此前三次构建失败均未发布，原因与修复见 [服务边界记录](site-per-d1-p1-service-boundary.md)。下一步为独立完整配置、正式入口/内置登录退出接入、主数据同步及建站/MCP，P1 不通过。
- `cbcfc2e` 的构建 `2a9c3ea2-6a7b-449e-a0d2-fca91f11eed0` 通过 492 项测试、原生 RPC/Chromium 身份检查及部署后回归；中央与站点数字 ID 映射不一致的故障注入被拒绝。2026-09-17T02:12:36Z P0 发布检查通过，deployment `0c7c76c7-5ab8-4753-a917-740f5815ca99`，version `85613ac8-8736-4ac5-a839-a3e12feeae5c`；生产 deployment 保持 `3046ffb1-b8ad-47ba-a373-9be5d0526c4b`。[本轮证据](site-per-d1-p1-local-id-validation.json)分别标明 hook 替身测试、身份 runtime fixture 与 P0 线上回归的范围。完整独立配置及权限包装替换仍待实现，P1 不通过。
- `d8537b3` 新增[独立站点配置](site-per-d1-p1-site-config.md)、本站权限及插件任务边界、公开/私有 R2 分离和 D1 宽行更新适配。构建 `4a9bc191-870e-4451-ac91-07b26acd09c3` 通过 503 项测试（含双 D1/R2 完整 schema 编辑）、14 项浏览器检查、原生身份 RPC/HTTPS 及 P0 线上回归。2026-09-17T03:08:50Z 发布通过，P0 deployment `77495c2e-ede9-403b-ad42-66c2d00fbba8`，version `aefc5c3b-9972-4f69-ba4c-960a6c30a08a`；生产未变。[证据](site-per-d1-p1-site-config-validation.json)区分独立 factory 测试与仍使用共享配置的 P0 发布；中央配置、主数据同步、正式角色及完整 P1 验收仍待完成。
- `9ea8909` 新增独立中央 factory、成本账本与结算证明；`1dd4b13` 补齐账号分成/组织和运行字段写权限。最终构建 `be29eb4e-6ab2-4343-a58e-a287a2a2c442` 成功，通过 517 项测试；2026-09-17T04:02:43Z P0 部署后回归与发布检查通过，deployment `fb04e31e-8801-42af-bb29-a9b7c7e0df94`，version `0925d201-9a8d-407e-a491-21ecd20842f4`，生产未变。[本轮证据](site-per-d1-p1-central-config-validation.json)与[实现边界](site-per-d1-p1-central-config.md)区分原生完整中央配置测试、仍使用共享配置的 P0 发布及未恢复的独立日志标记。历史转岗结算、来源投递、主数据同步、正式角色仍待实现，P1 未验收。
- `6e9ccb3` 新增[主数据版本发布和候选接收](site-per-d1-p1-master-sync.md)，修正站点管理模板的租户权限，移除中央预设的本站关键词 ID。构建 `e2fc2ca4-348f-404d-a524-236aa1658308` 成功，通过 526 项测试、14 项浏览器检查、身份 RPC/HTTPS 和 P0 线上回归；2026-09-17T04:41:04Z 发布检查通过。P0 deployment `8ae6bbf4-4890-4eb0-a179-0f0ed1ea5776`，version `30bbe1eb-18f9-4f6f-938f-1b56e9b9dc94`，生产未变。[本轮证据](site-per-d1-p1-master-sync-validation.json)不代表候选已应用为 Payload 副本；应用/选择、传输认证、资产与正式角色仍待完成，P1 未验收。

- `5f21e30` 实现[八类主数据原子副本应用与提示词明确选择](site-per-d1-p1-master-copies.md)，保存稳定版本映射并保护员工改动、已发布文章和 Offer 展示位置。构建 `477d8aaa-fb62-414a-a693-834e91e35405` 成功，通过 536 项测试、14 项浏览器检查、身份 RPC/HTTPS 与 P0 线上回归。2026-09-17T05:30:58Z 发布检查通过；P0 deployment `391fe575-1ba5-49cf-b5bf-615bd16911c0`，version `a2c7af74-1e21-4395-b06e-e23304167e4d`，生产未变。[证据](site-per-d1-p1-master-copies-validation.json)不代表独立角色已部署；资产、Global/配额版本、正式传输/界面/入口和远程迁移仍待完成，P1 未验收。

- `604e005` 实现[运行 Global 与配额政策版本](site-per-d1-p1-config-sync.md)：实际中央权限发布、本站候选接收、按数据库内容审阅、原子应用/数组替换及用量保留。构建 `dac96ae3-1a43-49da-bed3-f9c80c075f8e` 成功，通过 543 项测试、14 项浏览器检查、身份 RPC/HTTPS 与 P0 线上回归。2026-09-17T05:56:41Z 发布检查通过；P0 deployment `72e68720-d0a1-4aaf-84f8-f257c895cd91`，version `217105df-04f7-4bbe-a69d-9ff2bd22f68f`，生产未变。[证据](site-per-d1-p1-config-sync-validation.json)不代表预算已执行或独立角色已部署；品牌/资产、正式传输/界面/入口和远程迁移仍待完成，P1 未验收。

- `7d739ec` 完成[版本媒体、头像与品牌图](site-per-d1-p1-assets.md)的原生验证：固定元数据/字节、私有归档、站内 ID 映射、并发去重、失败重试和撤回 tombstone。构建 `b6ea36f8-2c46-4ecc-8129-c2277cffb90f` 成功，通过 550 项测试（含 7 项资产同步）、14 项浏览器检查、原生 R2 响应头及身份 RPC/HTTPS；2026-09-17T09:24:23Z P0 线上回归通过。P0 deployment `4494ed07-fd3e-4a5f-822b-c65d29eb8a32`，version `c90ce9e0-440c-4133-af71-6a3d8a7f25e1`，生产未变。[证据](site-per-d1-p1-assets-validation.json)记录四次部署前失败及修复。本轮未安装本地依赖，所有测试/构建均在 Cloudflare。正式传输/界面/角色、远程迁移、SVG/内嵌资源及 P1 其余验收仍待完成。

- `427ef23` 实现[交互式内部版本数据服务](site-per-d1-p1-data-service.md)：named RPC 读取固定主数据/配置/资产，验证原中央会话和实时经理授权，异步完成后复核，客户端绑定具体请求/员工/站点。构建 `e898aa7e-1efa-44a6-8ebf-12e5550598b9` 通过 560 项测试、14 项浏览器检查、实际 workerd 数据与身份 RPC。2026-09-17T09:45:04Z P0 线上回归与发布检查通过，deployment `f996359a-1f8b-4611-93ce-d43439e4e4d8`，version `3757f91c-5feb-4868-8f06-fe95ec1efc4f`；生产未变。[证据](site-per-d1-p1-data-service-validation.json)不代表正式角色挂载或后台队列已完成；下一步接入独立应用入口、角色构建/迁移与真实后台流程，P1 未验收。

- `7086951` 完成[独立中央应用](site-per-d1-p1-central-application.md)的云端构建入口、专用组件映射/类型、完整 Payload 后台/REST、named 服务和真实 JWT 站点进入入口。构建 `4e173867-675a-4aa1-8171-2b0271ed1fd7` 成功，通过 564 项测试、完整中央 Worker/Chromium 登录与主数据/票据/撤销检查、14 项既有浏览器检查、身份/数据 RPC 和 P0 线上回归。此前八轮失败在部署前；`ea98d9c` 部署后出现 401，随后通过双站凭据就绪检查和新的云端部署完成恢复。2026-09-17T11:17:45Z 发布通过，P0 deployment `999a2b50-d52d-4189-ad59-ae63787a1fe8`、version `65c64d43-ae2c-44a1-b22f-99449ed9b5bc`；生产 deployment 未变。[证据](site-per-d1-p1-central-application-validation.json)区分完整中央隔离验证和仍使用共享配置的远程 P0 发布。中央独立远程部署、站点应用、角色迁移、SSO/主数据操作界面、建站/运维以及 P1 其余要求继续实施，P1 未验收。

- `3ac826c` 接入[独立站点应用](site-per-d1-p1-site-application.md)：完整原生 Payload 后台/REST、注册表与分组 binding 清单核验、实时中央认证、`/me` 身份字段及原生退出撤销。构建 `aaa4de2b-7507-4fec-b709-ccf450eb50ca` 成功，通过 572 项测试、完整中央和双站 Worker/Chromium 检查、14 项既有浏览器检查及原生身份/数据 RPC。双站后台同 ID 并发读写隔离、撤权、host-only Cookie 和原生退出通过；站点浏览器无未捕获错误。此前五轮失败均在部署前，原因和云端 Miniflare 资产服务适配见[验证证据](site-per-d1-p1-site-application-validation.json)。2026-09-17T12:56:02Z P0 线上回归通过，deployment `665af82d-301d-4d89-8f41-7b5db76f8fd2`、version `36ebfae2-b87e-4ce0-b615-2e307eb50fd4`，生产 deployment 仍为 `3046ffb1-b8ad-47ba-a373-9be5d0526c4b`。依赖安装、测试及构建全部在 Cloudflare 执行。独立远程角色部署、选择器界面、建站/生命周期/MCP、主数据投递和 P1 其余要求继续实施，P1 未验收。

- `6258b5a` 完成[中央站点选择器](site-per-d1-p1-site-chooser.md)：实时中央会话与明确站点授权、只读分页/搜索接口、运行状态和原生 POST 进入、空状态/错误重试及手机布局。构建 `d9193102-6974-4449-b947-6d62c988f271` 成功，通过 576 项测试、14 项既有浏览器检查、实际选择器双站点击进入和原生身份/数据 RPC。中央目录测试覆盖 56 个注册站与撤权/会话失效；界面验证覆盖长名称、无匹配结果、暂停禁用和重试。2026-09-17T13:19:13Z P0 线上检查通过，deployment `9768ffe2-870e-4dcf-92bf-9c914ad58b0f`、version `75da535a-352e-41d2-8293-79fdb66baf65`；生产 deployment 仍为 `3046ffb1-b8ad-47ba-a373-9be5d0526c4b`。[完整证据](site-per-d1-p1-site-chooser-validation.json)保留两次部署前检查失败和修复。全部安装/测试/构建在 Cloudflare 完成；正式远程角色、建站/生命周期/MCP 和 P1 其余要求继续实施，未将该界面视为生产已上线或 P1 验收完成。


- `09c2a70` 完成[独立远程中央和站点角色部署](site-per-d1-p1-remote-roles.md)。构建 `caeeb1ff-e7b9-4976-9707-d46c1bdcbd7b` 成功：583 项测试、14 项既有浏览器检查、完整角色后台及实际 HTTPS 双站 SSO/编辑器/20 次同 ID 并发读取/隔离更新/即时撤权/退出全部通过，浏览器错误为零。2026-09-17T14:44:17Z 发布通过；中央 deployment `33a50a51-39ee-4246-b528-1996e51b897b`、version `cba2ccc2-56b8-46dc-b06a-be2e815d68e2`，站点 deployment `c43ca5c3-ce3f-492e-851c-84b6b02f15a2`、version `8e1c5fea-e73b-42d8-abac-c31fee8b2087`。三个新 D1 有明确初始化回执、schema 摘要及内部状态，云端重复初始化新增对象均为 0；四个 R2 保持直接公开访问关闭。2026-09-17T14:45:29Z 直接 API 核验：测试授权恢复、站点会话数 0、同 ID 内容隔离、workers.dev/preview URL 关闭，生产 deployment `3046ffb1-b8ad-47ba-a373-9be5d0526c4b` 及 `hub.beginos.org` 归属未变。[验证记录](site-per-d1-p1-remote-validation.json)保留运行器瞬时失败、DNS Read 权限修正、初始化补齐及首次 HTTPS 就绪失败，后者具体网络原因未证实。依赖安装、构建和测试全部在 Cloudflare 完成。此处仅完成独立远程后台部署链路，专用合成账号不代表真实员工交接；通用建站/生命周期/MCP、主数据投递与界面、邮件及 P1 其余要求继续实施，P2–P5 未完成。

- `6531a48` 完成[经理暂停/恢复与明确目标的管理 API](site-per-d1-p1-lifecycle.md)。构建 `3f2850e8-fda6-475a-bed6-fd7cd7a6c9d1` 成功：593 项测试、14 项既有浏览器检查、完整中央/双站后台与真实 HTTPS 生命周期、错误响应重试、旧 Cookie 拒绝、重新进入、撤权/退出全部通过。2026-09-17T16:03:56Z 发布通过；中央 deployment `911c63ab-c069-4733-bb6f-2737ab1bb505`、站点 deployment `c3a66f23-6d29-4372-93f9-c9542f7f0b75`。已存在中央 D1 以一笔事务从 v1 升至 v2，仅增加 3 个对象并留下迁移来源/目标摘要；两个站点 D1 schema 不变。2026-09-17T16:05:10Z 直接核验：A/B 均 active，版本分别为 5/1，A 只有四次实际状态变化的回执；经理授权恢复、站点会话 0、可兑换票据 0，绑定/域名和生产 deployment `3046ffb1-b8ad-47ba-a373-9be5d0526c4b` 未变。[完整证据](site-per-d1-p1-lifecycle-validation.json)记录部署前两次取消、一次响应体读取失败及修复，附[真实手机确认界面](site-per-d1-p1-lifecycle-mobile.jpg)。全部安装、测试、构建和部署在 Cloudflare 完成；MCP、通用建站、主数据界面/队列、邮件与真实员工交接及 P2–P5 仍待完成，完整目标继续保持未完成。
