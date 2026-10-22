<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
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

const form = reactive({
  customerId: null as string | null,
  externalUsername: '',
  reference: '',
  purchasedAt: nowIso() as string | null,
  expiresAt: null as string | null,
  notes: '',
})

const errors = reactive<{
  customerId: string | null
  externalUsername: string | null
  purchasedAt: string | null
  expiresAt: string | null
}>({
  customerId: null,
  externalUsername: null,
  purchasedAt: null,
  expiresAt: null,
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

watch(open, (value) => {
  if (!value) return
  formError.value = null
  errors.customerId = null
  errors.externalUsername = null
  errors.purchasedAt = null
  errors.expiresAt = null
  customerSearch.value = ''

  if (props.account) {
    form.customerId = props.account.customerId
    form.externalUsername = props.account.externalUsername
    form.reference = props.account.reference ?? ''
    form.purchasedAt = props.account.purchasedAt
    form.expiresAt = props.account.expiresAt
    form.notes = props.account.notes ?? ''
  } else {
    form.customerId = props.customerId ?? ''
    form.externalUsername = ''
    form.reference = ''
    form.purchasedAt = nowIso()
    form.expiresAt = null
    form.notes = ''
  }
})

function validate(): boolean {
  errors.customerId = form.customerId ? null : 'Elige el cliente.'
  errors.externalUsername =
    form.externalUsername.trim().length === 0
      ? 'Escribe el usuario del panel del proveedor.'
      : form.externalUsername.trim().length > 64
        ? 'Máximo 64 caracteres.'
        : null
  errors.purchasedAt = form.purchasedAt ? null : 'Elige la fecha de compra.'
  if (!isEdit.value) {
    if (!form.expiresAt) {
      errors.expiresAt = 'Elige el vencimiento.'
    } else if (form.purchasedAt && form.expiresAt <= form.purchasedAt) {
      errors.expiresAt = 'El vencimiento debe ser posterior a la compra.'
    } else {
      errors.expiresAt = null
    }
  }
  return (
    !errors.customerId &&
    !errors.externalUsername &&
    !errors.purchasedAt &&
    !errors.expiresAt
  )
}

async function save(): Promise<void> {
  formError.value = null
  if (!validate()) return
  if (!session.userId) {
    formError.value = 'Tu sesión no está disponible. Vuelve a iniciar sesión.'
    return
  }
  saving.value = true
  try {
    const notes = form.notes.trim() ? form.notes.trim() : null
    const reference = form.reference.trim() ? form.reference.trim() : null
    let id = props.account?.id ?? ''

    if (props.account) {
      await updateAccount(props.account.id, {
        external_username: form.externalUsername.trim(),
        reference,
        purchased_at: form.purchasedAt ?? props.account.purchasedAt,
        notes,
      })
    } else {
      if (!form.expiresAt || !form.purchasedAt || !form.customerId) return
      id = await createAccount(
        {
          customerId: form.customerId,
          externalUsername: form.externalUsername.trim(),
          reference,
          purchasedAt: form.purchasedAt,
          expiresAt: form.expiresAt,
          notes,
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
        v-model="form.customerId"
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
        v-model="form.externalUsername"
        label="Usuario externo"
        hint="Tal como figura en el panel del proveedor. Único entre cuentas activas."
        :required="true"
        :maxlength="64"
        :error="errors.externalUsername"
        :disabled="saving"
        autocomplete="off"
      />

      <AppInput
        v-model="form.reference"
        label="Referencia"
        hint="Dónde está la contraseña: “gestor personal”, “cuaderno”, etc."
        :maxlength="120"
        :disabled="saving"
      />

      <AppDatePicker
        v-model="form.purchasedAt"
        label="Comprada el"
        :with-time="true"
        :required="true"
        :error="errors.purchasedAt"
        :disabled="saving"
      />

      <AppDatePicker
        v-if="!isEdit"
        v-model="form.expiresAt"
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
        v-model="form.notes"
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
