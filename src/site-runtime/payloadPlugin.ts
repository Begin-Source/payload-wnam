import type { SanitizedConfig } from 'payload'
import { assertSitePayloadRequest } from './payloadRequest'

/** Payload adds preferences, locked documents and jobs during sanitization. */
export function guardSanitizedSiteConfig(config: SanitizedConfig): SanitizedConfig {
  for (const collection of config.collections) {
    collection.hooks.beforeOperation = [
      ({ req }) => { assertSitePayloadRequest(req) },
      ...(collection.hooks.beforeOperation ?? []),
    ]
  }
  for (const global of config.globals) {
    global.hooks.beforeOperation = [
      ({ req }) => { assertSitePayloadRequest(req) },
      ...(global.hooks.beforeOperation ?? []),
    ]
  }
  return config
}
