export function pickModelForSectionType(
  sectionType: string,
  sectionRows: { sectionType: string; model: string; fallbackModel?: string }[] | undefined,
  defaults: { primary: string; cheap: string },
): string {
  const row = sectionRows?.find((r) => r.sectionType === sectionType)
  if (row?.model) {
    return row.model
  }
  if (['intro', 'conclusion', 'faq', 'pros_cons', 'topic_definition'].includes(sectionType)) {
    return defaults.cheap
  }
  return defaults.primary
}
