# Miniflare 同步响应竞态补丁

Cloudflare build `f64a1c33-c272-4560-afce-77346ffa0e11`（提交 `af6cc16`）在既有 API 集成测试中触发 `SynchronousFetcher.fetch` 的 `message?.id === id` 断言，7 项失败；新增 4 项建站资料初始化测试通过。构建在部署前被门禁终止。

[Cloudflare 上游修复](https://github.com/cloudflare/workers-sdk/commit/6f3d7b58b1f6cd036aca3e5946807bba37776065)解释了该同步代理的竞态：前一请求的通知可能唤醒下一请求，后者读取尚无对应响应的队列，后续响应编号持续错位。该原因与本次堆栈一致；并非站点 SQL/数据归属断言失败。

保留 Wrangler `4.87.0` 和 Miniflare `4.20260430.0`，通过既有 pnpm patchedDependencies 机制回移其通知代次修复。接收端等待本请求的 `(id+1)|0`，不再重置共享标记或把任意唤醒当作对应响应。保留响应编号断言。没有改变 D1/Worker 业务代码、测试并发、重试次数或放宽门禁。

- 补丁：[miniflare@4.20260430.0.patch](../patches/miniflare@4.20260430.0.patch)
- 原始已发布 `dist/src/index.js` SHA-256：`13c2ae79ceefe66d64c3509db8194b28865fd9be06e7718b5684a99e71e64b3f`。
- 补丁 SHA-256：`2e8992a6bae1db9635d0d0cd01d45beec175e8f61953a7c261178350c3d4c8ee`，由锁文件固定。
- 回归检查从安装后的 Miniflare bundle 提取实际等待函数，使用真实 Node worker/message port 注入两次提前通知，检查正常响应与有符号整数边界。完整 Miniflare/Payload/D1 套件继续覆盖真实代理调用。

本地仅读取上游源码并编辑补丁、清单和锁文件；依赖安装及全部检查由 Cloudflare 执行。今后正式升级到包含该修复的版本时，须一起移除该补丁及对应锁文件条目，并保留相应竞态回归覆盖。

验证：提交 `7425375` 的 Cloudflare 构建 `7c66b1c5-ce31-4861-9e1a-a354758eaa15` 在 2026-09-17T18:36:09Z 终止为 success。623 项测试全部通过，包括原 8 项 API 测试和 3 项通知代次回归；完整打包、浏览器与远程发布检查也通过。[发布证据](site-per-d1-p1-provision-seed-validation.json)。
