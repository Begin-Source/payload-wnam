import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createCentralPayloadConfig } from '../site-control/config'
import { CENTRAL_ORIGIN } from '../site-control/sessionHttp'
import { OpenAIConfig } from '../utilities/aiOpenAIConfigImport'
import { requireCentralEnvironment } from './centralEnvironment'

// Schema/import-map generation must be pure. These capabilities cannot perform
// IO; they are selected only in Cloudflare Builds, never as a runtime fallback.
const building = process.env.WORKERS_CI === '1' && process.env.PAYLOAD_ROLE_BUILD === 'central'
const unavailable = () => { throw new Error('Build configuration cannot access runtime resources') }
const env = building ? {
  CENTRAL_D1: { prepare: unavailable } as unknown as D1Database,
  CENTRAL_MEDIA: { get: unavailable, put: unavailable } as unknown as R2Bucket,
  PAYLOAD_SECRET: '__CENTRAL_BUILD_ONLY_NEVER_A_RUNTIME_SECRET__',
} : requireCentralEnvironment((await getCloudflareContext({ async: true })).env)
const config = await createCentralPayloadConfig({ database: env.CENTRAL_D1, bucket: env.CENTRAL_MEDIA,
  secret: env.PAYLOAD_SECRET, generationModels: OpenAIConfig.models,
  // P2 supplies the metered vendor capability; the mounted admin cannot bypass it.
  authorizeAiGeneration: async () => false,
})
config.serverURL = CENTRAL_ORIGIN
config.csrf = [CENTRAL_ORIGIN]
export default Promise.resolve(config)
