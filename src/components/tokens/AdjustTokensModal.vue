<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import { useToast } from '@/composables/useToast'
import { formatTokens } from '@/lib/format'
import { toUserMessage } from '@/lib/errors'
import { queryKeys } from '@/lib/query-keys'
import { adjustTokens, createIdempotencyKey } from '@/services/rpc'

/* Ajuste manual del inventario. Siempre exige motivo y nunca puede dejar el
   saldo bajo cero: la regla también se valida en el RPC con `FOR UPDATE`. */

const open = defineModel<boolean>('open', { default: false })

const props = withDefaults(
  defineProps<{ currentQuantity?: number | null }>(),
  { currentQuantity: null },
)

const queryClient = useQueryClient()
const toast = useToast()

const schema = toTypedSchema(
  z
    .object({
      delta: z
        .string()
        .trim()
        .regex(/^-?\d+$/, 'Ingresa un número entero (puede ser negativo).'),
      reason: z
        .string()
        .trim()
        .min(5, 'Escribe al menos 5 caracteres.'),
    })
    .superRefine((data, ctx) => {
      const delta = Number(data.delta)
      if (Number.isFinite(delta) && delta === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['delta'],
          message: 'El ajuste no puede ser 0.',
        })
      }
      if (
        Number.isFinite(delta) &&
        props.currentQuantity !== null &&
        props.currentQuantity + delta < 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['delta'],
          message: `El saldo no puede quedar negativo: hay ${props.currentQuantity}.`,
        })
      }
    }),
)

interface AdjustFormValues {
  delta: string
  reason: string
}

const { errors, values, resetForm, validate, defineField } =
  useForm<AdjustFormValues>({
    validationSchema: schema,
    initialValues: { delta: '', reason: '' },
  })

const [delta] = defineField('delta')
const [reason] = defineField('reason')

const saving = ref(false)
const formError = ref<string | null>(null)
const idempotencyKey = ref('')

const resultingQuantity = computed(() => {
  if (props.currentQuantity === null) return null
  const value = Number(values.delta)
  if (!Number.isFinite(value)) return null
  return props.currentQuantity + value
})

const negativeResult = computed(
  () => resultingQuantity.value !== null && resultingQuantity.value < 0,
)

watch(open, (isOpen) => {
  if (!isOpen) return
  idempotencyKey.value = createIdempotencyKey()
  formError.value = null
  resetForm({ values: { delta: '', reason: '' } })
})

async function save(): Promise<void> {
  formError.value = null
  if (saving.value || props.currentQuantity === null) return
  const result = await validate()
  if (!result.valid) {
    await nextTick()
    document.querySelector<HTMLElement>('[role="dialog"] [aria-invalid="true"]')?.focus()
    return
  }

  saving.value = true
  try {
    await adjustTokens(Number(values.delta), values.reason.trim(), idempotencyKey.value)
    toast.success('Ajuste registrado', {
      description: `Saldo resultante: ${formatTokens(resultingQuantity.value)}.`,
    })
    await queryClient.invalidateQueries({ queryKey: queryKeys.tokens.all })
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    open.value = false
  } catch (error) {
    formError.value = toUserMessage(error, 'No se pudo registrar el ajuste.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal
    v-model:open="open"
    title="Ajustar saldo de tokens"
    description="Corrección auditada por merma, error de carga o recuento."
    width="md"
    :prevent-close="saving"
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="save">
      <AppAlert variant="info" title="Un ajuste negativo no puede dejar el saldo bajo cero">
        El motivo es obligatorio y queda en la auditoría. Los movimientos no se editan ni se
        borran: se corrigen con otro ajuste.
      </AppAlert>

      <AppInput
        v-model="delta"
        label="Cambio en el saldo"
        inputmode="numeric"
        placeholder="-2 o 3"
        hint="Usa un número negativo para descontar."
        :required="true"
        :error="errors.delta ?? null"
        :disabled="saving"
      />

      <AppTextarea
        v-model="reason"
        label="Motivo"
        hint="Mínimo 5 caracteres. Ej. “conteo físico: faltaban 2”."
        :required="true"
        :maxlength="500"
        :rows="2"
        :error="errors.reason ?? null"
        :disabled="saving"
      />

      <p class="text-sm" aria-live="polite">
        <span class="text-content-muted">Saldo actual: </span>
        <span class="tabular text-content">{{ formatTokens(currentQuantity) }}</span>
        <span class="text-content-muted"> → </span>
        <span
          class="tabular"
          :class="negativeResult ? 'text-danger-text' : 'text-content'"
        >
          {{ formatTokens(resultingQuantity) }}
        </span>
      </p>

      <p v-if="currentQuantity === null" class="text-sm text-danger-text" role="alert">
        Necesitamos el saldo actual para operar.
      </p>

      <p v-if="formError" class="text-sm text-danger-text" role="alert">{{ formError }}</p>
    </form>

    <template #footer>
      <AppButton variant="secondary" :disabled="saving" @click="open = false">
        Cancelar
      </AppButton>
      <AppButton
        variant="primary"
        :loading="saving"
        :disabled="currentQuantity === null"
        @click="save"
      >
        Registrar ajuste
      </AppButton>
    </template>
  </AppModal>
</template>
