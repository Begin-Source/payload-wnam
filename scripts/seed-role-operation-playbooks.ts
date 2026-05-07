/**
 * 四类角色分册 SOP →「编辑手册」（`operation-manuals`），按租户幂等写入；状态「已发布」。
 * Admin：侧栏「知识库」→「编辑手册」。阅读门户：登录后 `/portal/knowledge`。
 *
 * Usage: pnpm run seed:role-operation-playbooks
 */
import 'dotenv/config'

import { getPayload } from 'payload'
import config from '../src/payload.config.js'

type LexText = {
  type: 'text'
  text: string
  version: number
  format: number
  style: string
  mode: 'normal'
  detail: number
}

function textPara(line: string): {
  type: 'paragraph'
  format: string
  indent: number
  version: number
  textFormat: number
  textStyle: string
  direction: 'ltr'
  children: LexText[]
} {
  return {
    type: 'paragraph',
    format: '',
    indent: 0,
    version: 1,
    textFormat: 0,
    textStyle: '',
    direction: 'ltr',
    children: line
      ? [
          {
            type: 'text',
            text: line,
            version: 1,
            format: 0,
            style: '',
            mode: 'normal',
            detail: 0,
          },
        ]
      : [],
  }
}

function buildBody(lines: readonly string[]): { root: Record<string, unknown> } {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: lines.map((line) => textPara(line)),
    },
  }
}

/** 四套手册 slug 固定，便于书签与站内搜索。按角色打开对应条目即可从上到下执行。 */
const PLAYBOOKS: Array<{
  slug: string
  title: string
  level: 'intro' | 'standard' | 'advanced'
  sortOrder: number
  summary: string
  searchKeywords: string
  bodyLines: string[]
}> = [
  {
    slug: 'sop-site-manager',
    title: '站长（site-manager）标准作业流程',
    level: 'standard',
    sortOrder: 20,
    summary:
      '从零新建站点到「整站可运营」：创站与蓝图、站点级配图与工作流配额、关键词与支柱、定时驱动的自动写稿/配图链路、简报与质检发布、例行盯盘。',
    searchKeywords:
      '站长,site-manager,新建站点,建站,蓝图,配额,Logo,横幅,配图,封面,定时,Cron,tick,关键词,批量排产,工作流,pipeline',
    bodyLines: [
      '〇、角色目标（你与「运维定时」的配合）',
      '站长负责本站点：从新建网站开始，把结构、配图、主要内容与文章产线在系统里配置完整，并按公司节奏「定时产出」。',
      '「定时」两层的含义：（1）公司侧已配置 Cron/调度定期调用流水线调度入口（一般由系统管理员运维），队列才会持续消化；（2）你按日/按周触发「批量排产」与配图类任务，并盯「工作流任务」直到 completed。',
      '细节按钮路径与批量排产注意点，请以《网站与社交账号操作手册（员工版）》为准；本分册写的是「建新站 → 铺满内容与图」主线。',
      '查看路径：后台「知识库」→「编辑手册」本条；阅读门户 `/portal/knowledge`。',
      '',
      '一、开始前',
      '1）登录 `/admin`，确认当前租户、`payload-tenant` 或多租户选择与目标站一致。',
      '2）无「站点 / 蓝图 / 媒体」等菜单时请联系管理员授予 site-manager（并绑定可看站点）；禁止共用账号。',
      '',
      '二、从零新建站点（Sites）——整站第一课',
      '1）打开「网站」→「站点」→新建：填写名称、slug（全小写安全字符）、Primary domain（主域名按公司 HTTPS 规范）。',
      '2）选择 Blueprint / 站点布局（site layout）等：这会决定前台壳子与自动生成页能力；与公司模板负责人对齐后再保存。',
      '3）新建成功后，系统通常会尝试实例化多套合规固定页（About / Disclosure / Privacy 等）；若未出现请勿擅自乱删 slug，截图找管理员。',
      '4）在「站点」上按需绑定 SEO 流水线方案（A/B）；不绑则继承租户默认或全局默认。',
      '5）请到「运营」→「站点配额」为该站设置 dailyPostCap 等：**否则批量排产的默认篇数与时间窗会与预期不符**。',
      '',
      '三、整站视觉与结构化素材（在内容大规模生成前先做）',
      '1）**站点 Logo / 首页 Hero 横幅**：在站点或媒体快捷入口触发对应生图流水线（名称以菜单为准）；失败时在「工作流任务」查看 errorMessage。',
      '2）**分类封面**：为各分类补齐封面媒体（同样有分类封面类流水线时请按向导执行）；确保分类已关联正确站点。',
      '3）**导航与页脚模板**：若由蓝图或站点字段驱动，先在 Blueprint/站点上填好文案与链接，再在固定页自检前台展示。',
      '4）**媒体库**：上架必要的品牌图、占位图；正文内插图多由文章的 image_generate / media-image 链路在发布后或流水线中补齐（视租户配置而定）。',
      '',
      '四、关键词与研究池（定时产文的「弹药库」）',
      '1）「网站」→「关键词」按站点筛选；建立支柱词 + 簇词关系（pillar），把待产词的 status 设为 active（或与公司规范一致）。',
      '2）若词表需要从 DataForSEO 等拉取与打分：由有权同事创建或触发 jobType=`keyword_discover` 等工作流任务，并盯住 completed 后再排产。',
      '3）无机会分/KD 时勿硬排：先补足发现或收窄词表。',
      '',
      '五、定时内容生产主轴（简报 → 骨架 → 章节 → 终稿 → 配图）',
      '1）**触发批量排产**（按计划每天/每周执行）：「网站」→「文章」→「快捷操作 · 内容大纲」→**选批量排产**（勿选仅创建 ai_generate 占位任务的单次快捷）。',
      '2）本批最大篇数可留空（由站点配额与时间窗推导）或手动填入上限。',
      '3）**队列执行依赖调度**：运维会对 `/api/pipeline/tick` 等做定时触发；你看到大量 pending 长期不动时，先自查是否密钥/预算/失败任务堵塞，同时通知运维看 Cron。',
      '4）在「运营」→「工作流任务」按本站过滤：关注 brief_generate → draft_skeleton → draft_section ×N → draft_finalize →（可选）image_generate / 其它配图 job。',
      '5）简报需要「先审后发」时：在「内容大纲」把简报审到 Approved，再继续下游（公司内部制度为准）。',
      '',
      '六、把站「铺满」收口清单（上线前自检）',
      '1）固定合规页可复制可读；首页与关键类目页有配图与可读文案。',
      '2）至少一批文章已通过质检并 published；抽样打开前台核对联盟披露、Featured、内链占位是否已消解。',
      '3）重定向、sitemap（若公司业务要求）已由管理员或你从工具侧确认无大面积 404。',
      '',
      '七、日常巡检（建站之后）',
      '1）每班：过滤本站 failed / needs_input 任务；摘录 ID 与截图升级。',
      '2）按计划补跑批量排产、补 Logo/Hero/分类封面（改版时）。',
      '3）对已发布 Article 做价格和 Offer 快照核对（评测/导购类必读）。',
      '',
      '八、升级路径',
      'Cron 不跑、全站 pending、密钥与迁移错误、租户级流水线策略变更 → **系统管理员 / 运营经理**。仅本站权限不足 → 组长 / 总经理。',
    ],
  },
  {
    slug: 'sop-ops-manager',
    title: '运营经理（ops-manager）标准作业流程',
    level: 'standard',
    sortOrder: 21,
    summary:
      '租户内运营统筹：配额与队列健康、关键词与排产策略、SEO 流水线方案与全局 SEO 流水线、内容日历/看板（若启用）、跨站协调与问题分流。',
    searchKeywords:
      '运营经理,ops-manager,配额,工作流,流水线,pipeline,profile,关键词,日历,SEO',
    bodyLines: [
      '〇、职责边界',
      '运营经理一般具备跨站点只读或写权限（以账号实际角色为准）。本分册描述「如何带团队把产线跑稳」；技术部署与密钥以系统管理员为准。',
      '',
      '一、每日健康检查（15 分钟）',
      '1）「运营」→「工作流任务」：pending 是否堆积、failed 是否突增；抽查 errorMessage。',
      '2）「网站」→「关键词」：各站 active 词量、机会分是否长期空白（可能未跑发现或外部 API 异常）。',
      '3）若启用首页看板/内容日历：扫一眼排期与 lifecycle 分布是否异常。',
      '',
      '二、站点配额与成本',
      '1）「运营」→「站点配额」：核对 dailyPostCap、预算类字段与公司月目标一致。',
      '2）遇到「批量排产为 0 或很少」先排除关键词与重复任务，再调配额或限流策略。',
      '',
      '三、流水线策略（A/B 与回溯）',
      '1）全局默认在 Globals「全局 SEO 流水线」（pipeline-settings）；按租户实验用集合「SEO 流水线方案」（pipeline-profiles）。',
      '2）侧栏可进「SEO 流水线方案 · 对比」横向看 KPI（需权限）；站点或文章级的方案绑定在站点/文章字段上。',
      '3）改策略前：记录当前 slug 与假设；改后观察工作流失败率、耗时与排名/质量分（以报表为准）。',
      '',
      '四、驱动发现与排产节奏',
      '1）按公司节奏触发 keyword_discover（界面或工作流任务），确认 persist 策略与站点范围。',
      '2）与站长对齐：哪些站优先排产、哪些模板先跑；避免同一批重复 brief。',
      '',
      '五、事故分级',
      '1）单站单任务失败 → 站长或当班运营处理日志与补跑。',
      '2）全站队列停滞 / 大面积 API 报错 → 通知系统管理员（Cron、密钥、D1）。',
      '3）内容合规舆情类 → 同步法务与市场负责人。',
      '',
      '六、文档与权限',
      '需要新员工可读 SOP → 确认其能访问「编辑手册」与 /portal/knowledge；编辑手册仅限管理员指定的编辑角色。',
    ],
  },
  {
    slug: 'sop-finance-manager',
    title: '财务经理（finance）标准作业流程',
    level: 'standard',
    sortOrder: 22,
    summary:
      '面向以财务为主职的账号：侧栏可达「佣金」「编辑手册（只读指引）」「佣金规则」只读等业务白名单菜单；佣金核对、commission-rules、内控与安全注意事项。',
    searchKeywords:
      '财务,finance,佣金,commissions,commission-rules,结算,内控',
    bodyLines: [
      '〇、你能看到什么菜单',
      '「纯 finance」账号默认只能打开财务白名单集合（含「佣金」「编辑手册」只读）；其他网站/运营菜单不会出现属正常。',
      '若同时要兼管运营侧，由系统管理员为你的账号增加 ops-manager（或等价）角色，不要用财务账号给他人代办非财务操作。',
      '',
      '一、日常佣金处理',
      '1）打开「财务」→「佣金」列表。',
      '2）按租户、时间段、收款方或状态筛选；与上游 Offer/点击归因导出表对账。',
      '3）状态流转（已确认、已结算等）与公司会计制度一致；禁止回溯修改已结账期记录时，请走冲正流程而非直接删库。',
      '',
      '二、佣金规则全局',
      '1）在 Globals 打开「commission-rules」（若侧栏可见）：只读核对费率、分成与例外条款。',
      '2）若需修订规则 → 一般由财务负责人或管理员在 Payload 中有意更新并留痕。',
      '',
      '三、内控与安全',
      '1）不得下载或转发全站用户信息、未经授权的 MCP 密钥、生产数据库备份。',
      '2）导出 CSV 仅能用于合同约定范围；用后删除本地副本。',
      '3）发现金额异常或与 Offer 脱节 → 冻结相关批次操作并升级运营与技术共同排查。',
      '',
      '四、需要技术协助时',
      '准备：租户名、佣金记录 ID、对账时间段、期望值与截图。联系系统管理员；勿自行在服务器或 Wrangler 上执行不熟悉命令。',
    ],
  },
  {
    slug: 'sop-system-admin',
    title: '系统管理员（system-admin）标准作业流程',
    level: 'advanced',
    sortOrder: 23,
    summary:
      '租户与用户、密钥与 MCP、迁移与 Cron 调度入口、环境与 OpenNext 发布、常见问题（迁移未跑导致列表空白、外键、sessions）。',
    searchKeywords:
      'system-admin,超管,租户,用户,MCP,D1,migrate,Cron,PAYLOAD_SECRET,运维',
    bodyLines: [
      '〇、权限模型（牢记）',
      '系统管理员可操作「系统」分组内多项能力，但仍受多租户与业务 hook 约束；全站破坏性操作前先备份并沟通。',
      '`super-admin`/环境超管另有最高权限边界，参见仓库 superAdmin 工具函数。',
      '',
      '一、账号与租户',
      '1）「系统」→「用户」：创建/禁用账号，分配 roles 与租户数组。',
      '2）「系统」→「租户」：维护租户主数据；与普通业务变更区分审批。',
      '',
      '二、密钥与 MCP',
      '1）DataForSEO / Tavily / Together / OpenRouter 仅在运行环境密钥中配置，不入 git。',
      '2）MCP API Keys 在 MCP 插件集合维护；按需最小授权集合与 Globals。',
      '',
      '三、数据库与迁移',
      '1）Schema 变更必须带 `src/migrations` SQL 迁移；部署流水线执行 payload migrate。',
      '2）若业务反馈某集合后台列表空白，优先核对 Network API 是否 500、本地/远程库是否缺失新列。',
      '',
      '四、调度与流水线',
      '1）生产 Cron 常为 GitHub Actions 调 `/api/pipeline/tick` 等（见 wrangler/README 与公司 CI）。',
      '2）改 Cron 前先评估任务堆积与单次执行时长。',
      '',
      '五、发布',
      '1）按仓库 `pnpm run deploy` / OpenNext Cloudflare 流程发布；发布后观察观测平台错误率。',
      '',
      '六、支持运营与财务',
      '接到工单时收集：时间、路由、用户邮箱、记录 ID、截图；复现优先在预发或只读查询上进行。',
    ],
  },
]

async function main(): Promise<void> {
  const payload = await getPayload({ config })

  const tenants = await payload.find({
    collection: 'tenants',
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })

  if (tenants.docs.length === 0) {
    console.error(
      '[seed:role-operation-playbooks] No tenants. Create a tenant or run pnpm seed:dev first.',
    )
    process.exit(1)
  }

  for (const tenant of tenants.docs) {
    const tenantId = typeof tenant === 'object' && tenant && 'id' in tenant ? (tenant.id as number) : null
    if (tenantId == null) continue

    for (const book of PLAYBOOKS) {
      const body = buildBody(book.bodyLines)
      const existing = await payload.find({
        collection: 'operation-manuals',
        where: {
          and: [{ tenant: { equals: tenantId } }, { slug: { equals: book.slug } }],
        },
        limit: 1,
        overrideAccess: true,
      })

      const data: Record<string, unknown> = {
        title: book.title,
        slug: book.slug,
        level: book.level,
        status: 'published',
        summary: book.summary,
        searchKeywords: book.searchKeywords,
        body,
        sortOrder: book.sortOrder,
        tenant: tenantId,
      }

      if (existing.docs[0]) {
        await payload.update({
          collection: 'operation-manuals',
          id: existing.docs[0].id,
          data,
          overrideAccess: true,
        })
        console.info('[seed:role-operation-playbooks] Updated', tenantId, book.slug)
      } else {
        await payload.create({
          collection: 'operation-manuals',
          data: data as never,
          overrideAccess: true,
        })
        console.info('[seed:role-operation-playbooks] Created', tenantId, book.slug)
      }
    }
  }

  console.info('[seed:role-operation-playbooks] Done.')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
