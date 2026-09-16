import type { Plugin } from 'payload'
import { assertSitePayloadRequest } from './payloadRequest'

/** Install last so plugin-created collections also receive the request guard. */
export const siteRequestIsolationPlugin: Plugin = config => ({
  ...config,
  collections: config.collections?.map(collection => ({
    ...collection,
    hooks: {
      ...collection.hooks,
      beforeOperation: [
        args => { assertSitePayloadRequest(args.req) },
        ...(collection.hooks?.beforeOperation ?? []),
      ],
    },
  })),
  globals: config.globals?.map(global => ({
    ...global,
    hooks: {
      ...global.hooks,
      beforeRead: [
        ({ req }) => { assertSitePayloadRequest(req) },
        ...(global.hooks?.beforeRead ?? []),
      ],
      beforeChange: [
        args => { assertSitePayloadRequest(args.req); return args.data },
        ...(global.hooks?.beforeChange ?? []),
      ],
    },
  })),
})
