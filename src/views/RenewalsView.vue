<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import AccountActionsHost from '@/components/accounts/AccountActionsHost.vue'
import RenewalDetailSheet from '@/components/renewals/RenewalDetailSheet.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCheckbox from '@/components/ui/AppCheckbox.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppTooltip from '@/components/ui/AppTooltip.vue'
import DataTable, { type TableColumn } from '@/components/ui/DataTable.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { formatDate, limaTimeKey } from '@/lib/dates'
import { formatMoney, formatTokens } from '@/lib/format'
import { queryKeys } from '@/lib/query-keys'
import { listRenewalsWithAccounts } from '@/services/renewals'
import type { RenewalWithAccount } from '@/types/domain'

/* Historial de renovaciones. Cada importe lo calcula `v_renewal_summary`;
   no se suman totales en el navegador (AGENTS.md). El detalle y la reversión
   viven en la ficha de la cuenta para no duplicar acciones. */

const router = useRouter()

const includeReversed = ref(true)

const renewalsQuery = useQuery({
  queryKey: computed(() =>
    queryKeys.renewals.list({ includeReversed: includeReversed.value, limit: 100 }),
  ),
  queryFn: () =>
    listRenewalsWithAccounts({
      includeReversed: includeReversed.value,
      limit: 100,
    }),
})

const rows = computed(() => renewalsQuery.data.value ?? [])
const loading = computed(() => renewalsQuery.isPending.value)
const loadError = computed(() => renewalsQuery.error.value)

const columns: TableColumn[] = [
  { key: 'status', label: 'Estado', width: '110px', card: 'start' },
  { key: 'account', label: 'Cliente y cuenta', card: 'primary' },
  { key: 'recorded', label: 'Registrada', width: '145px', card: 'meta' },
  { key: 'plan', label: 'Plan', width: '170px', hideBelow: 'lg' },
  { key: 'agreed', label: 'Acordado', width: '110px', align: 'right', numeric: true, mobileLabel: 'Acordado' },
  { key: 'paid', label: 'Cobrado', width: '110px', align: 'right', numeric: true, hideBelow: 'lg', mobileLabel: 'Cobrado' },
  { key: 'pending', label: 'Pendiente', width: '110px', align: 'right', numeric: true, mobileLabel: 'Pendiente' },
  { key: 'tokens', label: 'Tokens', width: '80px', align: 'right', numeric: true, hideBelow: 'xl' },
  { key: 'margin', label: 'Margen', width: '110px', align: 'right', numeric: true, card: 'end', mobileLabel: 'Margen' },
  { key: 'actions', label: 'Acciones', width: '110px', align: 'right', card: 'actions' },
]

const accountActions = ref<InstanceType<typeof AccountActionsHost> | null>(null)

const detailOpen = ref(false)
const detailRow = ref<RenewalWithAccount | null>(null)

function openDetail(row: RenewalWithAccount): void {
  detailRow.value = row
  detailOpen.value = true
}

function onDetailChanged(): void {
  void renewalsQuery.refetch().then((result) => {
    const id = detailRow.value?.renewal.id
    const updated = result.data?.find((row) => row.renewal.id === id)
    if (updated) detailRow.value = updated
  })
}

function openRenewal(): void {
  accountActions.value?.openRenewal({})
}

function openAccount(row: RenewalWithAccount): void {
  if (!row.account) return
  void router.push({ name: 'accounts', query: { account: row.account.id } })
}

function statusStyle(renewal: RenewalWithAccount['renewal']): Record<string, string> {
  return renewal.isReversed
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
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-3xl font-semibold text-content">Renovaciones</h1>
        <p class="mt-1 text-base text-content-muted">
          Plan, tokens y margen de cada operación registrada. Los importes vienen de
          <code class="font-mono text-sm">v_renewal_summary</code>.
        </p>
      </div>
      <AppButton variant="primary" @click="openRenewal">
        <template #icon><AppIcon name="refresh" :size="18" /></template>
        Registrar renovación
      </AppButton>
    </header>

    <div class="flex flex-wrap items-center gap-3">
      <AppCheckbox v-model="includeReversed" label="Incluir revertidas" />
      <p class="text-xs text-content-muted">
        Una renovación revertida conserva sus pagos y su margen histórico.
      </p>
    </div>

    <DataTable
      :columns="columns"
      :rows="rows"
      :row-key="(row) => row.renewal.id"
      :row-label="
        (row) =>
          `Abrir detalle de la renovación de ${row.account?.customerName ?? row.renewal.accountId}`
      "
      :loading="loading"
      :error="loadError"
      error-message="No se pudieron cargar las renovaciones."
      caption="Historial de renovaciones"
      interactive
      @retry="renewalsQuery.refetch()"
      @activate="openDetail"
    >
      <template #cell-status="{ row }">
        <div class="flex flex-col items-start gap-1">
          <span class="badge" :style="statusStyle(row.renewal)">
            {{ row.renewal.isReversed ? 'Revertida' : 'Confirmada' }}
          </span>
          <AppTooltip
            v-if="row.renewal.isReversed && row.renewal.amountPaid > 0"
            text="La reversión no devuelve el dinero: el cobro sigue en caja. Devuélvelo o regístralo como gasto si corresponde."
          >
            <span
              tabindex="0"
              class="badge cursor-help whitespace-nowrap"
              :style="{
                color: 'var(--color-warning-text)',
                background: 'var(--color-warning-soft)',
                borderColor: 'var(--color-warning-border)',
              }"
            >
              Cobro sin renovación
            </span>
          </AppTooltip>
        </div>
      </template>

      <template #cell-account="{ row }">
        <span class="block truncate font-medium">
          {{ row.account?.customerName ?? 'Cuenta no disponible' }}
        </span>
        <span class="block truncate font-mono text-xs text-content-muted">
          {{ row.account?.externalUsername ?? row.renewal.accountId }}
        </span>
      </template>

      <template #cell-recorded="{ row }">
        <span class="block tabular">{{ formatDate(row.renewal.recordedAt) }}</span>
        <span class="block text-xs text-content-muted">
          {{ limaTimeKey(row.renewal.recordedAt) }} · Lima
        </span>
      </template>

      <template #cell-plan="{ row }">
        <span class="block truncate text-sm">{{ row.renewal.planName }}</span>
        <span class="block text-xs text-content-muted">
          {{ row.renewal.durationMonths }} {{ row.renewal.durationMonths === 1 ? 'mes' : 'meses' }}
        </span>
      </template>

      <template #cell-agreed="{ row }">
        <span class="tabular">{{ formatMoney(row.renewal.amountAgreed) }}</span>
      </template>

      <template #cell-paid="{ row }">
        <span class="tabular">{{ formatMoney(row.renewal.amountPaid) }}</span>
      </template>

      <template #cell-pending="{ row }">
        <span
          class="tabular"
          :class="row.renewal.amountPending > 0 ? 'text-warning-text' : 'text-content'"
        >
          {{ formatMoney(row.renewal.amountPending) }}
        </span>
      </template>

      <template #cell-tokens="{ row }">
        <span class="tabular">{{ formatTokens(row.renewal.tokensUsed) }}</span>
      </template>

      <template #cell-margin="{ row }">
        <span
          class="tabular"
          :class="row.renewal.isReversed ? 'text-content-muted line-through' : 'text-content'"
        >
          {{ formatMoney(row.renewal.grossMargin) }}
        </span>
        <span v-if="row.renewal.isReversed" class="block text-xs text-content-muted">
          revertido
        </span>
      </template>

      <template #cell-actions="{ row }">
        <div class="dt-actions">
          <button
            v-if="row.account"
            type="button"
            class="btn"
            data-variant="secondary"
            data-size="sm"
            @click="openAccount(row)"
          >
            Ver cuenta
          </button>
        </div>
      </template>

      <template #empty>
        <EmptyState
          icon="refresh"
          title="Sin renovaciones registradas"
          description="Cuando registres una renovación aparecerá aquí con su margen."
        >
          <AppButton variant="primary" @click="openRenewal">
            Registrar renovación
          </AppButton>
        </EmptyState>
      </template>
    </DataTable>

    <p class="text-xs text-content-muted">
      Los totales del periodo (acordado, cobrado y pendiente) viven en Finanzas y se
      calculan en SQL; aquí no se suman importes en el navegador.
    </p>

    <RenewalDetailSheet
      v-model:open="detailOpen"
      :renewal="detailRow?.renewal ?? null"
      :account="detailRow?.account ?? null"
      @changed="onDetailChanged"
    />

    <AccountActionsHost ref="accountActions" />
  </div>
</template>
