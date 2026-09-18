# P1 E：从持久申请执行真实建站

提交 `8799a84` 使用 `operations/p1-release.json` 中明确审定的 `admission` 运维选择，完成真实 P1 测试申请的建站。Cloudflare 构建 `3fc54e95-1b71-4994-9db2-ecfdc74db0f7` 于 `2026-09-18T04:01:41.139Z` 成功结束，GitHub 检查 completed/success；718 项测试 / 133 个文件、14 项既有浏览器检查、完整角色及主应用检查均通过。[执行与直接核验证据](site-per-d1-p1-admission-e-validation.json)。

## 操作身份

- 申请 UUID：`91c2c4f0-fc5b-41c2-9b72-58c6dca303c0`，永久站点 ID `p1-e`，名称 `P1 Site E`。
- 租户 1，合成负责人 7，时区 `Europe/Berlin`；没有选择或修改真人账号。
- 分组 `p1-group-1`，审定 fleet `operations/fleet/p1.json`，原 C/D 请求作为完整历史锚点。
- 中央 deployment 固定 `5e2eafa3-b8b6-49f2-b7bb-1e716f6f09bb`，运行提交 `86c9306534fca854ed6b0d031f96e75b2cd2ba6e`。
- 保留中央运行代码的源码摘要：`a5f20448d7b2e0318d7c3445e4ddc77dc770125a01dd3fa05b4dca6e744c9e72`。摘要从上述已部署提交的 Git tree 计算，不从待发布代码重新选择基准。

## 云端执行与恢复

仍先运行完整 `ci:build`。通过本次提交 marker 后，部署入口选择 `ci-p1-admission.mjs`，核对固定账号/区域/Worker、中央 deployment、实际完整 v5 schema 和无其他未完成运维操作。运行源码、依赖、配置、schema、角色构建和历史资源输入继续参与摘要；仅新增的明确 cloud-only 入口与交接/核验工具可变。普通仅恢复发布继续使用原摘要策略，未扩大其例外。

该路径保留生产、P0 和中央 Worker；合成账号密码只在本次 Cloudflare 环境内生成，现有中央签名密钥不读取、不轮换。原 bootstrap 再次核对合成账号归属和已有 schema。负责人通过真实中央表单登录后，浏览器以固定 UUID 调用已有申请 HTTP 接口，后台列表必须展示对应记录。这一步是经过真实会话的 HTTP 提交，不宣称固定 UUID 来自人员表单生成。

随后执行 `site:provision --request-id ... --dry-run`、`--apply`，并再次 `--apply`。规划器以当前完整四站历史保存不可变请求；六步执行器拥有创建、初始化、部署、核验与激活回执。完成后的重复执行应只读，六步回执须保持完全相同。最终重新解析包含申请的新完整历史，以命名内部 RPC 核对每个成员的实际 D1、路由版本、状态与部署来源，中央后台该申请必须显示“已建成”。原四站登记/权限、C/D 操作及回执和未涉及 Worker 的部署必须不变。

失败后保留同一 UUID、不可变计划和已有六步回执，继续通过 Cloudflare 修复/恢复。不得删除申请或换 UUID 来掩盖部分创建，不根据轮询超时重新创建资源。取消只允许预约前；已预约的操作按六步日志恢复。

## 边界与后续

真实浏览器会话于 03:57:50Z 提交申请；只读预览 checkpoint 0，尚无数据库。规划于 03:58:45Z 保存，E 数据库 `39e5d04a-a3ff-48ac-9b59-d20530a06d15` 于 03:59:06Z 创建，WNAM、读副本关闭。数字 ID 106 保留已取消的 105。站点 schema 504 对象 / 81 表，直接查询重算摘要与初始化回执一致。

六步于 04:00:32Z 完成，checkpoint 6、租约归零、active、routingVersion 2、生产关闭。站点 deployment `862342ae-437d-42de-bfdf-e2059f50bad5` / version `6aa8e834-5515-47a9-9f9b-604d6540bbc4`。真实 HTTPS 中央登录、选择器、票据、站点身份、原生编辑页、手机、host-only Cookie 与退出通过。重复 apply 返回 `mutations: false`；直接读取并重算 C/D/E 各六步回执摘要均一致。

04:01:25Z 的命名内部 RPC 证明 A/B/C/D/E 全部来自新站点部署，绑定和登记相符，版本 83/1/2/2/2；中央后台于 04:01:30Z 展示“已建成”。请求表持久 state 仍为 provisioning，HTTP/UI 完成状态由建站日志派生。原四站登记、授权与 C/D 回执摘要未变，生产、P0、中央 Worker deployment 均保留。04:03Z 直接查询确认五站 active、合成经理权限完整、没有未完成的分组发布。

这是明确选择的一次合成申请运维执行，自动 Deploy Hook、构建投递与状态对账尚未启用。本次归档同时移除 `admission` 选择，下一次云端发布恢复普通路径，必须保留中央完整历史中的 E 并完成五站完整内容核验；此处的逐站运行绑定证明不替代该验收。

所有安装、测试、构建和部署在 Cloudflare Builds 内执行。本地只进行源码、文档、Git、静态语法/差异检查与源码摘要计算。P1 其余事项和 P2–P5 仍未完成。
