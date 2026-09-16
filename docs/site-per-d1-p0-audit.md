# P0：Payload / D1 隔离审计

2026-09-16，锁定 Payload / D1 adapter 3.82.1、Drizzle 0.44.7、Wrangler 4.87.0，未升级依赖。结论：原型验证进行中，尚不允许迁移生产站点。

## 已确认的路径

1. `@payloadcms/db-d1-sqlite/dist/connect.js` 将配置的 binding 交给 Drizzle，并把 `$client` 存在 adapter 上。禁用 `push`、`prodMigrations`、读副本和自动 seed 后，可在无站点上下文时初始化 adapter；真正的查询再由代理解析上下文。
2. `payload/dist/index.js` 的 `getPayload` 按 key 全局缓存实例。站点服务必须只复用同一个配置实例；中央配置使用不同服务边界。不能通过反复更换相同 key 的 config 来切换数据库。
3. `payload/dist/utilities/createLocalReq.js` 复用传入 req 的 `payloadDataLoader`。`payload/dist/collections/dataloader.js` 的文档键与 find 键不包含 siteId。仅拦截 SQL 不足以阻止已缓存内容串站。
4. 新增 `assertSitePayloadRequest` 同时绑定 req 和 DataLoader 到请求令牌。原型 collection 的 `beforeOperation` 调用该校验，实际 adapter 测试覆盖 req 重用和 loader 移植。未来站点配置必须覆盖每个 collection/global 与所有入口，而非仅依赖此原型。
5. `createSiteD1Proxy` 在 prepare/exec/dump/batch 和每次语句执行前校验上下文与路由版本。已 prepare 的语句只能在原 scope 使用；不能把另一请求（即使同站）或原始 binding 的语句混入 batch。
6. `bindSiteCallback` 明确捕获 scope，供流式响应等延后回调使用；调用时仍检查路由版本。使用 Cloudflare 支持的 AsyncLocalStorage run/getStore，不依赖 enterWith。
7. 外层 Worker 和 OpenNext 内部可能各自打包上下文模块。通过不可替换的 `Symbol.for` 全局注册表共享 ALS 容器与请求所有权表，避免两个模块各自持有不相通的 store。注册表不保存可变的当前 D1；并发站点仍完全由 ALS 管理。重复加载模块的单测覆盖此边界。

## 已知待关闭问题

- 当前应用 `cloudflareD1Binding.ts` 仍保留可变全局 binding；`d1NarrowUpdate.ts`、`pipelineNonceStore.ts` 有默认库回退。新站点服务接入之前必须全部替换，当前原型未改变线上路径。
- 当前 `payload.config.ts` 存在启动期表查询、AI 插件初始化和共享多租户配置，不能直接放入新的站点 isolate。需要独立中央/站点配置及显式建站初始化。
- `publicSiteQueries.ts`、`publicLandingTheme.ts` 已加入站点、路由版本及请求令牌作为 React cache 参数，包括 `getOffersByIds(ids)`；真实公开页面/流式响应检查待本轮云端执行。最终配置版本同步属于 P1/P3。
- 认证、权限撤销、后台编辑器、真实上传、nonce、任务租约、公开/预览路由及 MCP 尚未在分库模式验证。
- 现有 fixture 的 R2/缓存/队列验证是原生 runtime 行为验证，不代表产品中的对应入口已经完成改造。
- 本机集成测试使用 Node 中的 Payload + workerd D1；云端 fixture 使用 workerd 中的 ALS + D1。两者组合也不能替代完整 Payload 在已部署 Worker + 两个测试 D1 的端到端验证。
- 当前基线仅 3 个站点、2 篇文章、19 个任务，D1 9,236,480 bytes。不能用该样本证明吞吐、成本或生产质量。
- [生产数据库外键图](site-per-d1-schema-graph.json)已通过只读 PRAGMA 提取：82 张用户/应用表、205 条外键。它仅覆盖实际 SQL 外键；Lexical、任务 JSON、插件多态引用和未建外键的 ID 仍需额外提取，不能把外键图当作完整迁移图。

## 数据拆分中必须显式处理的关系

- `articles.created_by_id`、`media.created_by_id` 指向中央用户。站点需要不含密码/会话的身份投影或显式跨库引用，不能为了保留外键复制中央凭据。
- `articles` 同时引用作者、审核作者、生产 profile、brief、关键词、媒体、合并目标。作者副本又引用头像媒体；迁移必须闭合这些依赖。
- `offers.merchant_slot_source_category_id` 指向站点分类。中央商品主数据和站点展示位置必须拆开，避免同步覆盖员工审定分类。
- `sites` 引用中央 portfolio、用户、keyword preset、pipeline profile，并引用站点 logo/hero 媒体。中央注册表与站点展示配置副本需要分别定义，不能整行无条件双向覆盖。
- 任务引用文章、页面、关键词、父任务等，且 JSON input/output 可能包含更多 ID。既有任务必须经过归属校验；未知引用应阻止迁移。

## 下一轮已部署 P0 验证范围

1. 已在指定账户创建两个专用测试 D1（[操作和资源清单](site-per-d1-p0-resources.json)），均关闭读副本，已完成 107 项迁移及合成账号初始化；没有复制生产密码或内容。
2. 只在 Cloudflare Builds 中打包和部署隔离测试 Worker，保留提交匹配 marker、资源 preflight 和测试失败禁止扩大规则。
3. 在同一个 Worker isolate 中让完整 Payload/Next 后台请求访问不同原生 D1。外层 Worker 与内层 Next 必须实际共享 ALS；不能仅凭单元测试假定分包行为。
4. 用同 ID 的合成账户/文档覆盖后台 CRUD、关系、真实媒体上传、原始 SQL、nonce/租约、队列和异步回调；同时验证伪造站点头、缺上下文、路由失效和缓存边界。
5. 测量冷启动、CPU、内存。完成这些后再判断 P0 能否放行；P1 仍需真正独立的中央/站点配置及中央实时认证，临时测试配置不算 P1 交付。

## 证据与下一门槛

- `c537c37` 的构建 `e1e101c0-83dc-4b1e-bb0d-a7dcda0ba708` 已完成部署与线上检查：447 项测试、14 项浏览器检查、真实后台/R2/队列均通过，6 个 isolate 同时处理两站。[部署证据](site-per-d1-p0-deployed-validation.json)。测试窗口 137 次请求、0 个执行错误、CPU P95 818.5 ms、内存 P95 150,440,850 bytes；[原始查询](site-per-d1-p0-resource-metrics.json)。内存指标高于官方限制，必须定位并形成余量证据后再判断 P0 可行性，不能将零错误当作内存通过。
- `f7c53e9` 的构建 `2552dec9-3986-46b8-a019-d3adc254d90a` 通过 446 项测试（含全新数据库按 index 完整重放）、Next 打包与 14 项浏览器检查，完成两个库迁移并部署 P0 Worker。在线登录 500 使发布验收失败。仅对隔离 Worker 开启实时日志，定位为 `beforeOperation.unshift` 访问未初始化的全局钩子数组；修复保留已有钩子并初始化缺省数组，真实 adapter 测试增加全局配置。修复仍须云端重验，不代表 P0 通过。
- 前次构建 `bdd0e73d-2d96-4d21-91cb-86a728c1f8f2` 在 B 库迁移时远程连接断开；核对迁移记录停止推进后取消构建。维护脚本现显式释放 Wrangler 平台代理，后续构建已按记录恢复完成全部迁移。
- 新增专用测试队列和 P0 task-check 入口，调用现有 nonce、原子领取、心跳及任务状态 SQL 路径；重复投递必须只增加投递收据、不重复领取。这是 P0 隔离检查，未替代 P2 持久步骤链和故障恢复实现；云端运行待验证。
- 完整 P0 提交 `f39f791` 的构建 `9d627c97-7bc2-468d-a7c0-3c4556ead4dd` 已通过打包/浏览器检查，但远程 A 库迁移在 `20260512_120000_keyword_batch_presets_strategy_fields` 停止。原因是 Payload CLI 按文件名排序，创建该表的 `20260819_120000_keyword_batch_presets` 尚未运行；仓库 index 原本已表达正确先后顺序。修正为受资源白名单保护的 `payload.db.migrate({ migrations })`，保留迁移记录并断点继续，不跳过失败迁移。生产部署 ID 核对仍为 `3046ffb1-b8ad-47ba-a373-9be5d0526c4b`。
- 完整 P0 使用固定测试域名、独立测试 gate、R2 站点前缀代理；测试凭据由 CI 随机生成并以 stdin/进程环境传递，不写入仓库文件。`guardSanitizedSiteConfig` 在 Payload 添加内部集合后挂接所有 collection/global 的 beforeOperation；部署 smoke 还必须记录至少一个共同服务两个站点的 isolate ID。临时 P0 密码账户只存在测试库，不算最终 SSO 实现。

- 单元测试 `tests/unit/siteD1Isolation.spec.ts`：6 项通过，含 100 个交错异步请求与分包注册表边界。
- 实际 adapter 测试 `tests/int/sitePayloadD1.int.spec.ts`：3 项通过，含 40 个跨站并发列表查询。这是功能测试，未构成 P95 <2 秒性能验收。
- 云端提交 `77f6bf7` 已通过 lint、类型检查和 436 项测试；随后测试打包入口定位失败，未产生成功 release marker。修复仍走同一云端链路。
- 包含分包修复的提交 `c7cf614` 已通过完整云端构建 `94295b2e-5cf6-4218-a45e-4b13e5d107fa`：440 项单元/集成测试、Next 打包及 14 项浏览器测试。workerd fixture 使用 2 个 D1、40 个并发请求，耗时 1,744 ms（整个 fixture 的墙钟时间，不是 CPU/P95 指标）。[完整记录](site-per-d1-p0-validation.json)明确标注尚未部署完整分库应用。
- [原始生产基线](site-per-d1-baseline.json) 保存明确的 UTC 24 小时窗口、GraphQL 查询和单位。Worker 3,654 次请求、0 个执行错误，CPU P95 955.429 ms；requestDuration P95 2,481.664 ms。D1 读取 185,508 行、写入 131 行。账本累计 $0.028495 未与供应商账单对账，不能据此计算真实每篇费用。
- 下一门槛：在隔离的已部署测试环境完成完整 Payload/上传/后台/权限及资源测量。P0 未通过前不扩大生产范围。

官方依据：[AsyncLocalStorage](https://developers.cloudflare.com/workers/runtime-apis/nodejs/asynclocalstorage/)、[D1 限制](https://developers.cloudflare.com/d1/platform/limits/)。官方当前列出付费账户每库 10 GB、总存储 1 TB、数据库数 50,000；实际账户获批配额和各产品资源限制仍须上线前单独核验。
