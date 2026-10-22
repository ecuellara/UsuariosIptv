<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppSheet from '@/components/ui/AppSheet.vue'
import AppSkeleton from '@/components/ui/AppSkeleton.vue'
import RecordPaymentModal from '@/components/renewals/RecordPaymentModal.vue'
import RenewalReverseDialog from '@/components/renewals/RenewalReverseDialog.vue'
import { formatDateTime } from '@/lib/dates'
import {
  formatMoney,
  formatTokens,
  paymentMethodLabel,
} from '@/lib/format'
import { queryKeys } from '@/lib/query-keys'
import { listPaymentsByRenewal } from '@/services/payments'
import type { Account, RenewalSummary } from '@/types/domain'

/* Detalle de una renovación desde el listado. Reutiliza el mismo
   `RecordPaymentModal` y el mismo diálogo de reversión que el historial de la
   cuenta: no se duplica la lógica de cobro ni la advertencia de pagos. */

const open = defineModel<boolean>('open', { default: false })

const props = withDefaults(
  defineProps<{
    renewal?: RenewalSummary | null
    account?: Account | null
  }>(),
  { renewal: null, account: null },
)

const emit = defineEmits<{ changed: [] }>()

const paymentOpen = ref(false)
const reverseOpen = ref(false)

const paymentsQuery = useQuery({
  queryKey: computed(() =>
    queryKeys.payments.byRenewal(props.renewal?.id ?? 'ninguna'),
  ),
  queryFn: () => listPaymentsByRenewal(props.renewal?.id ?? ''),
  enabled: computed(() => open.value && Boolean(props.renewal)),
})

const payments = computed(() => paymentsQuery.data.value ?? [])
const paymentTotal = computed(() => props.renewal?.amountPaid ?? 0)

const paidWithoutRenewal = computed(
  () => Boolean(props.renewal?.isReversed && props.renewal.amountPaid > 0),
)

function onSaved(): void {
  void paymentsQuery.refetch()
  emit('changed')
}

function onReversed(): void {
  open.value = false
  emit('changed')
}
</script>

<template>
  <AppSheet
    v-model:open="open"
    title="Detalle de renovación"
    :description="
      renewal
        ? `${renewal.planName} · ${formatDateTime(renewal.effectiveAt)}`
        : 'Historial de la operación'
    "
  >
    <div v-if="renewal" class="flex flex-col gap-5">
      <div class="flex flex-wrap items-center gap-2">
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
        <span
          v-if="paidWithoutRenewal"
          class="badge"
          :style="{
            color: 'var(--color-warning-text)',
            background: 'var(--color-warning-soft)',
            borderColor: 'var(--color-warning-border)',
          }"
          title="La reversión no devuelve el dinero: el cobro sigue en caja. Devuélvelo o regístralo como gasto si corresponde."
        >
          Cobro sin renovación vigente
        </span>
      </div>

      <p
        v-if="paidWithoutRenewal"
        class="rounded-md border border-warning-border bg-warning-soft p-3 text-sm text-warning-text"
        role="status"
      >
        Esta renovación está revertida pero conserva cobros por
        {{ formatMoney(renewal.amountPaid) }}. El dinero sigue en caja: devuélvelo o
        regístralo como gasto si corresponde.
      </p>

      <section aria-labelledby="renovacion-snapshot">
        <h2 id="renovacion-snapshot" class="section-label mb-2">Snapshot</h2>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt class="text-xs text-content-muted">Plan</dt>
            <dd class="text-content">{{ renewal.planName }}</dd>
          </div>
          <div>
            <dt class="text-xs text-content-muted">Operación</dt>
            <dd class="text-content">
              {{ renewal.operationType === 'ACTIVACION' ? 'Activación' : 'Renovación' }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-content-muted">Duración</dt>
            <dd class="text-content">
              {{ renewal.durationMonths }}
              {{ renewal.durationMonths === 1 ? 'mes' : 'meses' }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-content-muted">Dispositivos</dt>
            <dd class="text-content">{{ renewal.devices }}</dd>
          </div>
          <div>
            <dt class="text-xs text-content-muted">Precio del plan</dt>
            <dd class="tabular text-content">{{ formatMoney(renewal.priceSnapshot) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-content-muted">Importe acordado</dt>
            <dd class="tabular text-content">{{ formatMoney(renewal.amountAgreed) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-content-muted">Tokens consumidos</dt>
            <dd class="tabular text-content">{{ formatTokens(renewal.tokensUsed) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-content-muted">Costo de tokens</dt>
            <dd class="tabular text-content">{{ formatMoney(renewal.tokenCost) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-content-muted">Cobrado</dt>
            <dd class="tabular text-content">{{ formatMoney(renewal.amountPaid) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-content-muted">Pendiente</dt>
            <dd
              class="tabular"
              :class="renewal.amountPending > 0 ? 'text-warning-text' : 'text-content'"
            >
              {{ formatMoney(renewal.amountPending) }}
            </dd>
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
          <div class="col-span-2">
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
            <dt class="text-xs text-content-muted">Registrada</dt>
            <dd class="tabular text-content">{{ formatDateTime(renewal.recordedAt) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-content-muted">Cuenta</dt>
            <dd class="truncate font-mono text-xs text-content-muted">
              {{ account?.externalUsername ?? renewal.accountId }}
            </dd>
          </div>
          <div v-if="renewal.reversalReason" class="col-span-2">
            <dt class="text-xs text-content-muted">Motivo de la reversión</dt>
            <dd class="text-content">{{ renewal.reversalReason }}</dd>
          </div>
          <div v-if="renewal.notes" class="col-span-2">
            <dt class="text-xs text-content-muted">Notas</dt>
            <dd class="text-content">{{ renewal.notes }}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="renovacion-pagos">
        <div class="mb-2 flex items-baseline justify-between gap-2">
          <h2 id="renovacion-pagos" class="section-label">Pagos asociados</h2>
          <span class="text-xs tabular text-content-muted">
            Total cobrado {{ formatMoney(paymentTotal) }}
          </span>
        </div>

        <div v-if="paymentsQuery.isPending.value" class="flex flex-col gap-2" aria-busy="true">
          <AppSkeleton width="100%" height="56px" rounded="md" />
          <AppSkeleton width="100%" height="56px" rounded="md" />
        </div>

        <AppAlert
          v-else-if="paymentsQuery.isError.value"
          variant="danger"
          title="No se pudieron cargar los pagos"
        >
          <template #actions>
            <AppButton size="sm" variant="secondary" @click="paymentsQuery.refetch()">
              Reintentar
            </AppButton>
          </template>
        </AppAlert>

        <p v-else-if="payments.length === 0" class="text-sm text-content-muted">
          Esta renovación no tiene pagos registrados.
        </p>

        <ul v-else class="flex flex-col gap-2">
          <li
            v-for="payment in payments"
            :key="payment.id"
            class="rounded-md border border-border bg-surface-raised p-3"
          >
            <div class="flex items-start justify-between gap-3">
              <span class="min-w-0">
                <span class="block text-sm text-content">
                  {{ paymentMethodLabel(payment.method) }}
                  <span v-if="payment.reference" class="text-content-muted">
                    · {{ payment.reference }}
                  </span>
                </span>
                <span class="block text-xs text-content-muted">
                  {{ formatDateTime(payment.paidAt) }}
                </span>
                <span v-if="payment.notes" class="block text-xs text-content-muted">
                  {{ payment.notes }}
                </span>
              </span>
              <span class="shrink-0 text-sm font-medium tabular text-content">
                {{ formatMoney(payment.amount) }}
              </span>
            </div>
          </li>
        </ul>

        <p v-if="renewal.isReversed && payments.length > 0" class="mt-2 text-xs text-warning-text">
          Los pagos de una renovación revertida se conservan: el dinero entró y no se
          borra de la caja.
        </p>
      </section>
    </div>

    <template #footer>
      <AppButton variant="secondary" @click="open = false">Cerrar</AppButton>
      <AppButton
        v-if="renewal && !renewal.isReversed && renewal.amountPending > 0"
        variant="secondary"
        @click="paymentOpen = true"
      >
        <template #icon><AppIcon name="banknote" :size="16" /></template>
        Registrar cobro
      </AppButton>
      <AppButton
        v-if="renewal && !renewal.isReversed"
        variant="danger-ghost"
        @click="reverseOpen = true"
      >
        <template #icon><AppIcon name="refresh" :size="16" /></template>
        Revertir
      </AppButton>
    </template>

    <RecordPaymentModal
      v-model:open="paymentOpen"
      :renewal="renewal"
      @saved="onSaved"
    />

    <RenewalReverseDialog
      v-model:open="reverseOpen"
      :renewal="renewal"
      @reversed="onReversed"
    />
  </AppSheet>
</template>
