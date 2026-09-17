import { requireSiteContext } from './context'

/** Payload stores relative filenames. Only this adapter adds the trusted site prefix. */
export function createSiteR2Proxy(bucket: R2Bucket, permissions: { assetWrites?: boolean } = {}): R2Bucket {
  const writable = (key: string) => {
    if (key.split('/')[0] === 'master-assets' && !permissions.assetWrites) throw new Error('Versioned asset writes require the synchronization capability')
    return key
  }
  function scope() {
    const owner = requireSiteContext()
    if (!/^[a-zA-Z0-9_-]+$/.test(owner.siteId)) throw new Error('Invalid R2 site ID')
    const prefix = `sites/${owner.siteId}/`
    const assertOwner = () => {
      if (requireSiteContext().requestToken !== owner.requestToken) {
        throw new Error('Cross-context R2 object rejected')
      }
    }
    const key = (value: string) => {
      if (!value || value.startsWith('/') || value.includes('\\') ||
        value.split('/').some(part => part === '..' || part === '.') || value.includes('\0')) {
        throw new Error('Invalid relative R2 key')
      }
      return prefix + value
    }
    function object<T extends R2Object | R2ObjectBody | null>(value: T): T {
      if (!value) return value
      if (value.customMetadata?.assetWithdrawn === '1') return null as T
      return new Proxy(value, {
        get(target, property) {
          assertOwner()
          if (property === 'key') return target.key.slice(prefix.length)
          const result = Reflect.get(target, property, target)
          if (typeof result !== 'function') return result
          return (...args: unknown[]) => {
            assertOwner()
            return Reflect.apply(result, target, args)
          }
        },
      })
    }
    return { key, object }
  }
  return Object.freeze({
    async head(key: string) {
      const s = scope()
      return s.object(await bucket.head(s.key(key)))
    },
    async get(key: string, options?: R2GetOptions) {
      const s = scope()
      return s.object(await bucket.get(s.key(key), options))
    },
    async put(key: string, value: Parameters<R2Bucket['put']>[1], options?: R2PutOptions) {
      const s = scope()
      return s.object(await bucket.put(s.key(writable(key)), value, options))
    },
    async delete(keys: string | string[]) {
      const s = scope()
      return bucket.delete(Array.isArray(keys) ? keys.map(key => s.key(writable(key))) : s.key(writable(keys)))
    },
    // Payload server uploads use get/head/put/delete. Reject unused capabilities
    // until they have their own scoped cursor / multipart ownership protocol.
    list() { throw new Error('Site R2 listing is disabled') },
    createMultipartUpload() { throw new Error('Site R2 multipart uploads are disabled') },
    resumeMultipartUpload() { throw new Error('Site R2 multipart uploads are disabled') },
  }) as R2Bucket
}
