declare namespace NodeJS {
  interface ProcessEnv {
    /** Optional fallback for admin tab title when `admin-branding.brandName` is empty (see AdminBrandingEffects). */
    NEXT_PUBLIC_ADMIN_BRAND_NAME?: string
    /**
     * When `true`, Payload AI plugin runs `generatePromptOnInit` in production (one-shot seed of
     * `plugin-ai-instructions`). Set in Cloudflare, deploy once, then remove. See `payload.config.ts`.
     */
    PAYLOAD_SEED_AI_PROMPTS?: string
  }
}
