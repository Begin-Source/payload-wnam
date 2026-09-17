import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createSitePayloadConfig } from '../site-runtime/config'
import { OpenAIConfig } from '../utilities/aiOpenAIConfigImport'
import { requireSiteEnvironment } from './siteEnvironment'

const building = process.env.WORKERS_CI === '1' && process.env.PAYLOAD_ROLE_BUILD === 'site'
const unavailable = () => { throw new Error('Build configuration cannot access runtime resources') }
const env = building ? {
  IDENTITY: { authenticate: unavailable, redeem: unavailable, logout: unavailable },
  SITE_PUBLIC: { get: unavailable, put: unavailable } as unknown as R2Bucket,
  SITE_PRIVATE: { get: unavailable, put: unavailable } as unknown as R2Bucket,
  PAYLOAD_SECRET: '__SITE_BUILD_ONLY_NEVER_A_RUNTIME_SECRET__',
} : requireSiteEnvironment((await getCloudflareContext({ async: true })).env).env
const config = await createSitePayloadConfig({ secret: env.PAYLOAD_SECRET, identity: env.IDENTITY,
  publicBucket: env.SITE_PUBLIC, privateBucket: env.SITE_PRIVATE, generationModels: OpenAIConfig.models,
  authorizeAiGeneration: async () => false,
  executeExternalTask: async () => { throw new Error('Metered site task execution is not configured') },
})
export default Promise.resolve(config)
