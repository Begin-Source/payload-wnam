/**
 * @ai-stack/payloadcms `seedPrompts` hook: return only `{ data: { prompt } }` (no top-level
 * `prompt`/`system`) so `init` skips `systemGenerate` / OpenAPI calls while still creating
 * `plugin-ai-instructions` rows. Those ids power Compose; editors can change prompts in Admin.
 */
type SeedArgs = {
  fieldLabel: string
  fieldSchemaPaths: object
  fieldType: string
  path: string
}

export function aiPluginSeedPrompts({ fieldType, fieldLabel, path }: SeedArgs): {
  data: { prompt: string }
} {
  if (fieldType === 'richText') {
    return {
      data: {
        prompt: `Write structured, engaging content for "{{ title }}". Main field: ${fieldLabel} (${path}). Use clear sections, formatting, and a short conclusion where appropriate.`,
      },
    }
  }
  if (fieldType === 'textarea') {
    return {
      data: {
        prompt: `Write a short summary or meta text for "{{ title }}". Field: ${fieldLabel} (${path}).`,
      },
    }
  }
  if (fieldType === 'upload') {
    return {
      data: {
        prompt: `Describe a relevant image for "{{ title }}" (field ${fieldLabel}, ${path}).`,
      },
    }
  }
  return {
    data: {
      prompt: `Generate or refine text for "{{ title }}". Field: ${fieldLabel} (${path}).`,
    },
  }
}
