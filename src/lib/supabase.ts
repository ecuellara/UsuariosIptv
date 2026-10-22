import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/* Cliente único de Supabase.
   Solo se publica la clave anon/publishable: `service_role` nunca entra al
   bundle (AGENTS.md). */

const url = import.meta.env.VITE_SUPABASE_URL ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const isSupabaseConfigured = url.length > 0 && anonKey.length > 0

if (!isSupabaseConfigured) {
  // Aviso de desarrollo: la app arranca, pero el login fallará con un mensaje
  // claro en pantalla en lugar de una pantalla en blanco.
  console.warn(
    'Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Revisa .env.development.local.',
  )
}

export const supabase = createClient<Database>(
  isSupabaseConfigured ? url : 'http://127.0.0.1:54321',
  isSupabaseConfigured ? anonKey : 'missing-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'iptv-manager-session',
    },
    global: {
      headers: { 'x-application-name': 'iptv-manager' },
    },
  },
)
