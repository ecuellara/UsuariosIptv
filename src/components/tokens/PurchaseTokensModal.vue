<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import MoneyInput from '@/components/ui/MoneyInput.vue'
import { useToast } from '@/composables/useToast'
import { nowIso } from '@/lib/dates'
import { formatDecimal, formatMoney, formatTokens } from '@/lib/format'
import { toUserMessage } from '@/lib/errors'
import { queryKeys } from '@/lib/query-keys'
import { createIdempotencyKey, purchaseTokens } from '@/services/rpc'

/* Compra de tokens: sale de caja, entra inventario y recalcula el promedio
   ponderado en SQL. No es un gasto operativo (ADR-005). */

const open = defineModel<boolean>('open', { default: false })

const queryClient = useQueryClient()
const toast = useToast()

const amountPattern = /^\d+(\.\d{1,2})?$/

const schema = toTypedSchema(
  z.object({
    quantity: z
      .string()
      .trim()
      .regex(/^\d+$/, 'Ingresa un número entero de tokens.')
      .refine((value) => Number(value) > 0, 'La cantidad debe ser mayor a 0.'),
    totalCost: z
      .string()
      .trim()
      .regex(amountPattern, 'Ingresa un importe con hasta 2 decimales.')
      .refine((value) => Number(value) > 0, 'El costo total debe ser mayor a 0.'),
    purchasedAt: z.string().min(1, 'Elige la fecha de la compra.'),
    supplier: z.string().max(120, 'Máximo 120 caracteres.'),
    reference: z.string().max(120, 'Máximo 120 caracteres.'),
    notes: z.string().max(500, 'Máximo 500 caracteres.'),
  }),
)

interface PurchaseFormValues {
  quantity: string
  totalCost: string
  purchasedAt: string
  supplier: string
  reference: string
  notes: string
}

const { errors, values, resetForm, validate, defineField, setFieldValue } =
  useForm<PurchaseFormValues>({
    validationSchema: schema,
    initialValues: {
      quantity: '',
      totalCost: '',
      purchasedAt: '',
      supplier: '',
      reference: '',
      notes: '',
    },
  })

const [quantity] = defineField('quantity')
const [totalCost] = defineField('totalCost')
const [supplier] = defineField('supplier')
const [reference] = defineField('reference')
const [notes] = defineField('notes')

const purchasedAtModel = computed<string | null>({
  get: () => values.purchasedAt || null,
  set: (value) => setFieldValue('purchasedAt', value ?? ''),
})

const saving = ref(false)
const formError = ref<string | null>(null)
const idempotencyKey = ref('')

const unitCost = computed(() => {
  const qty = Number(values.quantity)
  const cost = Number(values.totalCost)
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost) || cost <= 0) {
    return null
  }
  return cost / qty
})

watch(open, (isOpen) => {
  if (!isOpen) return
  idempotencyKey.value = createIdempotencyKey()
  formError.value = null
  resetForm({ values: { ...values, quantity: '', totalCost: '', supplier: '', reference: '', notes: '', purchasedAt: nowIso() } })
})

async function save(): Promise<void> {
  formError.value = null
  if (saving.value) return
  const result = await validate()
  if (!result.valid) {
    await nextTick()
    /* Foco en el control inválido, no en el contenedor del MoneyInput. */
    document
      .querySelector<HTMLElement>(
        '[role="dialog"] input[aria-invalid="true"], ' +
          '[role="dialog"] textarea[aria-invalid="true"], ' +
          '[role="dialog"] select[aria-invalid="true"], ' +
          '[role="dialog"] button[aria-invalid="true"]',
      )
      ?.focus()
    return
  }

  saving.value = true
  try {
    await purchaseTokens({
      quantity: Number(values.quantity),
      totalCost: Number(values.totalCost),
      purchasedAt: values.purchasedAt,
      supplier: values.supplier.trim() ? values.supplier.trim() : null,
      reference: values.reference.trim() ? values.reference.trim() : null,
      notes: values.notes.trim() ? values.notes.trim() : null,
      idempotencyKey: idempotencyKey.value,
    })
    toast.success('Compra de tokens registrada', {
      description: `${formatTokens(Number(values.quantity))} · ${formatMoney(values.totalCost)}.`,
    })
    await queryClient.invalidateQueries({ queryKey: queryKeys.tokens.all })
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    open.value = false
  } catch (error) {
    formError.value = toUserMessage(error, 'No se pudo registrar la compra.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal
    v-model:open="open"
    title="Comprar tokens"
    description="Entran al inventario y salen de caja. No se registran como gasto del mes."
    width="md"
    :prevent-close="saving"
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="save">
      <AppAlert variant="info" title="Comprar tokens mueve caja; no es gasto del mes">
        El costo se reconoce cuando un token se consume en una renovación.
      </AppAlert>

      <div class="grid gap-4 sm:grid-cols-2">
        <AppInput
          v-model="quantity"
          label="Cantidad"
          inputmode="numeric"
          placeholder="10"
          :required="true"
          :error="errors.quantity ?? null"
          :disabled="saving"
        />
        <MoneyInput
          v-model="totalCost"
          label="Costo total"
          :required="true"
          :min="0.01"
          :error="errors.totalCost ?? null"
          :disabled="saving"
        />
      </div>

      <p v-if="unitCost !== null" class="text-sm text-content-muted">
        Costo unitario resultante:
        <strong class="tabular text-content">S/ {{ formatDecimal(unitCost, 3) }}</strong>
        <span class="text-xs">(cálculo de presentación; el definitivo lo guarda SQL).</span>
      </p>

      <AppDatePicker
        v-model="purchasedAtModel"
        label="Fecha de la compra"
        :required="true"
        :error="errors.purchasedAt ?? null"
        :disabled="saving"
      />

      <div class="grid gap-4 sm:grid-cols-2">
        <AppInput
          v-model="supplier"
          label="Proveedor"
          :maxlength="120"
          :disabled="saving"
        />
        <AppInput
          v-model="reference"
          label="Referencia"
          hint="Número de operación, opcional."
          :maxlength="120"
          :disabled="saving"
        />
      </div>

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
        Registrar compra
      </AppButton>
    </template>
  </AppModal>
</template>
