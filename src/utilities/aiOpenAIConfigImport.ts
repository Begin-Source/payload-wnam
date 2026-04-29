/**
 * `OpenAIConfig` lives under package `dist/` (not in package `exports`); import here so
 * `payload.config` can use `OpenAIConfig.models` for a stable `generationModels` baseline.
 */
export { OpenAIConfig } from '../../node_modules/@ai-stack/payloadcms/dist/ai/models/openai/index.js'
