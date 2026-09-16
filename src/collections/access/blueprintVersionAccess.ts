import type { Access, Where } from 'payload'
import { siteScopedCollectionAccess } from './siteScopedContentAccess'

/** Native version documents wrap source fields inside `version`. */
export function whereForBlueprintVersions(where: Where): Where {
  return Object.fromEntries(Object.entries(where).map(([key, value]) => {
    if ((key === 'and' || key === 'or') && Array.isArray(value)) {
      return [key, value.map(whereForBlueprintVersions)]
    }
    return [key === 'id' ? 'parent' : `version.${key}`, value]
  }))
}

const readBlueprint = siteScopedCollectionAccess('site-blueprints')?.read
export const readBlueprintVersions: Access = async args => {
  const access = readBlueprint ? await readBlueprint(args) : false
  return typeof access === 'boolean' ? access : whereForBlueprintVersions(access)
}
