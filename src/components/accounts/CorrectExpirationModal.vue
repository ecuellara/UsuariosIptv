<script setup lang="ts">
import { ref, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import AppButton from '@/components/ui/AppButton.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import { toUserMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { queryKeys } from '@/lib/query-keys'
import { createIdempotencyKey, setAccountExpiration } from '@/services/rpc'
import { useToast } from '@/composables/useToast'
import type { Account } from '@/types/domain'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{ account: Account | null }>()
const emit = defineEmits<{ saved: [] }>()

const queryClient = useQueryClient()
const toast = useToast()

const expiresAt = ref<string | null>(null)
const reason = ref('')
const error = ref<string | null>(null)
const fieldError = ref<string | null>(null)
const saving = ref(false)
/* La clave se genera al abrir el formulario y se reutiliza en cada reintento
   (docs/05-sql.md §4.4). */
let idempotencyKey = createIdempotencyKey()

watch(open, (value) => {
  if (!value) return
  expiresAt.value = props.account?.expiresAt ?? null
  reason.value = ''
  error.value = null
  fieldError.value = null
  idempotencyKey = createIdempotencyKey()
})

async function save(): Promise<void> {
  error.value = null
  fieldError.value = null
  if (!props.account) return
  if (!expiresAt.value) {
    fieldError.value = 'Elige la nueva fecha de vencimiento.'
    return
  }
  if (reason.value.trim().length < 5) {
    fieldError.value = 'Escribe el motivo (mínimo 5 caracteres).'
    return
  }
  saving.value = true
  try {
    await setAccountExpiration(
      props.account.id,
      expiresAt.value,
      reason.value.trim(),
      idempotencyKey,
    )
    toast.success('Vencimiento corregido', {
      description: 'La corrección quedó registrada en la auditoría.',
    })
    await queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    open.value = false
    emit('saved')
  } catch (caught) {
    error.value = toUserMessage(caught, 'No se pudo corregir el vencimiento.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal
    v-model:open="open"
    title="Corregir vencimiento"
    :description="account ? `${account.customerName} · ${account.externalUsername}` : undefined"
    :prevent-close="saving"
    width="sm"
  >
    <div class="flex flex-col gap-4">
      <p class="rounded-md border border-border bg-surface-sunken px-3 py-2 text-sm text-content-muted">
        Vencimiento actual:
        <span class="tabular text-content">{{ formatDateTime(account?.expiresAt) }}</span>.
        La corrección se audita con motivo; no se edita en silencio.
      </p>

      <AppDatePicker
        v-model="expiresAt"
        label="Nuevo vencimiento"
        :with-time="true"
        :required="true"
        :error="fieldError"
      />

      <AppTextarea
        v-model="reason"
        label="Motivo"
        hint="Ejemplo: “El proveedor muestra 12 nov 2026, 08:00”."
        :required="true"
        :rows="2"
        :maxlength="500"
      />

      <p v-if="error" class="text-sm text-danger-text" role="alert">{{ error }}</p>
    </div>

    <template #footer>
      <AppButton variant="secondary" :disabled="saving" @click="open = false">Cancelar</AppButton>
      <AppButton variant="primary" :loading="saving" @click="save">Guardar corrección</AppButton>
    </template>
  </AppModal>
</template>
