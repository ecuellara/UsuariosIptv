<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useToast } from '@/composables/useToast'
import { formatDateTime } from '@/lib/dates'
import { toUserMessage } from '@/lib/errors'
import { formatMoney, formatTokens } from '@/lib/format'
import { queryKeys } from '@/lib/query-keys'
import { createIdempotencyKey, reverseRenewal } from '@/services/rpc'
import type { RenewalSummary } from '@/types/domain'

/* Diálogo de reversión compartido por el historial de la cuenta y el detalle
   del listado de renovaciones. Una sola copia de la advertencia: si hubo
   cobros, la reversión NO devuelve el dinero (el pago se conserva y sigue en
   caja). La clave de idempotencia se genera al abrir, no por clic. */

const open = defineModel<boolean>('open', { default: false })

const props = withDefaults(
  defineProps<{ renewal?: RenewalSummary | null }>(),
  { renewal: null },
)

const emit = defineEmits<{ reversed: [] }>()

const queryClient = useQueryClient()
const toast = useToast()

const loading = ref(false)
const error = ref<string | null>(null)
const idempotencyKey = ref('')

watch(open, (isOpen) => {
  if (!isOpen) return
  error.value = null
  idempotencyKey.value = createIdempotencyKey()
})

const body = computed(() => {
  const renewal = props.renewal
  if (!renewal) return ''
  const tokens =
    renewal.tokensUsed > 0
      ? `Se devolverán ${formatTokens(renewal.tokensUsed)} al inventario al costo congelado. `
      : 'Esta renovación no consumió tokens. '
  const expiration = renewal.previousExpiration
    ? `El vencimiento de la cuenta volverá a ${formatDateTime(renewal.previousExpiration)}. `
    : 'La cuenta volverá a su vencimiento inicial. '
  const paid =
    renewal.amountPaid > 0
      ? `Esta renovación tiene cobros por ${formatMoney(renewal.amountPaid)}. La reversión no devuelve el dinero. `
      : ''
  return `${tokens}${expiration}${paid}Los pagos no se borran: quedan en la caja como un hecho histórico.`
})

async function confirm(reason: string): Promise<void> {
  const renewal = props.renewal
  if (!renewal || loading.value) return
  loading.value = true
  error.value = null
  try {
    await reverseRenewal(renewal.id, reason, idempotencyKey.value)
    toast.success('Renovación revertida', {
      description:
        'Los tokens volvieron al inventario y el vencimiento anterior quedó restaurado.',
    })
    open.value = false
    await queryClient.invalidateQueries({ queryKey: queryKeys.renewals.all })
    await queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
    await queryClient.invalidateQueries({ queryKey: queryKeys.tokens.all })
    await queryClient.invalidateQueries({ queryKey: queryKeys.finance.all })
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    emit('reversed')
  } catch (caught) {
    error.value = toUserMessage(caught, 'No se pudo revertir la renovación.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <ConfirmDialog
    v-model:open="open"
    title="Revertir renovación"
    :body="body"
    confirm-label="Revertir renovación"
    :destructive="true"
    :require-reason="true"
    reason-label="Motivo de la reversión"
    :loading="loading"
    :error="error"
    @confirm="confirm"
  />
</template>
