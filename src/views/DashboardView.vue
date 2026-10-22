<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSegmentedFilter from '@/components/ui/AppSegmentedFilter.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import DataTable, { type TableColumn } from '@/components/ui/DataTable.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import MetricCard from '@/components/ui/MetricCard.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import CustomerFormModal from '@/components/customers/CustomerFormModal.vue'
import AccountActionsHost from '@/components/accounts/AccountActionsHost.vue'
import { useDebouncedRef } from '@/composables/useDebouncedRef'
import { currentMonthRangeInLima, formatDateKey, formatLongDate } from '@/lib/dates'
import {
  formatDateTime,
  formatDecimal,
  formatInteger,
  formatMoney,
  formatPhone,
  formatTokens,
  relativeDays,
} from '@/lib/format'
import { queryKeys } from '@/lib/query-keys'
import { whatsappUrl } from '@/lib/text'
import { listAccounts } from '@/services/accounts'
import { getCashOverview, getDashboardMetrics, getStaleAccounts } from '@/services/dashboard'
import type { Account, AccountStatus } from '@/types/domain'

const router = useRouter()

const month = currentMonthRangeInLima()

/* --- Métricas (todos los conteos son SQL) --------------------------------- */

const metricsQuery = useQuery({
  queryKey: queryKeys.dashboard.metrics(),
  queryFn: getDashboardMetrics,
  staleTime: 20_000,
})

const metrics = computed(() => metricsQuery.data.value ?? null)
const metricsLoading = computed(() => metricsQuery.isPending.value)
const metricsError = computed(() => metricsQuery.isError.value)
const urgentDays = computed(() => metrics.value?.settings.urgentDays ?? 3)
const warningDays = computed(() => metrics.value?.settings.warningDays ?? 7)

const tokenLevel = computed<'ok' | 'low' | 'empty'>(() => {
  const data = metrics.value
  if (!data) return 'ok'
  if (data.stock.quantity === 0) return 'empty'
  if (data.stock.quantity < data.settings.minTokenBalance) return 'low'
  return 'ok'
})

const tokenMeter = computed(() => {
  const data = metrics.value
  if (!data) return undefined
  const minimum = data.settings.minTokenBalance
  return {
    value: data.stock.quantity,
    max: Math.max(minimum * 4, 1),
    level: tokenLevel.value,
    label: `${formatTokens(data.stock.quantity)} sobre un mínimo de ${minimum}`,
  }
})

const tokenContext = computed(() => {
  const data = metrics.value
  if (!data) return undefined
  const cost =
    data.stock.avgUnitCost > 0
      ? `${formatDecimal(data.stock.avgUnitCost, 4)} por token`
      : 'sin compras registradas'
  return `tokens · mínimo ${data.settings.minTokenBalance} · ${cost}`
})

/* --- Filtros y tabla ------------------------------------------------------ */

type Scope = 'TODAY' | 'URGENT' | 'WARNING' | 'OVERDUE' | 'ALL'

const scope = ref<Scope>('TODAY')
const scopeSelectedByUser = ref(false)
const status = ref<AccountStatus | 'TODOS'>('TODOS')
const search = ref('')
const debouncedSearch = useDebouncedRef(search, 250)
const fallbackNotice = ref(false)

const scopeOptions = computed(() => [
  { value: 'TODAY', label: 'Hoy', count: metrics.value?.today },
  { value: 'URGENT', label: `≤ ${urgentDays.value} días`, count: metrics.value?.urgent },
  { value: 'WARNING', label: `≤ ${warningDays.value} días`, count: metrics.value?.warning },
  { value: 'OVERDUE', label: 'Vencidas', count: metrics.value?.overdue },
  { value: 'ALL', label: 'Todas' },
])

const statusOptions = [
  { value: 'TODOS', label: 'Todos los estados' },
  { value: 'ACTIVA', label: 'Activa' },
  { value: 'PROXIMA', label: 'Próxima' },
  { value: 'URGENTE', label: 'Urgente' },
  { value: 'VENCIDA', label: 'Vencida' },
  { value: 'ARCHIVADA', label: 'Archivada' },
]

const accountsQuery = useQuery({
  queryKey: computed(() =>
    queryKeys.accounts.list({
      scope: scope.value,
      status: status.value,
      search: debouncedSearch.value,
      includeArchived: status.value === 'ARCHIVADA',
      pageSize: 10,
    }),
  ),
  queryFn: () =>
    listAccounts({
      scope: scope.value,
      status: status.value,
      search: debouncedSearch.value,
      includeArchived: status.value === 'ARCHIVADA',
      page: 0,
      pageSize: 10,
    }),
  placeholderData: keepPreviousData,
})

const accounts = computed(() => accountsQuery.data.value?.rows ?? [])
const accountsLoading = computed(() => accountsQuery.isPending.value)
const accountsError = computed(() => accountsQuery.error.value)
const filtered = computed(
  () => scope.value !== 'TODAY' || status.value !== 'TODOS' || debouncedSearch.value.length > 0,
)

const columns: TableColumn[] = [
  { key: 'status', label: 'Estado', width: '120px', card: 'start' },
  { key: 'customer', label: 'Cliente', card: 'primary' },
  { key: 'account', label: 'Cuenta', card: 'meta' },
  { key: 'expires', label: 'Vence', width: '140px', align: 'right', card: 'end' },
  { key: 'actions', label: 'Acciones', width: '150px', align: 'right', card: 'actions' },
]

/* Si hoy no vence nadie, se muestra la ventana de 7 días y se avisa
   (PANTALLAS.md §3). */
watch(
  () => metrics.value,
  (data) => {
    if (!data) return
    if (data.today === 0 && !scopeSelectedByUser.value && scope.value === 'TODAY') {
      scope.value = 'WARNING'
      fallbackNotice.value = true
    }
  },
)

function onScopeSelected(): void {
  scopeSelectedByUser.value = true
  fallbackNotice.value = false
}

function clearFilters(): void {
  scope.value = 'ALL'
  status.value = 'TODOS'
  search.value = ''
  scopeSelectedByUser.value = true
  fallbackNotice.value = false
}

/* --- Caja y verificación -------------------------------------------------- */

const cashQuery = useQuery({
  queryKey: queryKeys.dashboard.cash(month.key),
  queryFn: () => getCashOverview({ startIso: month.startIso, endIso: month.endIso }),
  staleTime: 60_000,
})

const cash = computed(() => cashQuery.data.value ?? null)
const cashLoading = computed(() => cashQuery.isPending.value)
const cashError = computed(() => cashQuery.isError.value)

const staleQuery = useQuery({
  queryKey: queryKeys.accounts.stale(4),
  queryFn: () => getStaleAccounts(4),
  staleTime: 60_000,
})

const staleAccounts = computed(() => staleQuery.data.value ?? [])
const staleLoading = computed(() => staleQuery.isPending.value)
const staleError = computed(() => staleQuery.isError.value)

/* --- Detalle y acciones ---------------------------------------------------- */

const customerModalOpen = ref(false)
const accountActions = ref<InstanceType<typeof AccountActionsHost> | null>(null)

function openDetail(account: Account): void {
  accountActions.value?.openDetail(account)
}

function goToAccounts(): void {
  void router.push({ name: 'accounts' })
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-3xl font-semibold text-content">
          Hoy, {{ formatLongDate() }}
        </h1>
        <p class="mt-1 text-base text-content-muted">
          <template v-if="metrics">
            <span class="tabular">{{ metrics.today }}</span>
            {{ metrics.today === 1 ? 'cuenta vence hoy' : 'cuentas vencen hoy' }} ·
            <span class="tabular">{{ metrics.warning }}</span>
            en los próximos {{ warningDays }} días
          </template>
          <span v-else>Resumen del día</span>
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <AppButton variant="secondary" @click="customerModalOpen = true">
          <template #icon><AppIcon name="user-plus" :size="18" /></template>
          Nuevo cliente
        </AppButton>
        <RouterLink :to="{ name: 'renewals' }" class="btn" data-variant="primary">
          <AppIcon name="refresh" :size="18" />
          Registrar renovación
        </RouterLink>
      </div>
    </header>

    <AppAlert v-if="metricsError" variant="danger" title="No se pudieron cargar las métricas">
      Las tarjetas muestran “—” para no inventar ceros.
      <template #actions>
        <AppButton size="sm" variant="secondary" @click="metricsQuery.refetch()">
          Reintentar
        </AppButton>
      </template>
    </AppAlert>

    <section aria-label="Métricas del día" class="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <MetricCard
        label="Vencen hoy"
        :value="metrics ? formatInteger(metrics.today) : null"
        :context="metrics ? `${metrics.urgent} en la ventana urgente` : undefined"
        :severity="metrics && metrics.today > 0 ? 'critical' : 'neutral'"
        :loading="metricsLoading"
        :error="metricsError"
        :to="{ name: 'accounts', query: { scope: 'TODAY' } }"
      />
      <MetricCard
        label="Urgentes"
        :value="metrics ? formatInteger(metrics.urgent) : null"
        :context="`Umbral configurado: ${urgentDays} días`"
        :severity="metrics && metrics.urgent > 0 ? 'attention' : 'neutral'"
        :loading="metricsLoading"
        :error="metricsError"
        :to="{ name: 'accounts', query: { scope: 'URGENT' } }"
      />
      <MetricCard
        label="Próximos 7 días"
        :value="metrics ? formatInteger(metrics.warning) : null"
        :context="`Incluye ${metrics?.today ?? 0} de hoy`"
        :severity="metrics && metrics.warning > 0 ? 'attention' : 'neutral'"
        :loading="metricsLoading"
        :error="metricsError"
        :to="{ name: 'accounts', query: { scope: 'WARNING' } }"
      />
      <MetricCard
        label="Vencidas"
        :value="metrics ? formatInteger(metrics.overdue) : null"
        :context="metrics && metrics.overdue > 0 ? 'Requieren renovación o archivo' : 'Ninguna pendiente'"
        :severity="metrics && metrics.overdue > 0 ? 'critical' : 'neutral'"
        :loading="metricsLoading"
        :error="metricsError"
        :to="{ name: 'accounts', query: { scope: 'OVERDUE' } }"
      />
      <MetricCard
        label="Cuentas activas"
        :value="metrics ? formatInteger(metrics.active) : null"
        :context="`Más de ${warningDays} días para vencer`"
        :loading="metricsLoading"
        :error="metricsError"
        :to="{ name: 'accounts', query: { scope: 'ACTIVE' } }"
      />
      <MetricCard
        label="Sin verificar"
        :value="metrics ? formatInteger(metrics.stale) : null"
        context="Sin confirmar con el proveedor en 30 días"
        :severity="metrics && metrics.stale > 0 ? 'attention' : 'neutral'"
        :loading="metricsLoading"
        :error="metricsError"
      />
      <MetricCard
        label="Clientes"
        :value="metrics ? formatInteger(metrics.customers) : null"
        :context="`${formatInteger(metrics?.totalAccounts ?? null)} cuentas registradas`"
        :loading="metricsLoading"
        :error="metricsError"
        :to="{ name: 'customers' }"
      />
      <MetricCard
        label="Saldo de tokens"
        :value="metrics ? formatInteger(metrics.stock.quantity) : null"
        :context="tokenContext"
        :severity="tokenLevel === 'empty' ? 'critical' : tokenLevel === 'low' ? 'attention' : 'neutral'"
        :loading="metricsLoading"
        :error="metricsError"
        :meter="tokenMeter"
        :to="{ name: 'tokens' }"
      />
    </section>

    <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_344px]">
      <section class="flex min-w-0 flex-col gap-3" aria-labelledby="vencimientos">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="vencimientos" class="text-2xl font-semibold text-content">Vencimientos</h2>
            <p class="text-sm text-content-muted">
              Orden de la vista: vencidas → urgentes → próximas → activas.
            </p>
          </div>
          <RouterLink
            :to="{ name: 'accounts' }"
            class="inline-flex min-h-11 items-center text-sm text-primary-text underline"
          >
            Ver todas
          </RouterLink>
        </div>

        <div class="flex flex-col gap-2 lg:flex-row lg:items-center">
          <AppSegmentedFilter
            v-model="scope"
            class="min-w-0 flex-1"
            label="Rango de vencimiento"
            :options="scopeOptions"
            @update:model-value="onScopeSelected"
          />
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <AppSelect
              v-model="status"
              class="w-full sm:w-40 shrink-0"
              :options="statusOptions"
              label="Estado"
              hide-label
            />
            <AppInput
              v-model="search"
              type="search"
              label="Buscar"
              hide-label
              icon="search"
              placeholder="Cliente, usuario o teléfono"
              class="min-w-0 w-full sm:flex-1 lg:w-56"
            />
          </div>
        </div>

        <p v-if="fallbackNotice" class="text-sm text-content-muted" role="status">
          No vence nada hoy: se muestran los próximos {{ warningDays }} días.
        </p>

        <EmptyState
          v-if="metrics && metrics.totalAccounts === 0"
          icon="tv"
          title="Aún no hay cuentas registradas"
          description="Registra tu primer cliente y su cuenta para empezar a controlar vencimientos."
        >
          <AppButton variant="primary" @click="customerModalOpen = true">Nuevo cliente</AppButton>
        </EmptyState>

        <DataTable
          v-else
          :columns="columns"
          :rows="accounts"
          :row-key="(row) => row.id"
          :row-status="(row) => row.status"
          :row-label="(row) => `Abrir ficha de ${row.customerName}`"
          :loading="accountsLoading"
          :error="accountsError"
          error-message="No se pudieron cargar los vencimientos."
          caption="Vencimientos de cuentas IPTV"
          interactive
          @retry="accountsQuery.refetch()"
          @activate="openDetail"
        >
          <template #cell-status="{ row }">
            <StatusBadge :status="row.status" />
          </template>

          <template #cell-customer="{ row }">
            <span class="block truncate font-medium">{{ row.customerName }}</span>
            <span class="block text-xs text-content-muted">{{ formatPhone(row.phone) }}</span>
          </template>

          <template #cell-account="{ row }">
            <span class="block truncate font-mono text-sm">{{ row.externalUsername }}</span>
            <span class="block truncate text-xs text-content-muted">
              {{ row.reference ? `Ref. ${row.reference}` : 'Sin referencia' }}
            </span>
          </template>

          <template #cell-expires="{ row }">
            <span class="block tabular">{{ formatDateKey(row.expiresOn) }}</span>
            <span class="block text-xs text-content-muted">{{ relativeDays(row.daysLeft) }}</span>
          </template>

          <template #cell-actions="{ row }">
            <div class="dt-actions">
              <a
                class="btn"
                data-variant="secondary"
                data-size="sm"
                data-icon-only="true"
                :href="whatsappUrl(row.phone)"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="`Abrir WhatsApp de ${row.customerName}`"
              >
                <AppIcon name="whatsapp" :size="16" />
              </a>
              <RouterLink
                :to="{ name: 'renewals' }"
                class="btn"
                data-variant="secondary"
                data-size="sm"
                :aria-label="`Registrar renovación de ${row.customerName}`"
              >
                Renovar
              </RouterLink>
            </div>
          </template>

          <template #empty>
            <EmptyState
              :icon="filtered ? 'search' : 'inbox'"
              :title="filtered ? 'Ningún vencimiento en este rango' : 'Nada vence en este momento'"
              :description="filtered ? 'Prueba con “Todas” o cambia el estado.' : 'La lista se actualizará cuando haya cuentas con vencimiento.'"
            >
              <AppButton v-if="filtered" variant="secondary" @click="clearFilters">
                Limpiar filtros
              </AppButton>
            </EmptyState>
          </template>
        </DataTable>
      </section>

      <aside class="flex flex-col gap-4" aria-label="Acciones y contexto">
        <section class="panel p-4">
          <h2 class="section-label mb-3">Acciones rápidas</h2>
          <div class="flex flex-col gap-2">
            <RouterLink :to="{ name: 'renewals' }" class="btn" data-variant="primary" data-block="true">
              <AppIcon name="refresh" :size="18" />
              Registrar renovación
            </RouterLink>
            <div class="grid grid-cols-2 gap-2">
              <RouterLink :to="{ name: 'tokens' }" class="btn" data-variant="secondary">
                <AppIcon name="coins" :size="16" />
                Comprar tokens
              </RouterLink>
              <RouterLink :to="{ name: 'finance' }" class="btn" data-variant="secondary">
                <AppIcon name="receipt" :size="16" />
                Registrar gasto
              </RouterLink>
            </div>
            <button
              type="button"
              class="btn"
              data-variant="ghost"
              data-size="sm"
              @click="goToAccounts"
            >
              Ver cuentas IPTV
            </button>
          </div>
        </section>

        <section class="panel p-4" :aria-busy="cashLoading || undefined">
          <div class="mb-2 flex items-baseline justify-between gap-2">
            <h2 class="section-label">Movimientos de {{ month.label }}</h2>
            <span v-if="cash" class="text-xs tabular text-content-muted">{{ cash.count }}</span>
          </div>

          <p v-if="cashLoading" class="text-sm text-content-muted">Cargando…</p>
          <p v-else-if="cashError" class="text-sm text-danger-text" role="alert">
            No disponible.
            <button type="button" class="underline" @click="cashQuery.refetch()">Reintentar</button>
          </p>
          <p v-else-if="(cash?.movements.length ?? 0) === 0" class="text-sm text-content-muted">
            Sin movimientos este mes.
          </p>
          <ul v-else class="flex flex-col divide-y divide-border">
            <li
              v-for="movement in cash?.movements ?? []"
              :key="`${movement.kind}-${movement.sourceId ?? movement.occurredAt}`"
              class="flex items-start justify-between gap-3 py-2"
            >
              <span class="min-w-0">
                <span class="block truncate text-sm text-content">
                  {{ movement.description ?? movement.kind }}
                </span>
                <span class="block text-xs text-content-muted">
                  {{ formatDateTime(movement.occurredAt) }} ·
                  {{ movement.kind === 'COBRO' ? 'Cobro' : movement.kind === 'GASTO' ? 'Gasto' : 'Compra de tokens' }}
                </span>
              </span>
              <span
                class="shrink-0 text-sm tabular"
                :style="{ color: movement.direction === 'IN' ? 'var(--color-success-text)' : 'var(--color-text)' }"
              >
                {{ formatMoney(movement.amount, { sign: movement.direction === 'IN' ? 'always' : 'negative' }) }}
              </span>
            </li>
          </ul>
          <p class="mt-2 text-xs text-content-muted">
            El total del mes y su desglose llegarán con Finanzas: se calculan en SQL, no en el navegador.
          </p>
        </section>

        <section class="panel p-4" :aria-busy="staleLoading || undefined">
          <h2 class="section-label mb-2">Sin verificar</h2>
          <p v-if="staleLoading" class="text-sm text-content-muted">Cargando…</p>
          <p v-else-if="staleError" class="text-sm text-danger-text" role="alert">
            No disponible.
            <button type="button" class="underline" @click="staleQuery.refetch()">Reintentar</button>
          </p>
          <p v-else-if="staleAccounts.length === 0" class="text-sm text-content-muted">
            Todas las cuentas tienen la fecha confirmada este mes.
          </p>
          <ul v-else class="flex flex-col gap-1">
            <li v-for="account in staleAccounts" :key="account.id">
              <button
                type="button"
                class="flex w-full items-center justify-between gap-2 rounded-sm px-1 py-1.5 text-left hover:bg-surface-hover"
                @click="openDetail(account)"
              >
                <span class="min-w-0">
                  <span class="block truncate text-sm text-content">{{ account.customerName }}</span>
                  <span class="block truncate font-mono text-xs text-content-muted">{{ account.externalUsername }}</span>
                </span>
                <StatusBadge :status="account.status" />
              </button>
            </li>
          </ul>
          <p class="mt-2 text-xs text-content-muted">
            Confirma la fecha con el proveedor y márcala como verificada.
          </p>
        </section>
      </aside>
    </div>

    <CustomerFormModal v-model:open="customerModalOpen" />

    <AccountActionsHost ref="accountActions" />
  </div>
</template>
