# P1 版本媒体、头像与品牌图

状态：七项原生集成测试、550 项全量测试、14 项浏览器检查及 P0 部署后回归已在 Cloudflare 通过。正式角色、传输、管理界面及远程资产 schema 尚未部署，P1 未验收。

## 发布与站内引用

`assetPublisher.ts` 从独立中央 Payload 读取实际媒体记录，检查员工身份、租户权限、明确的全局发布选择和源更新时间。研究证据不能通过此入口变成公开资源。发布只接受不超过 5 MiB 的 PNG/JPEG/GIF/WebP/AVIF，校验 MIME 文件签名、长度和 SHA-256。中央源桶与私有版本归档分别绑定；不可变 manifest 和归档文件共同确定一个媒体版本。

中央先记录包含固定元数据的发布意图，然后写私有 R2 归档，最后以 D1 revision CAS 提交版本。第一次 R2 写入失败后可按同一操作 ID 重试；D1 提交失败后即使源记录的 alt 已修改，重试仍使用原意图。若未归档的源文件字节已改变，则拒绝将它作为旧版本补写。

站点通过内部投递 capability 接收 manifest 和字节，校验稳定 siteId、localSiteId、routingVersion、中央租户及内容摘要。公开、私有桶分别写入 `sites/<siteId>/master-assets/central-<id>-r<revision>-<digest>.<ext>`。本地 media、固定 ID 映射和完成回执由同一个 D1 batch 提交。每个版本拥有独立本地 ID；来源 ID 不直接作为站内外键。已复制媒体禁止普通 CRUD 修改/删除，通用上传适配器也拒绝写入保留的 `master-assets` 路径。

作者主数据格式 2 显式携带 `assets.headshot`，品牌配置格式 2 携带 `assets.logo`，值为固定版本引用或明确的 null。旧格式 1 摘要保持不变。只有完成本地媒体复制且未撤回的资源，才可进入作者副本或经审阅选中的 `admin-branding`；logo 必须来自中央全局媒体。复制不自动改变站点已有选择或员工审定内容。

## 重试与撤回

R2 与 D1 不构成跨资源事务。复制中断保留未完成回执和可能已写入的版本对象；同一操作重试校验已有对象后继续提交。不能把 R2 PUT 成功等同于本站 media 已存在。

中央撤回记录不可变。站点收到撤回后先写 D1 tombstone，阻止继续选用该版本，再把公开和私有对象写成带 `assetWithdrawn=1` 的空对象。保留对象而不删除，是为了阻止延迟复制的 create-only PUT 重新创建字节；适配器将这类对象作为不存在处理。关系用到的 media ID 保留，文件路由应返回 404。任一 R2 写入失败都不会确认完成，必须重试。

条件 PUT 依赖 R2 的原子前置条件：条件不满足时返回 null 且不写对象，见 [Workers R2 API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)。Bindings 的写后读一致性不等于 CDN 缓存立即失效，见 [R2 一致性与缓存边界](https://developers.cloudflare.com/r2/reference/consistency/)。这里公开对象使用 `max-age=300`，私有归档使用 `no-store`；正式 CDN TTL/purge 和直出路径仍属于 P3，不能据此宣称全球即时撤回。

## 验证范围

`tests/int/assetSync.int.spec.ts` 在云端 CI 内以完整中央/站点 Payload 配置、三个原生 D1 和四个 R2 桶验证：

1. 五次并发复制去重，真实作者头像本地映射，实际文件路由字节，普通修改/删除拒绝，跨租户拒绝。
2. 全局 logo 在两个不同租户站点分别复制、审阅并选用。
3. 中央 R2 失败、D1 失败后重试，元数据保持发布意图。
4. 站点部分 R2 写入、media 插入失败后的回滚与重试。
5. 编辑员、伪造站点、损坏字节和研究证据拒绝。
6. 撤回失败重试，保留 media ID、文件 404、过期投递拒绝。
7. 复制与撤回交错时，版本空对象不会被旧字节覆盖。

固定版本 Miniflare 的 Node 桥接要求使用其自带 undici Headers；测试只替换 Node fixture 的 Headers，保留 Payload 生产文件处理分支、200/字节/缓存头断言。原生 workerd fixture 另检查 R2 writeHttpMetadata，不依赖该桥接替换。

以上测试与 P0 远程回归的范围不同：独立角色仍未正式挂载，P0 使用共享配置。构建通过也不表示正式资产服务已上线。

## 云端发布证据

最终提交 `7d739ec` 的构建 `b6ea36f8-2c46-4ecc-8129-c2277cffb90f` 成功，2026-09-17T09:24:23Z P0 线上回归与发布检查通过。P0 deployment `4494ed07-fd3e-4a5f-822b-c65d29eb8a32`，version `c90ce9e0-440c-4133-af71-6a3d8a7f25e1`；生产 deployment 保持 `3046ffb1-b8ad-47ba-a373-9be5d0526c4b`。本轮没有安装本地依赖或执行本地构建/测试；四次失败均在部署前被 CI 拦截，原因及后续验证见[结构化证据](site-per-d1-p1-assets-validation.json)。

## 剩余工作

- 后续[交互式内部服务鉴权](site-per-d1-p1-data-service.md)已通过原生 RPC 验证；正式角色绑定、来源投递、机器授权、队列重试/回执和撤回覆盖所有站点仍待完成。
- 管理界面、独立角色入口/import map/类型/schema 和远程迁移。
- SVG/其他附件及富文本内嵌关系的版本映射；本轮不静默复制这些资源。
- 公开媒体直出、CDN 清理与 TTL 验证、桶资源 ID 和访问策略预检。
- 未完成发布意图、孤立归档的运维检查与安全回收。
- P1 其他全链路要求及 P2–P5，继续按完整执行计划验收。
