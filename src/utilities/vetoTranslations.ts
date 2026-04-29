const MAP: Record<string, string> = {
  T04: '缺少联盟声明（含 Amazon 链接但无 Disclosure）',
  C01: '标题与内容承诺不一致',
  R10: '价格/规格/数量等数据前后矛盾',
  CITE_T03: '未全站强制 HTTPS',
  CITE_T05: '未发布编辑与测评政策',
  CITE_T09: '用户评论/测评真实性存疑',
}

export function translateVeto(id: string): string {
  return MAP[id] || '质量闸未通过'
}
