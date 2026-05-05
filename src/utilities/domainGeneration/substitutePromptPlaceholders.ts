/** Replace `{{key}}` literals in template; unknown keys stay unchanged. */
export function substitutePromptPlaceholders(
  template: string,
  vars: Record<string, string>,
): string {
  let out = template
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v)
  }
  return out
}
