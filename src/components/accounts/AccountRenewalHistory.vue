<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppSkeleton from '@/components/ui/AppSkeleton.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import RecordPaymentModal from '@/components/renewals/RecordPaymentModal.vue'
import { useToast } from '@/composables/useToast'
import { formatDateTime } from '@/lib/dates'
import { formatMoney, formatTokens } from '@/lib/format'
import { toUserMessage } from '@/lib/errors'
import { queryKeys } from '@/lib/query-keys'
import { createIdempotencyKey, reverseRenewal } from '@/services/rpc'
import { listRenewalsByAccount } from '@/services/renewals'
import type { RenewalSummary } from '@/types/domain'

/* Historial de renovaciones de una cuenta. Pagado, pendiente, costo de tokens
   y margen vienen de `v_renewal_summary`; aquí solo se muestran.
   Revertir no borra pagos: queda auditado y el pago sigue en caja. */

const props = defineProps<{ accountId: string }>()
const emit = defineEmits<{ changed: [] }>()

const queryClient = useQueryClient()
const toast = useToast()

const renewalsQuery = useQuery({
  queryKey: computed(() => queryKeys.renewals.byAccount(props.accountId)),
  queryFn: () => listRenewalsByAccount(props.accountId),
  enabled: computed(() => props.accountId.length > 0),
})

const renewals = computed(() => renewalsQuery.data.value ?? [])

const reverseOpen = ref(false)
const reverseTarget = ref<RenewalSummary | null>(null)
const reverseLoading = ref(false)
const reverseError = ref<string | null>(null)
const reverseKey = ref('')

const paymentOpen = ref(false)
const paymentTarget = ref<RenewalSummary | null>(null)

function openPayment(renewal: RenewalSummary): void {
  paymentTarget.value = renewal
  paymentOpen.value = true
}

function onPaymentSaved(): void {
  void renewalsQuery.refetch()
}

const reverseBody = computed(() => {
  const renewal = reverseTarget.value
  if (!renewal) return ''
  const tokens =
    renewal.tokensUsed > 0
      ? `Se devolverán ${formatTokens(renewal.tokensUsed)} al inventario al costo congelado. `
      : 'Esta renovación no consumió tokens. '
  const expiration = renewal.previousExpiration
    ? `El vencimiento de la cuenta volverá a ${formatDateTime(renewal.previousExpiration)}. `
    : 'La cuenta volverá a su vencimiento inicial. '
  return `${tokens}${expiration}Los pagos no se borran: quedan en la caja como un hecho histórico.`
})

function openReverse(renewal: RenewalSummary): void {
  reverseTarget.value = renewal
  reverseKey.value = createIdempotencyKey()
  reverseError.value = null
  reverseOpen.value = true
}

async function confirmReverse(reason: string): Promise<void> {
  const renewal = reverseTarget.value
  if (!renewal || reverseLoading.value) return
  reverseLoading.value = true
  reverseError.value = null
  try {
    await reverseRenewal(renewal.id, reason, reverseKey.value)
    toast.success('Renovación revertida', {
      description:
        'Los tokens volvieron al inventario y el vencimiento anterior quedó restaurado.',
    })
    reverseOpen.value = false
    await queryClient.invalidateQueries({ queryKey: queryKeys.renewals.all })
    await queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
    await queryClient.invalidateQueries({ queryKey: queryKeys.tokens.all })
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    emit('changed')
  } catch (error) {
    reverseError.value = toUserMessage(error, 'No se pudo revertir la renovación.')
  } finally {
    reverseLoading.value = false
  }
}
</script>

<template>
  <section aria-labelledby="cuenta-historial">
    <div class="mb-2 flex items-center justify-between gap-2">
      <h2 id="cuenta-historial" class="section-label">Historial de renovaciones</h2>
      <span v-if="renewals.length > 0" class="text-xs tabular text-content-muted">
        {{ renewals.length }}
      </span>
    </div>

    <div v-if="renewalsQuery.isPending.value" class="flex flex-col gap-2" aria-busy="true">
      <AppSkeleton width="100%" height="72px" rounded="lg" />
      <AppSkeleton width="100%" height="72px" rounded="lg" />
    </div>

    <AppAlert
      v-else-if="renewalsQuery.isError.value"
      variant="danger"
      title="No se pudo cargar el historial"
    >
      <template #actions>
        <AppButton size="sm" variant="secondary" @click="renewalsQuery.refetch()">
          Reintentar
        </AppButton>
      </template>
    </AppAlert>

    <p v-else-if="renewals.length === 0" class="text-sm text-content-muted">
      Sin renovaciones registradas. Al registrar una aparecerá aquí con su margen.
    </p>

    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="renewal in renewals"
        :key="renewal.id"
        class="rounded-md border border-border bg-surface-raised p-3"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-content">
              {{ renewal.planName }}
            </p>
            <p class="text-xs text-content-muted">
              {{ renewal.operationType === 'ACTIVACION' ? 'Activación' : 'Renovación' }} ·
              {{ formatDateTime(renewal.effectiveAt) }}
            </p>
          </div>

          <span
            class="badge"
            :style="
              renewal.isReversed
                ? {
                    color: 'var(--status-archivada-fg)',
                    background: 'var(--status-archivada-bg)',
                    borderStyle: 'dashed',
                    borderColor: 'var(--status-archivada-border)',
                  }
                : {
                    color: 'var(--color-success-text)',
                    background: 'var(--color-success-soft)',
                    borderColor: 'var(--color-success-border)',
                  }
            "
          >
            {{ renewal.isReversed ? 'Revertida' : 'Confirmada' }}
          </span>
        </div>

        <dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div>
            <dt class="text-xs text-content-muted">Vencimiento</dt>
            <dd class="text-content">
              <span class="tabular">{{ formatDateTime(renewal.previousExpiration) }}</span>
              <span class="text-content-muted"> → </span>
              <span class="tabular">{{ formatDateTime(renewal.newExpiration) }}</span>
              <span
                v-if="renewal.expirationEdited"
                class="ml-1 badge border border-border bg-surface-sunken text-content-muted"
              >
                Editada
              </span>
            </dd>
          </div>
          <div>
            <dt class="text-xs text-content-muted">Tokens</dt>
            <dd class="tabular text-content">{{ formatTokens(renewal.tokensUsed) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-content-muted">Acordado</dt>
            <dd class="tabular text-content">{{ formatMoney(renewal.amountAgreed) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-content-muted">Cobrado</dt>
            <dd class="tabular text-content">
              {{ formatMoney(renewal.amountPaid) }}
              <span v-if="renewal.isReversed" class="text-xs text-content-muted">
                (pago conservado)
              </span>
            </dd>
          </div>
          <div>
            <dt class="text-xs text-content-muted">Pendiente</dt>
            <dd
              class="tabular"
              :class="renewal.amountPending > 0 ? 'text-warning-text' : 'text-content'"
            >
              {{ formatMoney(renewal.amountPending) }}
              <span v-if="renewal.amountPending > 0" class="text-xs">
                pendiente
              </span>
            </dd>
          </div>
          <div>
            <dt class="text-xs text-content-muted">Costo de tokens</dt>
            <dd class="tabular text-content">{{ formatMoney(renewal.tokenCost) }}</dd>
          </div>
          <div class="col-span-2">
            <dt class="text-xs text-content-muted">Margen bruto</dt>
            <dd class="tabular text-content">
              <span
                :class="[
                  renewal.isReversed ? 'line-through' : undefined,
                  !renewal.isReversed && renewal.grossMargin < 0 ? 'text-danger-text' : undefined,
                ]"
              >
                {{ formatMoney(renewal.grossMargin) }}
              </span>
              <span v-if="renewal.isReversed" class="ml-1 text-xs text-content-muted">
                revertido
              </span>
            </dd>
          </div>
        </dl>

        <p v-if="renewal.reversalReason" class="mt-2 text-xs text-content-muted">
          Motivo de la reversión: {{ renewal.reversalReason }}
        </p>

        <div v-if="!renewal.isReversed" class="mt-2 flex flex-wrap justify-end gap-2">
          <AppButton
            v-if="renewal.amountPending > 0"
            size="sm"
            variant="secondary"
            @click="openPayment(renewal)"
          >
            <template #icon><AppIcon name="banknote" :size="16" /></template>
            Registrar cobro
          </AppButton>
          <AppButton
            size="sm"
            variant="danger-ghost"
            @click="openReverse(renewal)"
          >
            <template #icon><AppIcon name="refresh" :size="16" /></template>
            Revertir
          </AppButton>
        </div>
      </li>
    </ul>

    <p class="mt-2 text-xs text-content-muted">
      El margen no descuenta gastos generales: es acordado − costo de tokens.
    </p>

    <ConfirmDialog
      v-model:open="reverseOpen"
      title="Revertir renovación"
      :body="reverseBody"
      confirm-label="Revertir renovación"
      :destructive="true"
      :require-reason="true"
      reason-label="Motivo de la reversión"
      :loading="reverseLoading"
      :error="reverseError"
      @confirm="confirmReverse"
    />

    <RecordPaymentModal
      v-model:open="paymentOpen"
      :renewal="paymentTarget"
      @saved="onPaymentSaved"
    />
  </section>
</template>
