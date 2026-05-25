/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_DEMO?: string
  readonly VITE_AUTH_BYPASS_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
