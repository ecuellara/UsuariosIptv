import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/query-client'
import { AppError, isAuthError, toUserMessage } from '@/lib/errors'
import { getProfile } from '@/services/profile'
import type { Profile } from '@/types/domain'

export type AccessState = 'unknown' | 'granted' | 'denied'

/**
 * Sesión de Supabase Auth + fila de `profiles`.
 *
 * Monousuario: tener credenciales válidas no es tener acceso. `is_admin()` en
 * SQL exige una fila en `profiles`; sin ella la app muestra el estado
 * "sin permiso" (PANTALLAS.md §1.4) y no pinta datos.
 */
export const useSessionStore = defineStore('session', () => {
  const session = ref<Session | null>(null)
  const profile = ref<Profile | null>(null)
  const initialized = ref(false)
  const loading = ref(false)
  const access = ref<AccessState>('unknown')
  const errorMessage = ref<string | null>(null)

  let initPromise: Promise<void> | null = null

  const hasSession = computed(() => session.value !== null)
  const isAuthenticated = computed(
    () => hasSession.value && access.value === 'granted',
  )
  const userId = computed(() => session.value?.user.id ?? null)
  const userEmail = computed(() => session.value?.user.email ?? '')
  const displayName = computed(
    () =>
      profile.value?.displayName ??
      session.value?.user.email?.split('@')[0] ??
      'Administrador',
  )

  async function loadProfile(): Promise<Profile | null> {
    if (!session.value) return null
    try {
      const found = await getProfile(session.value.user.id)
      profile.value = found
      access.value = found ? 'granted' : 'denied'
      return found
    } catch (error) {
      if (isAuthError(error)) {
        session.value = null
        profile.value = null
        access.value = 'denied'
      } else {
        access.value = 'unknown'
        errorMessage.value = toUserMessage(
          error,
          'No se pudo verificar tu acceso al panel.',
        )
      }
      return null
    }
  }

  function subscribe(): void {
    supabase.auth.onAuthStateChange((event, nextSession) => {
      // Sin llamadas a PostgREST dentro del callback (evita el bloqueo interno
      // de GoTrue). El perfil se carga fuera del callback.
      session.value = nextSession
      if (event === 'SIGNED_OUT' || !nextSession) {
        profile.value = null
        access.value = 'denied'
        return
      }
      if (event === 'TOKEN_REFRESHED') return
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        setTimeout(() => {
          void loadProfile()
        }, 0)
      }
    })
  }

  async function initialize(): Promise<void> {
    loading.value = true
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      session.value = data.session
      if (data.session) {
        await loadProfile()
      } else {
        access.value = 'denied'
      }
    } catch (error) {
      errorMessage.value = toUserMessage(
        error,
        'No se pudo comprobar la sesión.',
      )
    } finally {
      initialized.value = true
      loading.value = false
      subscribe()
    }
  }

  /** Idempotente: el guard puede llamarla en cada navegación sin coste. */
  async function ensureInitialized(): Promise<void> {
    if (!initPromise) initPromise = initialize()
    return initPromise
  }

  async function signIn(email: string, password: string): Promise<void> {
    loading.value = true
    errorMessage.value = null
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        const message = toUserMessage(
          error,
          'No pudimos iniciar sesión. Revisa tu correo y contraseña.',
        )
        errorMessage.value = message
        throw new AppError(message, 'AUTH', error)
      }
      session.value = data.session
      const found = await loadProfile()
      if (!found) {
        access.value = 'denied'
        errorMessage.value = null
      }
    } finally {
      loading.value = false
    }
  }

  async function signOut(): Promise<void> {
    try {
      await supabase.auth.signOut()
    } finally {
      session.value = null
      profile.value = null
      access.value = 'denied'
      errorMessage.value = null
      queryClient.clear()
    }
  }

  /** Sesión expirada detectada por un 401 de PostgREST. */
  function handleExpired(): void {
    if (!session.value) return
    session.value = null
    profile.value = null
    access.value = 'denied'
    errorMessage.value = 'Tu sesión expiró. Vuelve a iniciar sesión.'
    queryClient.clear()
    void supabase.auth.signOut({ scope: 'local' })
  }

  function clearError(): void {
    errorMessage.value = null
  }

  return {
    session,
    profile,
    access,
    initialized,
    loading,
    errorMessage,
    hasSession,
    isAuthenticated,
    userId,
    userEmail,
    displayName,
    ensureInitialized,
    signIn,
    signOut,
    handleExpired,
    clearError,
    refreshProfile: loadProfile,
  }
})
