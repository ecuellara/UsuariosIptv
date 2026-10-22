/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL del proyecto Supabase (local o remoto). */
  readonly VITE_SUPABASE_URL?: string
  /** Clave publicable (anon/publishable). Nunca `service_role`. */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
