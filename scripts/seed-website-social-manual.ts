/**
 * 《网站与社交账号操作手册（员工版）》写入「操作手册」集合（`operation-manuals`），每租户一条，slug 固定可重跑。
 * 面向日常维护站点内容与社媒台账的员工；与知识库菜单「编辑手册」对应。
 * Usage: pnpm run seed:website-social-manual
 */
import 'dotenv/config'

import { getPayload } from 'payload'
import config from '../src/payload.config.js'

const SLUG = 'employee-website-social-operations'
const TITLE = '网站与社交账号操作手册（员工版）'

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

/** 员工可按章节从上到下执行；与当前仓库 Admin / pipeline 行为对齐（若有升级以线上为准）。 */
const MANUAL_BODY_TEXT = `
〇、开始之前
本手册面向需要在管理后台操作「网站」与「社交账号」的同事。后台为多租户 Payload；菜单是否出现取决于角色（如租户总经理、系统管理员、运营等）。没有菜单＝无权限，属正常，请联系管理员。
操作任何「站点」下的内容前，先在脑中确认：当前站点名称、主域名、语言是否与任务单一致，避免发错站。

一、如何创建一个新站点（Sites）
1）在侧栏打开「网站」分组，进入「站点」列表（若您看不到「站点」，说明无创建权限，请将需求提给租户总经理或系统管理员代为创建）。
2）点击右上角「Create New」或等价新建按钮。
3）必填与建议字段：名称（name）、slug（全站 URL 安全标识，勿含空格）、Primary domain（主域名，含 https 与否按公司规范填写）、状态 status（可先 Draft，内容就绪后改为 Active）。
4）可选：Blueprint（站点设计/蓝图）、运营人 operators、备注 notes；落地页展示类文案（浏览器标题、主副标题等）按表单说明填写。
5）保存。系统在「新建」成功后会尝试自动创建 6 张合规向固定页（About、Editorial Policy、Affiliate Disclosure、Contact、Privacy、Terms），语言环境为 zh；若未出现请截图联系管理员（不得手工删改这些 slug 以免破坏合规基线）。
6）新建站点后，请管理员或您在「站点配额」中为该站配置 dailyPostCap 等（见下文），否则批量排产默认上限可能不符合预期。

二、站点配额（Site Quotas）——和「自动写多少篇」直接相关
1）路径：侧栏「运营」→「站点配额」（名称以实际菜单为准）。
2）关注 dailyPostCap（每日发帖上限）。文章列表「批量排产」在未填本批上限时，默认按「日 cap × 7」且不超过 100 篇计算本批 brief 任务数量。
3）配额类字段由有权限角色维护；普通编辑若发现「批量排产」提示入队 0 或很少，先确认关键词是否存在，再请管理员检查配额。

三、分类（Categories）——写文章前的可选上下文
1）在「网站」→「分类」中，按站点新建分类；新建时若提示「请选择站点」，必须先选站点再保存（与文章、页面一致）。
2）分类说明会合并进部分「快捷操作」的提示词；保持分类描述简洁、业务准确。

四、关键词（Keywords）——自动产线的「燃料」
4.1 手工维护：在「网站」→「关键词」中新建词条，填写 term、站点、意图、状态等。批量排产会优先挑选 status=active 的词；若没有 active，会退而求其次使用 draft 状态的词（系统会标注使用了 fallback）。
4.2 发现与评分（DataForSEO / 种子）：由具备权限的同事或自动化创建 jobType=keyword_discover 的「工作流任务」，并绑定 site；由调度执行 /api/pipeline/keyword-discover。接口支持 persist 将候选词写入关键词库并计算 opportunityScore（机会分）；具体是否 persist 由调用方参数决定，请咨询管理员。
4.3 同一关键词若已存在进行中的 brief_generate 任务，批量排产会自动跳过，避免重复排队。
4.4 支柱/簇（pillar）：在关键词表单中可将「子词」的 pillar 关系指向另一条「支柱关键词」，用于主题簇规划；批量排产按 opportunityScore 排序挑词，与 pillar 无冲突，但运营上建议先整理好簇结构再大批量排产。
4.5 列表中的 opportunityScore、volume、KD、intent 等列在选词入库或刷新后才会较完整；若全空，说明尚未跑过发现或外部 API 未配置，请联系管理员。

五、「自动写文章」推荐路径（与界面一致，请严格按此操作）
当前后台中，真正能驱动「简报 → 骨架稿」流水线的是「批量排产」，而不是列表里的单次「写文章（工作流）」按钮。
5.1 打开路径：侧栏「网站」→「文章」列表 → 右上角或列表操作区中的「快捷操作 · 文章」按钮。
5.2 在弹窗中先选择站点（可输入名称、slug、域名筛选）。
5.3 选择「批量排产」（不要选「单次快捷」）。单次快捷会创建 ai_generate 类型任务，当前执行器未接线，界面也会提示「不会产文」——请勿依赖它做生产。
5.4 可选填写「本批最大篇数」：留空则使用「日 cap×7 且 ≤100」的默认规则；若手写数字，须为 ≥1 的整数且不超过 100。
5.5 点击「执行批量排产」。成功后提示「已入队 N 条 · 跳过 M 条」；N 为新建的 brief_generate 工作流任务数量。
5.6 这些任务不会立刻在浏览器里写完文章：需要「调度器」依次执行。调度由运维在 Cloudflare Cron 或等效方式 POST /api/pipeline/tick（或经 cron-dispatch 聚合）触发；每次通常处理一条 pending 任务。若任务长期 pending，请联系管理员检查 Cron 与密钥配置。
5.7 一条 brief_generate 成功完成后，系统会尝试自动再入队一条 draft_skeleton，用于根据已生成的「内容简报」创建草稿文章并写入 Lexical 骨架。您可在「内容大纲」「文章」中查看新生成的简报与草稿。
5.8 更细的「按章节 AI 填充」（draft_section / draft_finalize）是否已由自动化全部接好，取决于当前版本配置；若文章长时间停留在骨架阶段，请将文章 ID 与简报 ID 交给管理员评估是否手工补建 draft_section 任务或走人工编辑。

六、其他「快捷操作」按钮说明（避免误用）
「关键词」「页面」「分类」「设计」「媒体」列表上的快捷操作，当前同样会创建 jobType=ai_generate 的占位任务，并不会像批量排产那样直接进入 keyword_discover → brief_generate 链。若您的目标是产文，请回到第五节使用批量排产，或由管理员直接创建所需 jobType 的工作流任务。

七、工作流任务（Workflow Jobs）——如何盯进度
1）路径：「运营」→「工作流任务」。
2）关注列：label、jobType、status、site、updatedAt。status 常见值：pending（等待执行）、running、completed、failed、needs_input（缺资料）、failed_partial（部分失败）。
3）失败时请展开记录查看 errorMessage 与 output JSON，截图给管理员；不要擅自把 failed 改成 completed。
4）常见 jobType 与含义（节选）：keyword_discover 选词；brief_generate 生成内容简报；draft_skeleton 建骨架稿；draft_section / draft_finalize 章节与终稿；rank_track 排名抓取；triage 生命周期分流；internal_link_* 内链相关。具体是否启用由公司与运维决定。

八、内容简报（Content Briefs）与人工审核
1）简报默认 status=draft；若业务要求「先审后发」，请在简报编辑页将状态改为 Approved，再触发后续写稿（具体闸门以公司流程为准）。
2）outline 字段为结构化 JSON（含 sections 数组）。保存时若校验失败，按表单报错修改；不要随意清空 sections，否则下游骨架无法分段。

九、手工撰写或润色文章（发布检查单）
1）在「文章」中打开草稿，使用富文本编辑正文；绑定主关键词、内容模板（review / comparison / buyingGuide 等）、作者（Authors）、必要时上传原创证据并关联。
2）发布为「已发布」前：核对价格与规格与 Offer 一致；含联盟链接时确保披露可见；首图与证据图分类正确。
3）若保存被系统拒绝（质量闸、出链预算等），阅读报错文案或联系 SEO 负责人，勿强行跳过校验字段。

十、页面（Pages）与媒体（Media）
1）固定合规页勿删 slug；改文案前备份。
2）媒体上传注意版权与大小；列表上「快捷操作 · 媒体」当前为 ai_generate 占位，真正处理仍多以手工或专用流水线为准。

十一、社交：社交平台（Social Platforms）与社交账号（Social Accounts）
1）先维护「社交平台」字典级记录（如某微博、某小红书作为平台实体），再建「社交账号」行：必选 platform，建议关联 site，填写 handle（账号名）、status（active/disconnected）、notes。
2）社交台账用于登记与审计，发帖仍在各平台客户端完成，除非公司另有说明。
3）敏感凭据仅由授权人录入；禁止在聊天工具传密码与长效 Token。

十二、知识库里两类内容别搞混
1）「编辑手册」（本集合）：给员工的操作说明，如本页与《云系统·员工操作手册》。
2）「知识库 / 编辑文档」：业务研究、审计摘要、流水线产出等结构化知识；搜索关键词与手册不同。

十三、首页 SEO 看板（若已启用）
部分环境在登录后的首页（Dashboard）会嵌入「内容生命周期」与「内容日历」组件，数据来自内部接口聚合。用于查看各 lifecycle 阶段文章占比、关键词排期等。若卡片报错或为空，多为权限或尚未产生数据，联系管理员排查 /api/admin/seo-dashboard 配置。

十四、作者（Authors）与联盟商品（Offers）
1）测评/对比/导购类文章通常必须绑定 author；作者凭证（credentials）未满足时发布可能被拦截。请在「网站」→「作者」维护头像、简介、资质、GDPR 相关选项（欧盟等地区个人作者必填合法基础）。
2）Amazon 等联盟商品在「商务」或「Offers」类集合维护；文章中引用价格与评分时，以 Offer 快照为准，发布前核对是否与正文一致，避免触发数据一致性类质量规则。

十五、重定向（Redirects）
用于 301/302 等 URL 迁移。非授权勿改生产重定向；合并文章类需求由 SEO 负责人发起，改完后可在前台无痕模式自测跳转。

十六、管理员：如何手工新建一条「工作流任务」（无 UI 快捷按钮时）
1）进入「运营」→「工作流任务」→ 新建。
2）填写 label（便于列表识别）、jobType（下拉选择与任务一致，例如 keyword_discover、brief_generate、draft_skeleton…）、status 设为 pending。
3）绑定 site（以及必要时 pipelineKeyword、contentBrief、article 等关系字段），在 input JSON 中填入接口所需字段（如 keyword_discover 需站点；brief_generate 需 keywordId 等）。具体键名可对照开发文档或让管理员查看 /api/pipeline 下各 route 的 POST body。
4）保存后仍需依赖第五节所述 tick 调度执行；本地开发可由管理员用带鉴权的方式手动触发 tick 单步执行。

十七、仍无法解决时
收集：时间（含时区）、租户名、站点 ID 或名称、文章/任务 ID、浏览器地址栏路径、报错全文截图，联系系统管理员；涉法涉规问题转公司法务。

十八、与《SEO 流量矩阵》实施计划的关系（只读说明）
公司若按「SEO 流量矩阵」计划启用 Cron，可能包括：定时 triage、排名抓取、内链审计、Amazon 同步等。您作为执行层只需按本手册第五节与第七节跟进任务队列；计划中的技术细节以内部 Wiki 为准，不必阅读仓库源码。
`.trim()

function buildManualBody(): { root: Record<string, unknown> } {
  const lines = MANUAL_BODY_TEXT.split('\n')

  const children = lines.map((line) => textPara(line))

  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children,
    },
  }
}

const SUMMARY =
  '全站员工操作指南：创建站点与配额、关键词与支柱簇、批量排产驱动 brief→tick→draft_skeleton 自动写稿链、工作流盯盘、简报与手工发布检查单、首页 SEO 看板、作者与 Offer、重定向、社媒台账及管理员手工建任务。'

const SEARCH_KEYWORDS =
  '网站,站点,创建站点,社交,社媒,账号,员工,操作手册,批量排产,自动写文章,工作流,brief_generate,tick,draft_skeleton,关键词,opportunityScore,pillar,内容简报,Authors,Offers,重定向,SEO看板,权限'

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
      '[seed:website-social-manual] No tenants found. Create a tenant or run pnpm seed:dev first.',
    )
    process.exit(1)
  }

  const body = buildManualBody()
  for (const tenant of tenants.docs) {
    const tenantId = typeof tenant === 'object' && tenant && 'id' in tenant ? (tenant.id as number) : null
    if (tenantId == null) continue

    const existing = await payload.find({
      collection: 'operation-manuals',
      where: {
        and: [{ tenant: { equals: tenantId } }, { slug: { equals: SLUG } }],
      },
      limit: 1,
      overrideAccess: true,
    })

    const data: Record<string, unknown> = {
      title: TITLE,
      slug: SLUG,
      level: 'standard',
      status: 'published',
      summary: SUMMARY,
      searchKeywords: SEARCH_KEYWORDS,
      body,
      sortOrder: 1,
      tenant: tenantId,
    }

    if (existing.docs[0]) {
      await payload.update({
        collection: 'operation-manuals',
        id: existing.docs[0].id,
        data,
        overrideAccess: true,
      })
      console.info('[seed:website-social-manual] Updated tenant', tenantId, 'slug', SLUG)
    } else {
      await payload.create({
        collection: 'operation-manuals',
        data: data as never,
        overrideAccess: true,
      })
      console.info('[seed:website-social-manual] Created tenant', tenantId, 'slug', SLUG)
    }
  }

  console.info('[seed:website-social-manual] Done.')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
