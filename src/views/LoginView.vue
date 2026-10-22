<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import { useSessionStore } from '@/stores/session'
import { isSupabaseConfigured } from '@/lib/supabase'
import { toUserMessage } from '@/lib/errors'
import { isOtpComplete, mfaErrorMessage, normalizeOtpCode } from '@/lib/mfa'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const fieldError = ref<string | null>(null)
const submitting = ref(false)

const challengeCode = ref('')
const challengeError = ref<string | null>(null)
const verifying = ref(false)
const challengeInput = ref<InstanceType<typeof AppInput> | null>(null)

const expired = computed(
  () => route.query.expired === '1' || session.expiredNotice,
)
const canSubmit = computed(
  () => email.value.trim().length > 0 && password.value.length > 0 && !submitting.value,
)
const noAccess = computed(
  () => session.hasSession && session.access === 'denied' && !session.mfaPending,
)
const mfaPending = computed(() => session.mfaPending)
const canVerify = computed(
  () => isOtpComplete(challengeCode.value) && !verifying.value,
)

const challengeCodeModel = computed({
  get: () => challengeCode.value,
  set: (value: string) => {
    challengeCode.value = normalizeOtpCode(value)
    challengeError.value = null
  },
})

const redirectTarget = computed(() => {
  const value = route.query.redirect
  return typeof value === 'string' && value.startsWith('/') ? value : '/'
})

async function focusChallenge(): Promise<void> {
  await nextTick()
  challengeInput.value?.focus()
}

watch(mfaPending, (pending) => {
  if (!pending) return
  challengeCode.value = ''
  challengeError.value = null
  void focusChallenge()
}, { immediate: true })

async function submit(): Promise<void> {
  fieldError.value = null
  session.clearError()

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    fieldError.value = 'Escribe un correo válido.'
    return
  }
  if (password.value.length < 6) {
    fieldError.value = 'La contraseña debe tener al menos 6 caracteres.'
    return
  }

  submitting.value = true
  try {
    await session.signIn(email.value.trim(), password.value)
    if (session.mfaPending) {
      password.value = ''
      await focusChallenge()
      return
    }
    if (session.access === 'granted') {
      await router.replace(redirectTarget.value)
    }
  } catch (error) {
    fieldError.value = toUserMessage(
      error,
      'No pudimos iniciar sesión. Revisa tu correo y contraseña.',
    )
  } finally {
    submitting.value = false
  }
}

async function verifyChallenge(): Promise<void> {
  challengeError.value = null
  if (!isOtpComplete(challengeCode.value)) {
    challengeError.value = 'Escribe los 6 dígitos del código.'
    await focusChallenge()
    return
  }

  verifying.value = true
  try {
    await session.verifyMfa(challengeCode.value)
    if (session.access === 'granted') {
      await router.replace(redirectTarget.value)
    }
  } catch (error) {
    challengeError.value = mfaErrorMessage(
      error,
      'No pudimos verificar el código. Inténtalo de nuevo.',
    )
    challengeCode.value = ''
    await focusChallenge()
  } finally {
    verifying.value = false
  }
}

async function leave(): Promise<void> {
  await session.signOut()
  password.value = ''
  challengeCode.value = ''
  challengeError.value = null
}
</script>

<template>
  <div class="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
    <div class="mb-10 flex flex-col items-center gap-1">
      <p class="text-xl font-semibold tracking-tight text-content">IPTV Manager</p>
      <p class="text-sm text-content-muted">Panel administrativo privado</p>
    </div>

    <div class="w-full max-w-(--layout-login-w) rounded-lg border border-border bg-surface p-5 shadow-sm sm:p-8">
      <!-- Desafío TOTP: hay factores verificados y la sesión es aal1. -->
      <template v-if="mfaPending">
        <h1 class="text-2xl font-semibold text-content">Verificación en dos pasos</h1>
        <p class="mt-2 text-base text-content-muted">
          Abre tu aplicación de autenticación y escribe el código de 6 dígitos
          para completar el inicio de sesión.
        </p>
        <p class="mt-1 text-sm text-content-muted">
          Cuenta: <span class="text-content">{{ session.userEmail }}</span>
        </p>

        <form class="mt-6 flex flex-col gap-4" novalidate @submit.prevent="verifyChallenge">
          <AppInput
            ref="challengeInput"
            v-model="challengeCodeModel"
            label="Código de verificación"
            inputmode="numeric"
            autocomplete="one-time-code"
            enterkeyhint="done"
            hint="6 dígitos. Se aceptan espacios al pegar."
            :error="challengeError"
            :required="true"
            :disabled="verifying"
            autofocus
          />

          <AppButton
            type="submit"
            variant="primary"
            size="lg"
            block
            :loading="verifying"
            :disabled="!canVerify"
          >
            Verificar código
          </AppButton>

          <AppButton
            variant="secondary"
            block
            type="button"
            :disabled="verifying"
            @click="leave"
          >
            Usar otra cuenta
          </AppButton>
        </form>

        <p class="mt-4 text-xs leading-4 text-content-muted">
          Sin el código no se puede acceder al panel. Si perdiste tu aplicación
          de autenticación, necesitas recuperar la cuenta con el procedimiento
          de Supabase.
        </p>
      </template>

      <template v-else-if="noAccess">
        <h1 class="text-2xl font-semibold text-content">Sin acceso</h1>
        <p class="mt-2 text-base text-content-muted">
          Tu cuenta existe, pero no tiene acceso a este panel. Contacta al administrador.
        </p>
        <AppButton class="mt-6" variant="secondary" block @click="leave">
          Cerrar sesión
        </AppButton>
      </template>

      <template v-else>
        <h1 class="text-2xl font-semibold text-content">Iniciar sesión</h1>

        <div v-if="!isSupabaseConfigured" class="mt-4">
          <AppAlert
            variant="warning"
            title="Falta la configuración de Supabase"
          >
            Revisa <code class="font-mono text-xs">VITE_SUPABASE_URL</code> y
            <code class="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code> en
            <code class="font-mono text-xs">.env.development.local</code>.
          </AppAlert>
        </div>

        <div v-if="expired" class="mt-4">
          <AppAlert variant="info" title="Tu sesión expiró">
            Vuelve a iniciar sesión para continuar.
          </AppAlert>
        </div>

        <div v-if="session.errorMessage || fieldError" class="mt-4">
          <AppAlert variant="danger" title="No pudimos iniciar sesión">
            {{ session.errorMessage ?? fieldError }}
          </AppAlert>
        </div>

        <form class="mt-6 flex flex-col gap-4" novalidate @submit.prevent="submit">
          <AppInput
            v-model="email"
            label="Correo"
            type="email"
            autocomplete="username"
            inputmode="email"
            placeholder="tu@correo.com"
            :required="true"
            :disabled="submitting"
            :error="fieldError && !email ? fieldError : null"
            autofocus
          />

          <AppInput
            v-model="password"
            label="Contraseña"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
            placeholder="••••••••"
            :required="true"
            :disabled="submitting"
            :suffix-icon="showPassword ? 'eye-off' : 'eye'"
            :suffix-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
            @suffix="showPassword = !showPassword"
          />

          <AppButton
            type="submit"
            variant="primary"
            size="lg"
            block
            :loading="submitting"
            :disabled="!canSubmit"
          >
            Entrar
          </AppButton>
        </form>

        <p class="mt-4 text-xs leading-4 text-content-muted">
          Acceso restringido. Si olvidaste tu contraseña, usa el procedimiento de
          recuperación documentado.
        </p>
      </template>
    </div>

    <p class="mt-8 text-xs text-content-muted">
      Los datos se guardan en tu proyecto de Supabase. No se almacenan contraseñas de IPTV.
    </p>
  </div>
</template>
