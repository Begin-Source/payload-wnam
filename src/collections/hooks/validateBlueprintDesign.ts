import { ValidationError, type CollectionBeforeChangeHook } from 'payload'
import { defaultAmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import { AmzConfigValidationError } from '@/site-layouts/amz-template-1/configSchema'
import { mergePatchOntoAmzConfig } from '@/site-layouts/amz-template-1/mergeAmzSiteConfig'

/** All writes, including REST, CSV, Local API and version restore, share this boundary. */
export const validateBlueprintDesign: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (!Object.hasOwn(data, 'amzSiteConfigJson')) return data
  const raw = data.amzSiteConfigJson
  // Clearing the optional override explicitly restores the bundled defaults.
  if (raw == null) return data
  if (JSON.stringify(raw) === JSON.stringify(originalDoc?.amzSiteConfigJson)) return data
  try {
    data.amzSiteConfigJson = mergePatchOntoAmzConfig(defaultAmzSiteConfig, raw)
  } catch (error) {
    if (!(error instanceof AmzConfigValidationError)) throw error
    throw new ValidationError({
      collection: 'site-blueprints', req,
      errors: error.issues.map(issue => ({
        path: ['amzSiteConfigJson', issue.path].filter(Boolean).join('.'),
        message: issue.message,
      })),
    })
  }
  return data
}
