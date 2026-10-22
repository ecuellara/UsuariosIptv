import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Session } from '@supabase/supabase-js'
import { AUTH_STORAGE_KEY, supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/query-client'
import { AppError, isAuthError, toUserMessage } from '@/lib/errors'
import {
  mfaErrorMessage,
  normalizeOtpCode,
  requiresMfaChallenge,
  type AalLevel,
} from '@/lib/mfa'
import { getProfile } from '@/services/profile'
import { getAssuranceLevel, verifiedTotpFactorIds, verifyTotpCode } from '@/services/mfa'
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
  /** `true` solo cuando la sesión se perdió de verdad (JWT rechazado). */
  const expiredNotice = ref(false)
  /** Fallo de transporte al leer `profiles`: la sesión sigue viva. */
  const accessCheckFailed = ref(false)
  /** Hay factores verificados y la sesión es aal1: falta el código TOTP. */
  const mfaPending = ref(false)
  /** Nivel de garantía de la sesión actual, leído de Auth. */
  const aal = ref<AalLevel | null>(null)

  let initPromise: Promise<void> | null = null
  let resolvePromise: Promise<void> | null = null

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

  /* Supabase guarda la sesión en localStorage (`AUTH_STORAGE_KEY`). Sirve
     para distinguir "nunca hubo sesión" de "había una y ya no se pudo
     refrescar": en el segundo caso el JWT expiró y hay que avisarlo. */
  function hadStoredSession(): boolean {
    try {
      return window.localStorage.getItem(AUTH_STORAGE_KEY) !== null
    } catch {
      return false
    }
  }

  async function loadProfile(): Promise<Profile | null> {
    const currentUserId = session.value?.user.id
    if (!currentUserId) return null
    try {
      const found = await getProfile(currentUserId)
      /* La sesión pudo cambiar mientras la lectura estaba en vuelo. */
      if (session.value?.user.id !== currentUserId) return null

      if (!found) {
        /* Antes de declarar "sin acceso", comprueba si el 0 filas viene de
           una sesión aal1 con segundo factor pendiente. La RLS de `profiles`
           puede devolver vacío en ese caso y NO es un problema de permisos. */
        const levels = await getAssuranceLevel().catch(() => null)
        if (session.value?.user.id !== currentUserId) return null
        if (
          levels &&
          requiresMfaChallenge(levels.currentLevel, levels.nextLevel)
        ) {
          mfaPending.value = true
          aal.value = levels.currentLevel
          profile.value = null
          access.value = 'unknown'
          accessCheckFailed.value = false
          errorMessage.value = null
          return null
        }
      }

      profile.value = found
      access.value = found ? 'granted' : 'denied'
      accessCheckFailed.value = false
      return found
    } catch (error) {
      if (session.value?.user.id !== currentUserId) return null
      if (isAuthError(error)) {
        // El token ya no vale: la sesión no se conserva.
        session.value = null
        profile.value = null
        access.value = 'denied'
        accessCheckFailed.value = false
        mfaPending.value = false
        aal.value = null
        expiredNotice.value = true
      } else {
        /* Error de red / 5xx: la fila de `profiles` no se pudo comprobar.
           No es "sin acceso" y la sesión se conserva para reintentar. El flag
           no se limpia al iniciar otra comprobación: así la pantalla de
           reintento no parpadea mientras hay consultas en vuelo. */
        access.value = 'unknown'
        accessCheckFailed.value = true
        errorMessage.value = toUserMessage(
          error,
          'No pudimos verificar tu acceso al panel.',
        )
      }
      return null
    }
  }

  function resetMfaState(): void {
    mfaPending.value = false
    aal.value = null
  }

  /**
   * Decide si la sesión puede leer datos (aal2 o sin factores) o si debe
   * pasar por el desafío TOTP. Es la única puerta: se llama al arrancar, al
   * iniciar sesión, al volver a comprobar el acceso y al verificar el código.
   */
  async function doResolveAccess(): Promise<void> {
    const currentSession = session.value
    if (!currentSession) {
      resetMfaState()
      profile.value = null
      access.value = 'denied'
      return
    }
    const currentUserId = currentSession.user.id

    try {
      const { currentLevel, nextLevel } = await getAssuranceLevel()
      /* Un refresh de token puede reemplazar el objeto de sesión del mismo
         usuario; solo se abandona si la sesión desapareció o cambió de dueño. */
      if (session.value?.user.id !== currentUserId) return

      aal.value = currentLevel
      if (requiresMfaChallenge(currentLevel, nextLevel)) {
        mfaPending.value = true
        profile.value = null
        access.value = 'unknown'
        accessCheckFailed.value = false
        errorMessage.value = null
        return
      }

      mfaPending.value = false
      await loadProfile()
    } catch (error) {
      if (session.value?.user.id !== currentUserId) return
      if (isAuthError(error)) {
        session.value = null
        profile.value = null
        access.value = 'denied'
        accessCheckFailed.value = false
        expiredNotice.value = true
        resetMfaState()
        queryClient.clear()
        void supabase.auth.signOut({ scope: 'local' })
        return
      }
      access.value = 'unknown'
      accessCheckFailed.value = true
      errorMessage.value = toUserMessage(
        error,
        'No pudimos verificar tu acceso al panel.',
      )
    }
  }

  function resolveAccess(): Promise<void> {
    if (!resolvePromise) {
      resolvePromise = doResolveAccess().finally(() => {
        resolvePromise = null
      })
    }
    return resolvePromise
  }

  /** Reintenta la comprobación de acceso sin cerrar la sesión. */
  async function retryAccess(): Promise<void> {
    if (!session.value) return
    loading.value = true
    errorMessage.value = null
    try {
      await resolveAccess()
      if (access.value === 'granted') expiredNotice.value = false
    } finally {
      loading.value = false
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
        resetMfaState()
        return
      }
      if (event === 'TOKEN_REFRESHED') return
      /* En `MFA_CHALLENGE_VERIFIED` el nivel ya subió a aal2 y el perfil lo
         carga `verifyMfa` de forma explícita. */
      if (event === 'MFA_CHALLENGE_VERIFIED') return
      if (
        event === 'INITIAL_SESSION' ||
        event === 'SIGNED_IN' ||
        event === 'USER_UPDATED'
      ) {
        setTimeout(() => {
          void resolveAccess()
        }, 0)
      }
    })
  }

  async function initialize(): Promise<void> {
    loading.value = true
    const stored = hadStoredSession()
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      session.value = data.session
      if (data.session) {
        await resolveAccess()
      } else {
        access.value = 'denied'
        resetMfaState()
        /* Había una sesión guardada y ya no se puede refrescar: expiró. */
        if (stored) expiredNotice.value = true
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
    expiredNotice.value = false
    accessCheckFailed.value = false
    resetMfaState()
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
      await resolveAccess()
      /* Con segundo factor pendiente la app no navega: LoginView pinta el
         desafío y `access` queda en 'unknown' a propósito. */
      if (access.value === 'denied' && !mfaPending.value) {
        errorMessage.value = null
      }
    } finally {
      loading.value = false
    }
  }

  /**
   * Completa el desafío TOTP de la sesión actual. Al verificar, supabase-js
   * guarda el JWT aal2; después se relee la sesión y el perfil.
   */
  async function verifyMfa(code: string): Promise<void> {
    loading.value = true
    errorMessage.value = null
    try {
      const factorIds = await verifiedTotpFactorIds()
      const factorId = factorIds[0]
      if (!factorId) {
        throw new AppError(
          'No hay un segundo factor activo en esta cuenta.',
          'AUTH',
        )
      }

      await verifyTotpCode(factorId, normalizeOtpCode(code))

      const { data } = await supabase.auth.getSession()
      if (data.session) session.value = data.session
      mfaPending.value = false
      aal.value = 'aal2'
      await loadProfile()
    } catch (error) {
      const message = mfaErrorMessage(error)
      errorMessage.value = message
      throw new AppError(message, 'AUTH', error)
    } finally {
      loading.value = false
    }
  }

  /** Cierre voluntario: no es una expiración, así que no se avisa como tal. */
  async function signOut(): Promise<void> {
    try {
      await supabase.auth.signOut()
    } finally {
      session.value = null
      profile.value = null
      access.value = 'denied'
      errorMessage.value = null
      expiredNotice.value = false
      accessCheckFailed.value = false
      resetMfaState()
      queryClient.clear()
    }
  }

  /** Sesión expirada detectada por un 401 de PostgREST. */
  function handleExpired(): void {
    if (!session.value) return
    session.value = null
    profile.value = null
    access.value = 'denied'
    errorMessage.value = null
    expiredNotice.value = true
    accessCheckFailed.value = false
    resetMfaState()
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
    expiredNotice,
    accessCheckFailed,
    mfaPending,
    aal,
    hasSession,
    isAuthenticated,
    userId,
    userEmail,
    displayName,
    ensureInitialized,
    signIn,
    verifyMfa,
    signOut,
    handleExpired,
    retryAccess,
    refreshAccess: resolveAccess,
    clearError,
    refreshProfile: loadProfile,
  }
})
