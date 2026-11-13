/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_MODE?: 'production' | 'staging'
  readonly VITE_STAGING_WEBHOOK_149_URL?: string
  readonly VITE_STAGING_WEBHOOK_149B_URL?: string
  readonly VITE_STAGING_WEBHOOK_152_URL?: string
  readonly VITE_STAGING_WEBHOOK_150_URL?: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
