<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import AppButton from '@/components/ui/AppButton.vue'
import AppCombobox from '@/components/ui/AppCombobox.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSheet from '@/components/ui/AppSheet.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import { queryKeys } from '@/lib/query-keys'
import { toUserMessage } from '@/lib/errors'
import { nowIso } from '@/lib/dates'
import { formatDateTime, formatPhone } from '@/lib/format'
import { useDebouncedRef } from '@/composables/useDebouncedRef'
import { useToast } from '@/composables/useToast'
import { createAccount, updateAccount } from '@/services/accounts'
import { searchCustomerOptions } from '@/services/customers'
import { useSessionStore } from '@/stores/session'
import type { Account } from '@/types/domain'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  account?: Account | null
  customerId?: string | null
  customerName?: string | null
}>()

const emit = defineEmits<{ saved: [id: string] }>()

const queryClient = useQueryClient()
const session = useSessionStore()
const toast = useToast()

const isEdit = computed(() => Boolean(props.account))
const saving = ref(false)
const formError = ref<string | null>(null)

/* Mismo patrón que CustomerFormModal: vee-validate + zod, mensajes en español
   y errores por campo. La regla de fecha solo aplica al alta, igual que antes. */
const baseSchema = z.object({
  customerId: z.string().min(1, 'Elige el cliente.'),
  externalUsername: z
    .string()
    .trim()
    .min(1, 'Escribe el usuario del panel del proveedor.')
    .max(64, 'Máximo 64 caracteres.'),
  reference: z.string().max(120, 'Máximo 120 caracteres.'),
  purchasedAt: z.string().min(1, 'Elige la fecha de compra.'),
  expiresAt: z.string(),
  notes: z.string().max(500, 'Máximo 500 caracteres.'),
})

const schema = computed(() =>
  toTypedSchema(
    isEdit.value
      ? baseSchema
      : baseSchema.superRefine((data, ctx) => {
          if (!data.expiresAt) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['expiresAt'],
              message: 'Elige el vencimiento.',
            })
          } else if (data.purchasedAt && data.expiresAt <= data.purchasedAt) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['expiresAt'],
              message: 'El vencimiento debe ser posterior a la compra.',
            })
          }
        }),
  ),
)

interface AccountFormValues {
  customerId: string
  externalUsername: string
  reference: string
  purchasedAt: string
  expiresAt: string
  notes: string
}

const { errors, values, resetForm, validate, defineField, setFieldValue } =
  useForm<AccountFormValues>({
    validationSchema: schema,
    initialValues: {
      customerId: '',
      externalUsername: '',
      reference: '',
      purchasedAt: '',
      expiresAt: '',
      notes: '',
    },
  })

const [externalUsername] = defineField('externalUsername')
const [reference] = defineField('reference')
const [notes] = defineField('notes')

const customerIdModel = computed<string | null>({
  get: () => values.customerId || null,
  set: (value) => setFieldValue('customerId', value ?? ''),
})

const purchasedAtModel = computed<string | null>({
  get: () => values.purchasedAt || null,
  set: (value) => setFieldValue('purchasedAt', value ?? ''),
})

const expiresAtModel = computed<string | null>({
  get: () => values.expiresAt || null,
  set: (value) => setFieldValue('expiresAt', value ?? ''),
})

/* Búsqueda remota de clientes (debounce 250 ms, mínimo 2 caracteres como
   sugiere COMPONENTES.md §4; con 0 caracteres se muestran los primeros). */
const customerSearch = ref('')
const debouncedCustomerSearch = useDebouncedRef(customerSearch, 250)

const customerOptions = useQuery({
  queryKey: computed(() => [
    'customers',
    'options',
    debouncedCustomerSearch.value,
  ]),
  queryFn: () => searchCustomerOptions(debouncedCustomerSearch.value),
  enabled: computed(() => open.value && !isEdit.value),
})

const comboboxOptions = computed(() =>
  (customerOptions.data.value ?? []).map((customer) => ({
    value: customer.id,
    label: `${customer.lastName}, ${customer.firstName}`,
    secondary: formatPhone(customer.phone),
  })),
)

const customersLoading = computed(() => customerOptions.isFetching.value)

watch(open, async (value) => {
  if (!value) return
  formError.value = null
  customerSearch.value = ''

  resetForm({
    values: {
      customerId: props.account?.customerId ?? props.customerId ?? '',
      externalUsername: props.account?.externalUsername ?? '',
      reference: props.account?.reference ?? '',
      purchasedAt: props.account?.purchasedAt ?? nowIso(),
      expiresAt: props.account?.expiresAt ?? '',
      notes: props.account?.notes ?? '',
    },
  })

  await nextTick()
  if (!isEdit.value) {
    document
      .querySelector<HTMLElement>('[role="dialog"] input[role="combobox"]')
      ?.focus()
  }
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

  if (!session.userId) {
    formError.value = 'Tu sesión no está disponible. Vuelve a iniciar sesión.'
    return
  }

  saving.value = true
  try {
    const notesValue = values.notes.trim() ? values.notes.trim() : null
    const referenceValue = values.reference.trim() ? values.reference.trim() : null
    let id = props.account?.id ?? ''

    if (props.account) {
      await updateAccount(props.account.id, {
        external_username: values.externalUsername.trim(),
        reference: referenceValue,
        purchased_at: values.purchasedAt || props.account.purchasedAt,
        notes: notesValue,
      })
    } else {
      if (!values.expiresAt || !values.purchasedAt || !values.customerId) return
      id = await createAccount(
        {
          customerId: values.customerId,
          externalUsername: values.externalUsername.trim(),
          reference: referenceValue,
          purchasedAt: values.purchasedAt,
          expiresAt: values.expiresAt,
          notes: notesValue,
        },
        session.userId,
      )
    }

    toast.success(isEdit.value ? 'Cuenta actualizada' : 'Cuenta registrada', {
      description: isEdit.value
        ? 'Los datos locales se guardaron. El vencimiento se corrige con “Corregir vencimiento”.'
        : 'El estado se calcula con la fecha de vencimiento guardada.',
    })
    await queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    open.value = false
    emit('saved', id)
  } catch (error) {
    formError.value = toUserMessage(error, 'No se pudo guardar la cuenta.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppSheet
    v-model:open="open"
    :title="isEdit ? 'Editar cuenta IPTV' : 'Nueva cuenta IPTV'"
    :description="isEdit ? 'Datos locales del registro. No se guardan contraseñas.' : 'Registra lo que muestra el panel del proveedor.'"
    :prevent-close="saving"
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="save">
      <div v-if="!isEdit" class="rounded-md border border-border bg-surface-sunken px-3 py-2 text-sm text-content-muted">
        La contraseña del servicio se gestiona fuera de este panel. Aquí solo se guarda el
        usuario y una referencia de dónde encontrarla.
      </div>

      <AppCombobox
        v-if="!isEdit"
        v-model="customerIdModel"
        :options="comboboxOptions"
        label="Cliente"
        placeholder="Buscar por nombre o teléfono…"
        :required="true"
        :loading="customersLoading"
        :error="errors.customerId"
        empty-text="Sin resultados. Crea el cliente primero."
        @search="customerSearch = $event"
      />
      <div v-else class="flex flex-col gap-1">
        <span class="field-label">Cliente</span>
        <p class="text-base text-content">{{ account?.customerName }}</p>
        <p class="text-xs text-content-muted">{{ account ? formatPhone(account.phone) : '' }}</p>
      </div>

      <AppInput
        v-model="externalUsername"
        label="Usuario externo"
        hint="Tal como figura en el panel del proveedor. Único entre cuentas activas."
        :required="true"
        :maxlength="64"
        :error="errors.externalUsername"
        :disabled="saving"
        autocomplete="off"
      />

      <AppInput
        v-model="reference"
        label="Referencia"
        hint="Dónde está la contraseña: “gestor personal”, “cuaderno”, etc."
        :maxlength="120"
        :disabled="saving"
      />

      <AppDatePicker
        v-model="purchasedAtModel"
        label="Comprada el"
        :with-time="true"
        :required="true"
        :error="errors.purchasedAt"
        :disabled="saving"
      />

      <AppDatePicker
        v-if="!isEdit"
        v-model="expiresAtModel"
        label="Vence el"
        :with-time="true"
        :required="true"
        :error="errors.expiresAt"
        :disabled="saving"
      />
      <div v-else class="flex flex-col gap-1">
        <span class="field-label">Vence el</span>
        <p class="text-base tabular text-content">{{ formatDateTime(account?.expiresAt) }}</p>
        <p class="text-xs text-content-muted">
          Para cambiarlo usa “Corregir vencimiento” en el detalle de la cuenta: queda auditado
          con motivo.
        </p>
      </div>

      <AppTextarea
        v-model="notes"
        label="Notas"
        :maxlength="500"
        :rows="3"
        :disabled="saving"
      />

      <p v-if="formError" class="text-sm text-danger-text" role="alert">{{ formError }}</p>
    </form>

    <template #footer>
      <AppButton variant="secondary" :disabled="saving" @click="open = false">Cancelar</AppButton>
      <AppButton variant="primary" :loading="saving" @click="save">
        {{ isEdit ? 'Guardar cambios' : 'Crear cuenta' }}
      </AppButton>
    </template>
  </AppSheet>
</template>
