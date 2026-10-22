import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/* Cliente único de Supabase.
   Solo se publica la clave anon/publishable: `service_role` nunca entra al
   bundle (AGENTS.md). */

const url = import.meta.env.VITE_SUPABASE_URL ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const isSupabaseConfigured = url.length > 0 && anonKey.length > 0

/** Valores públicos del proyecto. Se usan para el cliente efímero de reautenticación. */
export const supabaseUrl = isSupabaseConfigured ? url : 'http://127.0.0.1:54321'
export const supabaseAnonKey = isSupabaseConfigured ? anonKey : 'missing-anon-key'

/** Clave de localStorage donde Supabase persiste la sesión. */
export const AUTH_STORAGE_KEY = 'iptv-manager-session'

if (!isSupabaseConfigured) {
  // Aviso de desarrollo: la app arranca, pero el login fallará con un mensaje
  // claro en pantalla en lugar de una pantalla en blanco.
  console.warn(
    'Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Revisa .env.development.local.',
  )
}

export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: AUTH_STORAGE_KEY,
    },
    global: {
      headers: { 'x-application-name': 'iptv-manager' },
    },
  },
)

/**
 * Cliente de un solo uso para comprobar la contraseña actual sin tocar la
 * sesión principal. `signInWithPassword` vuelve a emitir un JWT `aal1`; si se
 * hiciera sobre el cliente principal, el cambio de contraseña degradaría una
 * sesión que ya pasó el segundo factor. Este cliente no persiste nada y se
 * descarta al terminar la comprobación.
 */
export function createReauthClient() {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'iptv-manager-reauth',
    },
    global: {
      headers: { 'x-application-name': 'iptv-manager-reauth' },
    },
  })
}
