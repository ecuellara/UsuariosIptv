<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSkeleton from '@/components/ui/AppSkeleton.vue'
import { useToast } from '@/composables/useToast'
import { formatDate } from '@/lib/dates'
import { AppError, asErrorLike, isAppError, toUserMessage } from '@/lib/errors'
import {
  assessPassword,
  hasPasswordChangeErrors,
  isOtpComplete,
  mfaErrorMessage,
  normalizeOtpCode,
  PASSWORD_MIN_LENGTH,
  qrCodeDataUrl,
  validatePasswordChange,
  type PasswordChangeErrors,
} from '@/lib/mfa'
import {
  listTotpFactors,
  prepareTotpEnrollment,
  removeTotpFactor,
  verifyTotpCode,
  type TotpFactorSummary,
} from '@/services/mfa'
import { updatePassword, verifyCurrentPassword } from '@/services/security'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const toast = useToast()

/* --- Verificación en dos pasos -------------------------------------------- */

const loadingFactors = ref(true)
const factorsError = ref<string | null>(null)
const verifiedFactors = ref<TotpFactorSummary[]>([])

const starting = ref(false)
const confirmingEnrollment = ref(false)
const enrollmentError = ref<string | null>(null)
const enrollment = ref<{ factorId: string; secret: string; qrCode: string } | null>(null)
const enrollmentCode = ref('')
const enrollmentInput = ref<InstanceType<typeof AppInput> | null>(null)

const disableStep = ref<'idle' | 'confirm'>('idle')
const disabling = ref(false)
const disableError = ref<string | null>(null)
const disableCode = ref('')
const disableInput = ref<InstanceType<typeof AppInput> | null>(null)

const enrollmentQr = computed(() =>
  enrollment.value ? qrCodeDataUrl(enrollment.value.qrCode) : '',
)
const enrollmentCodeModel = computed({
  get: () => enrollmentCode.value,
  set: (value: string) => {
    enrollmentCode.value = normalizeOtpCode(value)
    enrollmentError.value = null
  },
})
const disableCodeModel = computed({
  get: () => disableCode.value,
  set: (value: string) => {
    disableCode.value = normalizeOtpCode(value)
    disableError.value = null
  },
})

async function loadFactors(): Promise<void> {
  loadingFactors.value = true
  factorsError.value = null
  try {
    const factors = await listTotpFactors()
    verifiedFactors.value = factors.verified
  } catch (error) {
    factorsError.value = toUserMessage(
      error,
      'No pudimos leer el estado de la verificación en dos pasos.',
    )
  } finally {
    loadingFactors.value = false
  }
}

async function startEnrollment(): Promise<void> {
  starting.value = true
  enrollmentError.value = null
  try {
    const result = await prepareTotpEnrollment()
    enrollment.value = result
    enrollmentCode.value = ''
    await nextTick()
    enrollmentInput.value?.focus()
  } catch (error) {
    enrollmentError.value = toUserMessage(
      error,
      'No pudimos iniciar la activación del segundo factor.',
    )
  } finally {
    starting.value = false
  }
}

async function confirmEnrollment(): Promise<void> {
  const current = enrollment.value
  if (!current) return
  if (!isOtpComplete(enrollmentCode.value)) {
    enrollmentError.value = 'Escribe los 6 dígitos que muestra tu aplicación.'
    enrollmentInput.value?.focus()
    return
  }

  confirmingEnrollment.value = true
  enrollmentError.value = null
  try {
    await verifyTotpCode(current.factorId, enrollmentCode.value)
    /* El secreto no se conserva después de verificar. */
    enrollment.value = null
    enrollmentCode.value = ''
    await loadFactors()
    await session.refreshAccess()
    toast.success('Verificación en dos pasos activada', {
      description: 'Desde ahora el panel pedirá el código al iniciar sesión.',
    })
  } catch (error) {
    enrollmentError.value = mfaErrorMessage(
      error,
      'No pudimos confirmar el código. Inténtalo de nuevo.',
    )
    enrollmentCode.value = ''
    await nextTick()
    enrollmentInput.value?.focus()
  } finally {
    confirmingEnrollment.value = false
  }
}

async function cancelEnrollment(): Promise<void> {
  const current = enrollment.value
  if (!current) return
  enrollmentError.value = null
  try {
    await removeTotpFactor(current.factorId)
    enrollment.value = null
    enrollmentCode.value = ''
    await loadFactors()
    toast.info('Activación cancelada', {
      description: 'No se guardó ningún segundo factor.',
    })
  } catch (error) {
    enrollmentError.value = mfaErrorMessage(
      error,
      'No pudimos cancelar la activación. Inténtalo de nuevo.',
    )
  }
}

async function copySecret(): Promise<void> {
  const secret = enrollment.value?.secret
  if (!secret) return
  try {
    await navigator.clipboard.writeText(secret)
    toast.success('Secreto copiado')
  } catch {
    toast.error('No se pudo copiar', {
      description: 'Selecciona el secreto y cópialo manualmente.',
    })
  }
}

function startDisable(): void {
  disableStep.value = 'confirm'
  disableCode.value = ''
  disableError.value = null
  void nextTick(() => disableInput.value?.focus())
}

function cancelDisable(): void {
  disableStep.value = 'idle'
  disableCode.value = ''
  disableError.value = null
}

async function confirmDisable(): Promise<void> {
  if (verifiedFactors.value.length === 0) return
  if (!isOtpComplete(disableCode.value)) {
    disableError.value = 'Escribe los 6 dígitos que genera tu aplicación.'
    disableInput.value?.focus()
    return
  }

  disabling.value = true
  disableError.value = null
  try {
    const factor = verifiedFactors.value[0]
    if (!factor) throw new AppError('No hay un segundo factor activo.', 'AUTH')
    /* Step-up: el código también se valida antes de eliminar el factor. */
    await verifyTotpCode(factor.id, disableCode.value)
    for (const item of verifiedFactors.value) {
      await removeTotpFactor(item.id)
    }
    await loadFactors()
    await session.refreshAccess()
    disableStep.value = 'idle'
    disableCode.value = ''
    toast.success('Verificación en dos pasos desactivada', {
      description: 'La cuenta vuelve a depender solo de la contraseña.',
    })
  } catch (error) {
    disableError.value = mfaErrorMessage(
      error,
      'No pudimos desactivar la verificación en dos pasos.',
    )
    disableCode.value = ''
    /* Si falló después de eliminar algún factor, la lista debe reflejarlo. */
    await loadFactors()
    await nextTick()
    disableInput.value?.focus()
  } finally {
    disabling.value = false
  }
}

onMounted(loadFactors)

/* Si se abandona la sección a medio enrolar, el factor queda `unverified` y
   no autoriza nada; se elimina para no acumular basura silenciosa. */
onBeforeUnmount(() => {
  const current = enrollment.value
  if (!current) return
  enrollment.value = null
  void removeTotpFactor(current.factorId).catch(() => {
    /* Sin UI a la vista: el siguiente enrolamiento limpia los abandonados. */
  })
})

/* --- Cambio de contraseña -------------------------------------------------- */

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordSaving = ref(false)
const passwordErrors = ref<PasswordChangeErrors>({})
const showCurrent = ref(false)
const showNew = ref(false)
const showConfirm = ref(false)
const currentInput = ref<InstanceType<typeof AppInput> | null>(null)
const newInput = ref<InstanceType<typeof AppInput> | null>(null)
const confirmInput = ref<InstanceType<typeof AppInput> | null>(null)

const assessment = computed(() => assessPassword(newPassword.value))
const meterLevel = computed(() => {
  if (assessment.value.score === 0) return 'empty'
  return assessment.value.score <= 2 ? 'low' : undefined
})

function clearPasswordErrors(): void {
  if (hasPasswordChangeErrors(passwordErrors.value)) {
    passwordErrors.value = {}
  }
}

async function submitPasswordChange(): Promise<void> {
  passwordErrors.value = validatePasswordChange({
    current: currentPassword.value,
    next: newPassword.value,
    confirm: confirmPassword.value,
  })
  if (hasPasswordChangeErrors(passwordErrors.value)) {
    if (passwordErrors.value.current) currentInput.value?.focus()
    else if (passwordErrors.value.next) newInput.value?.focus()
    else confirmInput.value?.focus()
    return
  }

  passwordSaving.value = true
  try {
    const email = session.userEmail
    if (!email) throw new AppError('No pudimos identificar tu cuenta.', 'AUTH')
    await verifyCurrentPassword(email, currentPassword.value)
    await updatePassword(newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    passwordErrors.value = {}
    await session.refreshAccess()
    toast.success('Contraseña actualizada', {
      description: 'La próxima vez inicia sesión con la contraseña nueva.',
    })
  } catch (error) {
    if (isAppError(error)) {
      passwordErrors.value = { current: error.message }
    } else {
      const detail = asErrorLike(error)
      if (detail?.code === 'same_password' || detail?.code === 'weak_password') {
        passwordErrors.value = { next: toUserMessage(error) }
      } else {
        passwordErrors.value = {
          form: toUserMessage(error, 'No pudimos cambiar la contraseña.'),
        }
      }
    }
  } finally {
    passwordSaving.value = false
  }
}
</script>

<template>
  <section id="seguridad" class="panel p-5" aria-labelledby="seguridad-titulo">
    <h2 id="seguridad-titulo" class="text-xl font-semibold text-content">Seguridad</h2>
    <p class="mt-1 text-sm text-content-muted">
      Segundo factor con una aplicación de autenticación (TOTP) y cambio de
      contraseña. El secreto TOTP se muestra solo durante la activación: no se
      guarda en el panel.
    </p>

    <div class="mt-6 flex flex-col gap-8">
      <!-- Verificación en dos pasos -->
      <div>
        <h3 class="text-lg font-semibold text-content">Verificación en dos pasos</h3>
        <p class="mt-1 text-sm text-content-muted">
          Además de la contraseña, el panel pedirá un código de 6 dígitos.
          Supabase Auth es quien valida el código; el panel no lo guarda.
        </p>

        <div v-if="loadingFactors" class="mt-4 flex flex-col gap-2" aria-busy="true">
          <AppSkeleton width="100%" height="40px" />
          <AppSkeleton width="60%" height="20px" />
        </div>

        <AppAlert
          v-else-if="factorsError"
          class="mt-4"
          variant="danger"
          title="No pudimos leer el estado de la verificación"
        >
          {{ factorsError }}
          <template #actions>
            <AppButton size="sm" variant="secondary" @click="loadFactors">
              Reintentar
            </AppButton>
          </template>
        </AppAlert>

        <!-- Enrolamiento en curso -->
        <div v-else-if="enrollment" class="mt-4 flex flex-col gap-4">
          <AppAlert variant="info" title="Escanea el código QR">
            Ábrelo con Google Authenticator, Authy, 1Password o una app TOTP
            similar. Si no puedes escanearlo, escribe el secreto manualmente.
          </AppAlert>

          <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
            <img
              :src="enrollmentQr"
              alt="Código QR para configurar la aplicación de autenticación"
              width="180"
              height="180"
              class="size-45 shrink-0 rounded-md border border-border"
            />
            <div class="flex min-w-0 flex-col gap-2">
              <span class="field-label">Secreto para configurar manualmente</span>
              <code
                class="block select-all break-all rounded-md border border-border bg-surface-sunken px-3 py-2 font-mono text-sm text-content"
              >{{ enrollment.secret }}</code>
              <div>
                <AppButton size="sm" variant="secondary" @click="copySecret">
                  <template #icon><AppIcon name="copy" :size="16" /></template>
                  Copiar secreto
                </AppButton>
              </div>
              <p class="text-xs text-content-muted">
                Guarda el secreto en un lugar seguro. No se volverá a mostrar
                después de confirmar el código.
              </p>
            </div>
          </div>

          <form class="flex flex-col gap-3" novalidate @submit.prevent="confirmEnrollment">
            <AppInput
              ref="enrollmentInput"
              v-model="enrollmentCodeModel"
              label="Código de 6 dígitos"
              inputmode="numeric"
              autocomplete="one-time-code"
              enterkeyhint="done"
              hint="El código que muestra tu aplicación ahora."
              :error="enrollmentError"
              :required="true"
              :disabled="confirmingEnrollment"
              autofocus
            />
            <div class="flex flex-wrap gap-2">
              <AppButton
                type="submit"
                variant="primary"
                :loading="confirmingEnrollment"
                :disabled="!isOtpComplete(enrollmentCode)"
              >
                Confirmar y activar
              </AppButton>
              <AppButton
                variant="secondary"
                type="button"
                :disabled="confirmingEnrollment"
                @click="cancelEnrollment"
              >
                Cancelar activación
              </AppButton>
            </div>
          </form>
        </div>

        <!-- Factor verificado -->
        <div v-else-if="verifiedFactors.length > 0" class="mt-4 flex flex-col gap-4">
          <AppAlert variant="success" title="Verificación en dos pasos activa">
            <ul class="flex flex-col gap-1">
              <li v-for="factor in verifiedFactors" :key="factor.id">
                {{ factor.friendlyName }} · desde el {{ formatDate(factor.createdAt) }}
              </li>
            </ul>
          </AppAlert>

          <div v-if="disableStep === 'confirm'" class="flex flex-col gap-3">
            <AppAlert variant="warning" title="Desactivar la verificación en dos pasos">
              Sin el segundo factor, la cuenta vuelve a depender solo de la
              contraseña. Escribe el código actual para confirmar.
            </AppAlert>
            <form class="flex max-w-md flex-col gap-3" novalidate @submit.prevent="confirmDisable">
              <AppInput
                ref="disableInput"
                v-model="disableCodeModel"
                label="Código actual de 6 dígitos"
                inputmode="numeric"
                autocomplete="one-time-code"
                enterkeyhint="done"
                hint="El código que genera tu aplicación ahora."
                :error="disableError"
                :required="true"
                :disabled="disabling"
                autofocus
              />
              <div class="flex flex-wrap gap-2">
                <AppButton
                  type="submit"
                  variant="danger"
                  :loading="disabling"
                  :disabled="!isOtpComplete(disableCode)"
                >
                  Desactivar 2FA
                </AppButton>
                <AppButton
                  variant="secondary"
                  type="button"
                  :disabled="disabling"
                  @click="cancelDisable"
                >
                  Cancelar
                </AppButton>
              </div>
            </form>
          </div>

          <div v-else>
            <AppButton variant="danger-ghost" @click="startDisable">
              Desactivar 2FA
            </AppButton>
          </div>
        </div>

        <!-- Sin factor -->
        <div v-else class="mt-4 flex flex-col gap-3">
          <AppAlert variant="warning" title="Sin segundo factor">
            Tu cuenta depende solo de la contraseña. Activa 2FA para que un
            inicio de sesión con contraseña no baste.
          </AppAlert>
          <p v-if="enrollmentError" class="text-sm text-danger-text" role="alert">
            {{ enrollmentError }}
          </p>
          <div>
            <AppButton variant="primary" :loading="starting" @click="startEnrollment">
              Activar 2FA
            </AppButton>
          </div>
        </div>
      </div>

      <!-- Cambio de contraseña -->
      <div class="border-t border-border pt-6">
        <h3 class="text-lg font-semibold text-content">Contraseña</h3>
        <p class="mt-1 text-sm text-content-muted">
          Mínimo {{ PASSWORD_MIN_LENGTH }} caracteres. Pedimos tu contraseña
          actual para confirmar el cambio; el segundo factor no se modifica.
        </p>

        <form class="mt-4 flex max-w-md flex-col gap-4" novalidate @submit.prevent="submitPasswordChange">
          <AppInput
            ref="currentInput"
            v-model="currentPassword"
            label="Contraseña actual"
            :type="showCurrent ? 'text' : 'password'"
            autocomplete="current-password"
            :suffix-icon="showCurrent ? 'eye-off' : 'eye'"
            :suffix-label="showCurrent ? 'Ocultar contraseña actual' : 'Mostrar contraseña actual'"
            :error="passwordErrors.current ?? null"
            :required="true"
            :disabled="passwordSaving"
            @suffix="showCurrent = !showCurrent"
            @update:model-value="clearPasswordErrors"
          />

          <div class="flex flex-col gap-2">
            <AppInput
              ref="newInput"
              v-model="newPassword"
              label="Contraseña nueva"
              :type="showNew ? 'text' : 'password'"
              autocomplete="new-password"
              :suffix-icon="showNew ? 'eye-off' : 'eye'"
              :suffix-label="showNew ? 'Ocultar contraseña nueva' : 'Mostrar contraseña nueva'"
              hint="Mínimo 12 caracteres. Una frase larga y única es más segura."
              :error="passwordErrors.next ?? null"
              :required="true"
              :disabled="passwordSaving"
              @suffix="showNew = !showNew"
              @update:model-value="clearPasswordErrors"
            />

            <div v-if="newPassword.length > 0" class="flex flex-col gap-1">
              <div class="meter" :data-level="meterLevel" aria-hidden="true">
                <span :style="{ width: `${assessment.percent}%` }" />
              </div>
              <p class="text-xs text-content-muted" role="status" aria-live="polite">
                Fortaleza: <span class="text-content">{{ assessment.label }}</span>
                <span v-if="!assessment.meetsMinimum">
                  · faltan {{ PASSWORD_MIN_LENGTH - assessment.length }} caracteres
                </span>
              </p>
            </div>
          </div>

          <AppInput
            ref="confirmInput"
            v-model="confirmPassword"
            label="Repite la contraseña nueva"
            :type="showConfirm ? 'text' : 'password'"
            autocomplete="new-password"
            :suffix-icon="showConfirm ? 'eye-off' : 'eye'"
            :suffix-label="showConfirm ? 'Ocultar confirmación' : 'Mostrar confirmación'"
            :error="passwordErrors.confirm ?? null"
            :required="true"
            :disabled="passwordSaving"
            @suffix="showConfirm = !showConfirm"
            @update:model-value="clearPasswordErrors"
          />

          <p v-if="passwordErrors.form" class="text-sm text-danger-text" role="alert">
            {{ passwordErrors.form }}
          </p>

          <div>
            <AppButton type="submit" variant="primary" :loading="passwordSaving">
              Cambiar contraseña
            </AppButton>
          </div>
        </form>

        <p class="mt-3 text-xs text-content-muted">
          Si la contraseña se creó como temporal, este es el lugar para
          reemplazarla. El cambio no cierra las sesiones ya abiertas.
        </p>
      </div>
    </div>
  </section>
</template>
