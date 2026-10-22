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
import { nowIso } from '@/lib/dates'
import { toUserMessage } from '@/lib/errors'
import { expenseCategoryLabel } from '@/lib/finance'
import { decimalString, formatMoney } from '@/lib/format'
import { queryKeys } from '@/lib/query-keys'
import { createExpense, updateExpense } from '@/services/finance'
import {
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
} from '@/types/domain'

/* Alta y edición de gastos operativos. `expenses` admite escritura directa
   (política de admin + trigger de auditoría). No existe categoría de tokens:
   comprar tokens mueve caja e inventario, no gasto del mes (ADR-005). */

const open = defineModel<boolean>('open', { default: false })

const props = withDefaults(
  defineProps<{
    expense?: Expense | null
    /** Fecha por defecto al crear (ISO). En Finanzas se pasa el mes elegido. */
    defaultSpentAt?: string | null
  }>(),
  { expense: null, defaultSpentAt: null },
)

const emit = defineEmits<{ saved: [] }>()

const queryClient = useQueryClient()
const toast = useToast()

const amountPattern = /^\d+(\.\d{1,2})?$/

const schema = toTypedSchema(
  z.object({
    category: z.enum(['OPERATIVO', 'PUBLICIDAD', 'HERRAMIENTAS', 'OTRO']),
    amount: z
      .string()
      .trim()
      .regex(amountPattern, 'Ingresa un importe con hasta 2 decimales.')
      .refine((value) => Number(value) > 0, 'Ingresa un importe mayor a 0.'),
    spentAt: z.string().min(1, 'Elige la fecha del gasto.'),
    description: z
      .string()
      .trim()
      .min(1, 'Escribe una descripción.')
      .max(200, 'Máximo 200 caracteres.'),
    reference: z.string().max(120, 'Máximo 120 caracteres.'),
  }),
)

interface ExpenseFormValues {
  category: ExpenseCategory
  amount: string
  spentAt: string
  description: string
  reference: string
}

const { errors, values, resetForm, validate, defineField, setFieldValue } =
  useForm<ExpenseFormValues>({
    validationSchema: schema,
    initialValues: {
      category: 'OPERATIVO',
      amount: '',
      spentAt: '',
      description: '',
      reference: '',
    },
  })

const [amount] = defineField('amount')
const [description] = defineField('description')
const [reference] = defineField('reference')

const categoryModel = computed<string | null>({
  get: () => values.category,
  set: (value) => {
    if (value && (EXPENSE_CATEGORIES as readonly string[]).includes(value)) {
      setFieldValue('category', value as ExpenseCategory)
    }
  },
})

const spentAtModel = computed<string | null>({
  get: () => values.spentAt || null,
  set: (value) => setFieldValue('spentAt', value ?? ''),
})

const categoryOptions = EXPENSE_CATEGORIES.map((category) => ({
  value: category,
  label: expenseCategoryLabel(category),
}))

const isEdit = computed(() => Boolean(props.expense))
const saving = ref(false)
const formError = ref<string | null>(null)

watch(open, (isOpen) => {
  if (!isOpen) return
  formError.value = null
  resetForm({
    values: {
      category: props.expense?.category ?? 'OPERATIVO',
      amount: props.expense ? decimalString(props.expense.amount) : '',
      spentAt: props.expense?.spentAt ?? props.defaultSpentAt ?? nowIso(),
      description: props.expense?.description ?? '',
      reference: props.expense?.reference ?? '',
    },
  })
})

async function save(): Promise<void> {
  formError.value = null
  if (saving.value) return
  const result = await validate()
  if (!result.valid) {
    await nextTick()
    document
      .querySelector<HTMLElement>('[role="dialog"] [aria-invalid="true"]')
      ?.focus()
    return
  }

  saving.value = true
  try {
    const payload = {
      category: values.category,
      amount: Number(values.amount),
      spentAt: values.spentAt,
      description: values.description.trim(),
      reference: values.reference.trim() ? values.reference.trim() : null,
    }
    if (props.expense) {
      await updateExpense(props.expense.id, payload)
      toast.success('Gasto actualizado', {
        description: `${payload.description} · ${formatMoney(payload.amount)}. Queda auditado.`,
      })
    } else {
      await createExpense(payload)
      toast.success('Gasto registrado', {
        description: `${payload.description} · ${formatMoney(payload.amount)}.`,
      })
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.finance.all })
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    open.value = false
    emit('saved')
  } catch (error) {
    formError.value = toUserMessage(error, 'No se pudo guardar el gasto.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal
    v-model:open="open"
    :title="isEdit ? 'Editar gasto' : 'Registrar gasto'"
    description="Gasto operativo del mes. Comprar tokens no se registra aquí."
    :prevent-close="saving"
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="save">
      <div class="grid gap-4 sm:grid-cols-2">
        <MoneyInput
          v-model="amount"
          label="Importe"
          :required="true"
          :min="0.01"
          :error="errors.amount ?? null"
          :disabled="saving"
        />
        <AppSelect
          v-model="categoryModel"
          :options="categoryOptions"
          label="Categoría"
          :required="true"
          :disabled="saving"
        />
      </div>

      <AppDatePicker
        v-model="spentAtModel"
        label="Fecha del gasto"
        :required="true"
        :error="errors.spentAt ?? null"
        :disabled="saving"
      />

      <AppInput
        v-model="description"
        label="Descripción"
        hint="Qué se pagó: hosting, publicidad, herramienta…"
        :required="true"
        :maxlength="200"
        :error="errors.description ?? null"
        :disabled="saving"
      />

      <AppTextarea
        v-model="reference"
        label="Referencia"
        hint="Opcional. Número de operación o comprobante."
        :maxlength="120"
        :rows="2"
        :error="errors.reference ?? null"
        :disabled="saving"
      />

      <p v-if="formError" class="text-sm text-danger-text" role="alert">{{ formError }}</p>
    </form>

    <template #footer>
      <AppButton variant="secondary" :disabled="saving" @click="open = false">
        Cancelar
      </AppButton>
      <AppButton variant="primary" :loading="saving" @click="save">
        {{ isEdit ? 'Guardar cambios' : 'Registrar gasto' }}
      </AppButton>
    </template>
  </AppModal>
</template>
