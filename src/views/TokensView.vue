<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import AdjustTokensModal from '@/components/tokens/AdjustTokensModal.vue'
import PurchaseTokensModal from '@/components/tokens/PurchaseTokensModal.vue'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppSegmentedFilter from '@/components/ui/AppSegmentedFilter.vue'
import DataTable, { type TableColumn } from '@/components/ui/DataTable.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import MetricCard from '@/components/ui/MetricCard.vue'
import { formatDate, formatDateTime, limaTimeKey } from '@/lib/dates'
import {
  formatDecimal,
  formatInteger,
  formatMoney,
  formatSignedInteger,
  formatTokens,
  movementTypeLabel,
} from '@/lib/format'
import { queryKeys } from '@/lib/query-keys'
import {
  getTokenSummary,
  listTokenMovements,
  listTokenPurchases,
} from '@/services/tokens'
import type { TokenMovement } from '@/types/domain'

/* Inventario de tokens. Saldo, costo promedio y valor del inventario salen de
   `v_token_summary`; el libro de movimientos se lee de SQL y nunca se edita. */

type Tab = 'purchases' | 'movements'

const tab = ref<Tab>('purchases')
const tabModel = computed<string>({
  get: () => tab.value,
  set: (value) => {
    if (value === 'purchases' || value === 'movements') tab.value = value
  },
})
const purchaseOpen = ref(false)
const adjustOpen = ref(false)

const summaryQuery = useQuery({
  queryKey: queryKeys.tokens.summary,
  queryFn: getTokenSummary,
})

const purchasesQuery = useQuery({
  queryKey: queryKeys.tokens.purchases,
  queryFn: () => listTokenPurchases(25),
})

const movementsQuery = useQuery({
  queryKey: queryKeys.tokens.movements,
  queryFn: () => listTokenMovements(50),
})

const summary = computed(() => summaryQuery.data.value ?? null)
const summaryLoading = computed(() => summaryQuery.isPending.value)
const summaryError = computed(() => summaryQuery.isError.value)

const purchases = computed(() => purchasesQuery.data.value ?? [])
const movements = computed(() => movementsQuery.data.value ?? [])

const tokenLevel = computed<'ok' | 'low' | 'empty'>(() => {
  if (!summary.value) return 'ok'
  if (summary.value.quantity === 0) return 'empty'
  if (summary.value.belowMinimum) return 'low'
  return 'ok'
})

const tokenMeter = computed(() => {
  if (!summary.value) return undefined
  return {
    value: summary.value.quantity,
    max: Math.max(summary.value.minBalance * 4, 1),
    level: tokenLevel.value,
    label: `${formatTokens(summary.value.quantity)} sobre un mínimo de ${summary.value.minBalance}`,
  }
})

const actionsDisabled = computed(
  () => summaryLoading.value || summaryError.value || summary.value === null,
)

const tabOptions = computed(() => [
  { value: 'purchases', label: 'Compras' },
  { value: 'movements', label: 'Movimientos' },
])

const purchaseColumns: TableColumn[] = [
  { key: 'purchased', label: 'Fecha', width: '160px', card: 'start' },
  { key: 'quantity', label: 'Cantidad', width: '110px', align: 'right', numeric: true, card: 'primary' },
  { key: 'total', label: 'Costo total', width: '120px', align: 'right', numeric: true },
  { key: 'unit', label: 'Costo unitario', width: '130px', align: 'right', numeric: true },
  { key: 'supplier', label: 'Proveedor', hideBelow: 'lg' },
  { key: 'reference', label: 'Referencia', width: '140px', hideBelow: 'xl' },
]

const movementColumns: TableColumn[] = [
  { key: 'created', label: 'Fecha', width: '160px', card: 'start' },
  { key: 'type', label: 'Tipo', width: '120px', card: 'primary' },
  { key: 'quantity', label: 'Cantidad', width: '100px', align: 'right', numeric: true },
  { key: 'unit', label: 'Costo unitario', width: '130px', align: 'right', numeric: true, hideBelow: 'lg' },
  { key: 'cost', label: 'Costo congelado', width: '130px', align: 'right', numeric: true },
  { key: 'origin', label: 'Origen', card: 'meta' },
]

function movementOrigin(movement: TokenMovement): string {
  if (movement.type === 'COMPRA') return 'Compra de tokens'
  if (movement.type === 'CONSUMO') return 'Renovación'
  if (movement.type === 'REVERSION') return 'Reversión de renovación'
  return movement.reason ? `Ajuste · ${movement.reason}` : 'Ajuste manual'
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-3xl font-semibold text-content">Tokens</h1>
        <p class="mt-1 text-base text-content-muted">
          Saldo, costo promedio y movimientos del inventario. Todo se calcula en SQL.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <AppButton variant="secondary" :disabled="actionsDisabled" @click="adjustOpen = true">
          <template #icon><AppIcon name="settings" :size="18" /></template>
          Ajustar saldo
        </AppButton>
        <AppButton variant="primary" :disabled="actionsDisabled" @click="purchaseOpen = true">
          <template #icon><AppIcon name="coins" :size="18" /></template>
          Comprar tokens
        </AppButton>
      </div>
    </header>

    <AppAlert v-if="summaryError" variant="danger" title="No se pudo cargar el saldo de tokens">
      Las acciones quedan deshabilitadas: necesitamos el saldo actual para operar.
      <template #actions>
        <AppButton size="sm" variant="secondary" @click="summaryQuery.refetch()">
          Reintentar
        </AppButton>
      </template>
    </AppAlert>

    <AppAlert
      v-else-if="!summaryLoading && summary === null"
      variant="warning"
      title="El inventario de tokens no está disponible"
    >
      La vista de resumen no devolvió datos. No se muestra saldo 0 para no inventar un
      inventario. Revisa la inicialización de <code class="font-mono text-xs">token_stock</code>.
    </AppAlert>

    <section aria-label="Resumen de tokens" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard
        label="Saldo"
        :value="summary ? formatInteger(summary.quantity) : null"
        :context="summary ? `Mínimo configurado: ${summary.minBalance}` : undefined"
        :severity="tokenLevel === 'empty' ? 'critical' : tokenLevel === 'low' ? 'attention' : 'neutral'"
        :loading="summaryLoading"
        :error="summaryError"
        :meter="tokenMeter"
      />
      <MetricCard
        label="Costo promedio"
        :value="summary ? formatDecimal(summary.avgUnitCost, 4) : null"
        context="Por token, según compras y ajustes positivos"
        :loading="summaryLoading"
        :error="summaryError"
      />
      <MetricCard
        label="Valor del inventario"
        :value="summary ? formatMoney(summary.inventoryValue) : null"
        context="Saldo × costo promedio (SQL)"
        :loading="summaryLoading"
        :error="summaryError"
      />
    </section>

    <AppAlert
      v-if="summary && summary.belowMinimum"
      variant="warning"
      title="Saldo por debajo del mínimo"
    >
      Te quedan {{ formatTokens(summary.quantity) }} y el mínimo es {{ summary.minBalance }}.
      Compra tokens antes de la próxima renovación.
      <template #actions>
        <AppButton size="sm" variant="primary" @click="purchaseOpen = true">
          Comprar tokens
        </AppButton>
      </template>
    </AppAlert>

    <div class="flex flex-col gap-3">
      <AppSegmentedFilter v-model="tabModel" label="Vista de tokens" :options="tabOptions" />

      <DataTable
        v-if="tab === 'purchases'"
        :columns="purchaseColumns"
        :rows="purchases"
        :row-key="(row) => row.id"
        :loading="purchasesQuery.isPending.value"
        :error="purchasesQuery.error.value"
        error-message="No se pudieron cargar las compras."
        caption="Compras de tokens"
        @retry="purchasesQuery.refetch()"
      >
        <template #cell-purchased="{ row }">
          <span class="block tabular">{{ formatDate(row.purchasedAt) }}</span>
          <span class="block text-xs text-content-muted">{{ limaTimeKey(row.purchasedAt) }}</span>
        </template>
        <template #cell-quantity="{ row }">
          <span class="tabular">{{ formatTokens(row.quantity) }}</span>
        </template>
        <template #cell-total="{ row }">
          <span class="tabular">{{ formatMoney(row.totalCost) }}</span>
        </template>
        <template #cell-unit="{ row }">
          <span class="tabular">{{ formatDecimal(row.unitCost, 4) }}</span>
        </template>
        <template #cell-supplier="{ row }">
          <span class="block truncate">{{ row.supplier ?? '—' }}</span>
          <span v-if="row.notes" class="block truncate text-xs text-content-muted">
            {{ row.notes }}
          </span>
        </template>
        <template #cell-reference="{ row }">
          <span class="block truncate text-sm">{{ row.reference ?? '—' }}</span>
        </template>
        <template #empty>
          <EmptyState
            icon="coins"
            title="Todavía no registraste compras de tokens"
            description="Registra la primera compra para poder renovar cuentas."
          >
            <AppButton variant="primary" :disabled="actionsDisabled" @click="purchaseOpen = true">
              Comprar tokens
            </AppButton>
          </EmptyState>
        </template>
      </DataTable>

      <DataTable
        v-else
        :columns="movementColumns"
        :rows="movements"
        :row-key="(row) => row.id"
        :loading="movementsQuery.isPending.value"
        :error="movementsQuery.error.value"
        error-message="No se pudo cargar el libro de movimientos."
        caption="Movimientos de tokens"
        @retry="movementsQuery.refetch()"
      >
        <template #cell-created="{ row }">
          <span class="block tabular">{{ formatDate(row.createdAt) }}</span>
          <span class="block text-xs text-content-muted">
            {{ formatDateTime(row.createdAt) }}
          </span>
        </template>
        <template #cell-type="{ row }">
          <span class="text-sm">{{ movementTypeLabel(row.type) }}</span>
        </template>
        <template #cell-quantity="{ row }">
          <span
            class="tabular"
            :style="{
              color:
                row.quantityDelta > 0
                  ? 'var(--color-success-text)'
                  : 'var(--color-text)',
            }"
          >
            {{ formatSignedInteger(row.quantityDelta) }}
          </span>
        </template>
        <template #cell-unit="{ row }">
          <span class="tabular">{{ formatDecimal(row.unitCost, 4) }}</span>
        </template>
        <template #cell-cost="{ row }">
          <span class="tabular">{{ formatMoney(row.costAmount) }}</span>
        </template>
        <template #cell-origin="{ row }">
          <span class="block truncate text-sm">{{ movementOrigin(row) }}</span>
          <span v-if="row.renewalId" class="block truncate font-mono text-xs text-content-muted">
            Renovación {{ row.renewalId.slice(0, 8) }}
          </span>
          <span v-else-if="row.purchaseId" class="block truncate font-mono text-xs text-content-muted">
            Compra {{ row.purchaseId.slice(0, 8) }}
          </span>
        </template>
        <template #empty>
          <EmptyState
            icon="inbox"
            title="Sin movimientos todavía"
            description="Cada compra, consumo, ajuste o reversión aparecerá en este libro."
          />
        </template>
      </DataTable>
    </div>

    <p class="text-xs text-content-muted">
      Los movimientos no se editan ni se borran: un error se corrige con un ajuste que exige
      motivo. Comprar tokens mueve caja, no gasto del mes (ADR-005).
    </p>

    <PurchaseTokensModal v-model:open="purchaseOpen" />
    <AdjustTokensModal
      v-model:open="adjustOpen"
      :current-quantity="summary?.quantity ?? null"
    />
  </div>
</template>
