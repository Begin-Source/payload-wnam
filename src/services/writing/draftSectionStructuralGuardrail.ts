/**
 * Appended to draft_section user prompts so body/intro do not echo FAQ from the brief,
 * and the FAQ pass does not duplicate an earlier FAQ list.
 */
export function appendDraftSectionStructuralGuardrailUserBlock(sectionType: string): string {
  const st = (sectionType || 'custom').trim().toLowerCase()
  if (st === 'faq') {
    return [
      '',
      'Structural guardrail (FAQ pass):',
      '- This must be the article\'s single FAQ block.',
      '- Do not restate the same questions already answered at length in prior H2 sections; shorten or cross-reference instead.',
      '- Use one "## FAQ" (no separate "FAQ Block" section). No second parallel Q&A list with near-identical bullets.',
      '- Output Markdown for this section only; it is merged into the CMS Lexical article body (not saved as a standalone .md file).',
    ].join('\n')
  }
  return [
    '',
    'Structural guardrail (non-FAQ section):',
    '- Do not add a FAQ, Q&A list, "People also ask" block, or bullet Q&A cluster here.',
    '- The global context may mention FAQs for planning only—those are written in the dedicated FAQ section, not repeated in this section.',
    '- Stay within this section\'s heading promise only.',
    '- Output Markdown for this section only; it is merged into the CMS Lexical article body (not saved as a standalone .md file).',
  ].join('\n')
}
