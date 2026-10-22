<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import AppButton from '@/components/ui/AppButton.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import MoneyInput from '@/components/ui/MoneyInput.vue'
import { useToast } from '@/composables/useToast'
import { formatDateTime, nowIso } from '@/lib/dates'
import { decimalString, formatMoney } from '@/lib/format'
import { toUserMessage } from '@/lib/errors'
import { queryKeys } from '@/lib/query-keys'
import { createIdempotencyKey, recordPayment } from '@/services/rpc'
import {
  PAYMENT_METHODS,
  type PaymentMethod,
  type RenewalSummary,
} from '@/types/domain'

/* Cobro posterior de una renovación que quedó pendiente. La RPC vuelve a
   validar contra `amount_agreed` con lock; aquí solo se limita al pendiente
   que ya calculó SQL. */

const open = defineModel<boolean>('open', { default: false })

const props = withDefaults(
  defineProps<{ renewal?: RenewalSummary | null }>(),
  { renewal: null },
)

const emit = defineEmits<{ saved: [] }>()

const queryClient = useQueryClient()
const toast = useToast()

const amountPattern = /^\d+(\.\d{1,2})?$/

const schema = toTypedSchema(
  z
    .object({
      amount: z
        .string()
        .trim()
        .regex(amountPattern, 'Ingresa un importe con hasta 2 decimales.')
        .refine((value) => Number(value) > 0, 'Ingresa un importe mayor a 0.'),
      method: z.enum(['YAPE', 'PLIN', 'TRANSFERENCIA', 'EFECTIVO', 'OTRO']),
      paidAt: z.string().min(1, 'Elige la fecha del cobro.'),
      reference: z.string().max(120, 'Máximo 120 caracteres.'),
      notes: z.string().max(500, 'Máximo 500 caracteres.'),
    })
    .superRefine((data, ctx) => {
      const pending = props.renewal?.amountPending
      if (pending !== undefined && Number(data.amount) > pending) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['amount'],
          message: `El cobro no puede superar el pendiente (${formatMoney(pending)}).`,
        })
      }
    }),
)

interface PaymentFormValues {
  amount: string
  method: PaymentMethod
  paidAt: string
  reference: string
  notes: string
}

const { errors, values, resetForm, validate, defineField, setFieldValue } =
  useForm<PaymentFormValues>({
    validationSchema: schema,
    initialValues: {
      amount: '',
      method: 'YAPE',
      paidAt: '',
      reference: '',
      notes: '',
    },
  })

const [amount] = defineField('amount')
const [reference] = defineField('reference')
const [notes] = defineField('notes')

const methodModel = computed<string | null>({
  get: () => values.method,
  set: (value) => {
    if (value && (PAYMENT_METHODS as readonly string[]).includes(value)) {
      setFieldValue('method', value as PaymentMethod)
    }
  },
})

const paidAtModel = computed<string | null>({
  get: () => values.paidAt || null,
  set: (value) => setFieldValue('paidAt', value ?? ''),
})

const saving = ref(false)
const formError = ref<string | null>(null)
const idempotencyKey = ref('')

const methodOptions = PAYMENT_METHODS.map((method) => ({
  value: method,
  label:
    method === 'YAPE'
      ? 'Yape'
      : method === 'PLIN'
        ? 'Plin'
        : method === 'TRANSFERENCIA'
          ? 'Transferencia'
          : method === 'EFECTIVO'
            ? 'Efectivo'
            : 'Otro',
}))

watch(open, (isOpen) => {
  if (!isOpen) return
  idempotencyKey.value = createIdempotencyKey()
  formError.value = null
  resetForm({
    values: {
      amount: decimalString(props.renewal?.amountPending ?? 0),
      method: 'YAPE',
      paidAt: nowIso(),
      reference: '',
      notes: '',
    },
  })
})

async function save(): Promise<void> {
  formError.value = null
  if (saving.value || !props.renewal) return
  const result = await validate()
  if (!result.valid) {
    await nextTick()
    document.querySelector<HTMLElement>('[role="dialog"] [aria-invalid="true"]')?.focus()
    return
  }

  saving.value = true
  try {
    await recordPayment({
      renewalId: props.renewal.id,
      amount: Number(values.amount),
      method: values.method,
      paidAt: values.paidAt,
      reference: values.reference.trim() ? values.reference.trim() : null,
      notes: values.notes.trim() ? values.notes.trim() : null,
      idempotencyKey: idempotencyKey.value,
    })
    toast.success('Cobro registrado', {
      description: `${formatMoney(values.amount)} en la renovación del ${formatDateTime(
        props.renewal.effectiveAt,
      )}.`,
    })
    await queryClient.invalidateQueries({ queryKey: queryKeys.renewals.all })
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    open.value = false
    emit('saved')
  } catch (error) {
    formError.value = toUserMessage(error, 'No se pudo registrar el cobro.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal
    v-model:open="open"
    title="Registrar cobro"
    :description="
      renewal
        ? `Renovación del ${formatDateTime(renewal.effectiveAt)} · pendiente ${formatMoney(renewal.amountPending)}`
        : undefined
    "
    width="md"
    :prevent-close="saving"
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="save">
      <div class="grid gap-4 sm:grid-cols-2">
        <MoneyInput
          v-model="amount"
          label="Importe cobrado"
          :required="true"
          :min="0.01"
          :hint="
            renewal
              ? `Pendiente: ${formatMoney(renewal.amountPending)}. No puede superarlo.`
              : undefined
          "
          :error="errors.amount ?? null"
          :disabled="saving"
        />
        <AppSelect
          v-model="methodModel"
          :options="methodOptions"
          label="Método"
          :required="true"
          :disabled="saving"
        />
      </div>

      <AppDatePicker
        v-model="paidAtModel"
        label="Fecha del cobro"
        :required="true"
        :error="errors.paidAt ?? null"
        :disabled="saving"
      />

      <AppInput
        v-model="reference"
        label="Referencia"
        hint="Número de operación, opcional."
        :maxlength="120"
        :disabled="saving"
      />

      <AppTextarea
        v-model="notes"
        label="Notas"
        :maxlength="500"
        :rows="2"
        :disabled="saving"
        :error="errors.notes ?? null"
      />

      <p v-if="formError" class="text-sm text-danger-text" role="alert">{{ formError }}</p>
    </form>

    <template #footer>
      <AppButton variant="secondary" :disabled="saving" @click="open = false">
        Cancelar
      </AppButton>
      <AppButton variant="primary" :loading="saving" @click="save">
        Registrar cobro
      </AppButton>
    </template>
  </AppModal>
</template>
