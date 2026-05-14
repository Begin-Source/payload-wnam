let cloudflareD1Binding: unknown = null
const GLOBAL_D1_BINDING_KEY = '__payloadWnamCloudflareD1Binding'

export function setCloudflareD1Binding(binding: unknown): void {
  cloudflareD1Binding = binding
  ;(globalThis as Record<string, unknown>)[GLOBAL_D1_BINDING_KEY] = binding
}

export function getCloudflareD1Binding(): unknown {
  return cloudflareD1Binding ?? (globalThis as Record<string, unknown>)[GLOBAL_D1_BINDING_KEY] ?? null
}
