/**
 * 将《云系统·员工操作手册》写入「操作手册」集合（`operation-manuals`），每租户一条，slug 固定幂等可重跑。
 * Usage: pnpm run seed:employee-manual
 */
import 'dotenv/config'

import { getPayload } from 'payload'
import config from '../src/payload.config.js'

const SLUG = 'employee-system-manual'
const TITLE = '云系统·员工操作手册（基源科技）'

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

/**
 * 正文为 Lexical 段落列表（与 `emptyLexical` / 种子脚本兼容的最小结构）。
 */
function buildManualBody(): { root: Record<string, unknown> } {
  const lines: string[] = [
    '本手册说明如何在「基源科技 · 云系统」管理后台中完成日常操作。后台基于 Payload，数据存储在 Cloudflare 等；技术细节以管理员说明为准。',
    '一、如何进入',
    '欢迎页可进入「管理后台」登录。也可从欢迎页进入「知识库」快捷链。请使用公司为您开通的邮箱登录；忘记密码请联系系统管理员或 IT。',
    '二、权限与角色',
    '后台通过「角色」与「租户」控制可见范围。无特权角色的账号在后台中通常仅可使用白名单内能力，例如「通知公告」「操作手册」等；不是所有人都能看到全站功能。',
    '若您的菜单很少，属于权限设计如此，不是系统异常。多租户下，非全站超管一般只能看到本租户下站点与数据。不得与他人共用账号，不得外泄 API 密钥或导出的数据。',
    '三、侧栏菜单分组（有权限的菜单才会显示）',
    '— 首页：通知公告等。',
    '— 网站：站点、分类、媒体、文章、页面、重定向、落地模板、关键词、内容简报、作者、原创证据、审计相关展示等，用于站群与内容维护。',
    '— 运营：站点配额、工作流任务、排名、SERP 快照、内链/页面关系图、点击事件、审计日志等。',
    '— 社媒：社交平台、社交账号。',
    '— 团队：团队相关记录。',
    '— 商务：联盟网络、Offer。',
    '— 财务：佣金等；涉及结算须遵守内控，非授权人员勿改。',
    '— 知识库：知识库文档、操作手册（本手册所在集合）。',
    '— 系统：用户、租户等；MCP 密钥等多为管理员使用。实际菜单以您登录后显示为准。',
    '四、通知公告与操作手册',
    '「通知公告」在首页类分组中，用于公司或团队消息。「操作手册」在知识库分组中，分为入门/标准/进阶级别与发布状态；请优先阅读「已发布」条目。员工多为只读，编辑权限由公司指定角色持有。',
    '若您负责网站内容维护或社交账号台账，请同时阅读《网站与社交账号操作手册（员工版）》，在同一「编辑手册」列表中查找即可。',
    '五、列表上的通用能力（若该集合已开启）',
    '列表可搜索。部分集合提供「查找与替换」或「CSV 导入/导出」：有站点的需先选站点；媒体与操作手册等无 site 的集合在租户内操作。执行替换会写库，需具备更新权限；批量导入导出前请与负责人确认。',
    '六、问题与帮助',
    '无法登录、无菜单、需改角色或租户，请联系系统管理员。数据错误、技术故障请记录时间、页面路径、账号，联系管理员。若管理后台单条记录详情区空白，管理员可参考仓库内 docs 中的 D1/锁定表排查说明。',
  ]

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

const SUMMARY =
  '基源科技云系统管理后台的登录、权限、侧栏分组说明，以及公告/知识库/列表工具与安全须知。'

const SEARCH_KEYWORDS = '基源,员工,操作手册,Payload,管理后台,权限,通知公告,知识库'

async function main(): Promise<void> {
  const payload = await getPayload({ config })

  const tenants = await payload.find({
    collection: 'tenants',
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })

  if (tenants.docs.length === 0) {
    console.error('[seed:employee-manual] No tenants found. Create a tenant or run pnpm seed:dev first.')
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
      level: 'intro',
      status: 'published',
      summary: SUMMARY,
      searchKeywords: SEARCH_KEYWORDS,
      body,
      sortOrder: 0,
      tenant: tenantId,
    }

    if (existing.docs[0]) {
      await payload.update({
        collection: 'operation-manuals',
        id: existing.docs[0].id,
        data,
        overrideAccess: true,
      })
      console.info('[seed:employee-manual] Updated tenant', tenantId, 'slug', SLUG)
    } else {
      await payload.create({
        collection: 'operation-manuals',
        data: data as never,
        overrideAccess: true,
      })
      console.info('[seed:employee-manual] Created tenant', tenantId, 'slug', SLUG)
    }
  }

  console.info('[seed:employee-manual] Done.')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
