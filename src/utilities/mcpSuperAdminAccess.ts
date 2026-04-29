import type { MCPAccessSettings } from '@payloadcms/plugin-mcp'

const fullCollectionMcpAccess = {
  find: true,
  create: true,
  update: true,
  delete: true,
} as const

const mcpGroupedPermissionKeys = ['payload-mcp-tool', 'payload-mcp-resource', 'payload-mcp-prompt'] as const

/**
 * Forces all MCP capability flags on for collections and custom tool/resource/prompt groups.
 * Used when the API key owner is a super admin so MCP clients get maximum allowed operations
 * (still bounded by what the plugin registers and by Payload collection access control).
 */
export function expandMcpAccessForSuperAdmin(
  settings: MCPAccessSettings,
  collectionSlugs: readonly string[],
): MCPAccessSettings {
  const base = settings as MCPAccessSettings & Record<string, unknown>
  const next: Record<string, unknown> = { ...base }

  for (const slug of collectionSlugs) {
    next[slug] = { ...fullCollectionMcpAccess }
  }

  for (const key of mcpGroupedPermissionKeys) {
    const group = base[key]
    if (group && typeof group === 'object' && !Array.isArray(group)) {
      next[key] = Object.fromEntries(
        Object.keys(group as Record<string, unknown>).map((k) => [k, true]),
      )
    }
  }

  return next as MCPAccessSettings
}
