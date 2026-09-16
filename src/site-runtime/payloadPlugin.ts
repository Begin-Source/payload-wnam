import type { SanitizedConfig } from 'payload'
import { assertSitePayloadRequest } from './payloadRequest'

/** Payload adds preferences, locked documents and jobs during sanitization. */
export function guardSanitizedSiteConfig(config: SanitizedConfig): SanitizedConfig {
  for (const collection of config.collections) {
    collection.hooks.beforeOperation.unshift(({ req }) => { assertSitePayloadRequest(req) })
  }
  for (const global of config.globals) {
    global.hooks.beforeOperation.unshift(({ req }) => { assertSitePayloadRequest(req) })
  }
  return config
}
