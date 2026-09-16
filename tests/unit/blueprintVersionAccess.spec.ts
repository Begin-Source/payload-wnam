import { expect, it } from 'vitest'
import { whereForBlueprintVersions } from '@/collections/access/blueprintVersionAccess'

it('keeps site restrictions inside native version fields', () => {
  expect(whereForBlueprintVersions({ and: [{ site: { in: [7] } }, { id: { equals: 3 } }] }))
    .toEqual({ and: [{ 'version.site': { in: [7] } }, { parent: { equals: 3 } }] })
})
