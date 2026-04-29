# Cloudflare 构建与 `PAYLOAD_SECRET`

在 Cloudflare 的 **Worker / Workers & Pages** 里，**生产环境（Runtime）的 Variables and Secrets** 与 **从 Git 触发的 `next build` 所在环境** 是两套：前者在请求处理时注入，后者执行 `npm run build` / `pnpm run build` 时读的是当次构建的 `process.env`。

若只在 Worker 面板配置了 `PAYLOAD_SECRET`，但 **Git 构建**未注入同名变量，可能出现：`next build` 预渲染或收集 page 数据时报 `missing secret key`，而线上运行正常。

## 建议

1. **在 Git 集成的构建设置里**为「Build」或「Build environment」增加 `PAYLOAD_SECRET`（与生产一致或单独一个仅用于 CI 的长随机串均可；代码在 `isNextBuild` 且无真实 secret 时也会使用占位值，但显式配置可减少歧义与便于排查）。
2. 部署产物里的 Worker **运行时**仍需在 **Variables / Secrets** 中设置真实的 `PAYLOAD_SECRET`（与 [src/payload.config.ts](src/payload.config.ts) 中生产校验一致）。

具体菜单名称以 Cloudflare 当前控制台为准：查找与 **Build**、**CI** 或 **Environment variables (build-time)** 相关的项。

## 与仓库内代码的关系

- [src/payload.config.ts](src/payload.config.ts)：`NEXT_PHASE` / `npm` build 阶段在缺少真实 secret 时使用占位 `secret` 仅用于通过 Payload 初始化；**非构建的生产部署**仍要求真实 `PAYLOAD_SECRET`。
- 知识库门户路由使用 `export const dynamic = 'force-dynamic'`，避免在构建时静态预渲染需登录的页面，减轻 D1/Miniflare 在构建期的并发与 `SQLITE_BUSY` 类问题。
