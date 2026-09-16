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
- `publicSiteQueries.ts`、`publicLandingTheme.ts` 等 React cache 路径尚未全部改为明确的站点和配置版本键；尤其 `getOffersByIds(ids)` 当前没有站点参数。需要在实际 Next/workerd 路径验证。
- 认证、权限撤销、后台编辑器、真实上传、nonce、任务租约、公开/预览路由及 MCP 尚未在分库模式验证。
- 现有 fixture 的 R2/缓存/队列验证是原生 runtime 行为验证，不代表产品中的对应入口已经完成改造。
- 本机集成测试使用 Node 中的 Payload + workerd D1；云端 fixture 使用 workerd 中的 ALS + D1。两者组合也不能替代完整 Payload 在已部署 Worker + 两个测试 D1 的端到端验证。
- 当前基线仅 3 个站点、2 篇文章、19 个任务，D1 9,236,480 bytes。不能用该样本证明吞吐、成本或生产质量。

## 证据与下一门槛

- 单元测试 `tests/unit/siteD1Isolation.spec.ts`：6 项通过，含 100 个交错异步请求与分包注册表边界。
- 实际 adapter 测试 `tests/int/sitePayloadD1.int.spec.ts`：3 项通过，含 40 个跨站并发列表查询。这是功能测试，未构成 P95 <2 秒性能验收。
- 云端提交 `77f6bf7` 已通过 lint、类型检查和 436 项测试；随后测试打包入口定位失败，未产生成功 release marker。修复仍走同一云端链路。
- 提交 `4cccddd` 已在云端通过 workerd fixture：2 个 D1，40 个并发请求，耗时 1,517 ms（整个 fixture 的墙钟时间，不是 CPU/P95 指标）。构建 `17ec00f2-842d-42e7-b1c2-8b0440951c48` 的完整 Next/浏览器检查仍在跟进。新增分包修复须重新通过相关云端检查。
- [原始生产基线](site-per-d1-baseline.json) 保存明确的 UTC 24 小时窗口、GraphQL 查询和单位。Worker 3,654 次请求、0 个执行错误，CPU P95 955.429 ms；requestDuration P95 2,481.664 ms。D1 读取 185,508 行、写入 131 行。账本累计 $0.028495 未与供应商账单对账，不能据此计算真实每篇费用。
- 下一门槛：在隔离的已部署测试环境完成完整 Payload/上传/后台/权限及资源测量。P0 未通过前不扩大生产范围。

官方依据：[AsyncLocalStorage](https://developers.cloudflare.com/workers/runtime-apis/nodejs/asynclocalstorage/)、[D1 限制](https://developers.cloudflare.com/d1/platform/limits/)。官方当前列出付费账户每库 10 GB、总存储 1 TB、数据库数 50,000；实际账户获批配额和各产品资源限制仍须上线前单独核验。
