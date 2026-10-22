<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import AccountActionsHost from '@/components/accounts/AccountActionsHost.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCheckbox from '@/components/ui/AppCheckbox.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppPagination from '@/components/ui/AppPagination.vue'
import AppSegmentedFilter from '@/components/ui/AppSegmentedFilter.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import DataTable, { type TableColumn } from '@/components/ui/DataTable.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useDebouncedRef } from '@/composables/useDebouncedRef'
import { formatDateKey, formatDateTime, formatPhone, relativeDays } from '@/lib/format'
import { queryKeys } from '@/lib/query-keys'
import { getAccount, listAccounts } from '@/services/accounts'
import type { Account, AccountStatus } from '@/types/domain'

type Scope = 'ALL' | 'ACTIVE' | 'URGENT' | 'WARNING' | 'OVERDUE' | 'TODAY'

const route = useRoute()
const router = useRouter()

const SCOPE_VALUES: readonly Scope[] = ['ALL', 'ACTIVE', 'URGENT', 'WARNING', 'OVERDUE', 'TODAY']

const scope = ref<Scope>('ALL')
const status = ref<AccountStatus | 'TODOS'>('TODOS')
const search = ref('')
const debouncedSearch = useDebouncedRef(search, 250)
const includeArchived = ref(false)
const page = ref(0)
const pageSize = ref(25)

const scopeOptions = [
  { value: 'ALL', label: 'Todas' },
  { value: 'ACTIVE', label: 'Activas' },
  { value: 'URGENT', label: 'Urgentes' },
  { value: 'WARNING', label: 'Próximas' },
  { value: 'OVERDUE', label: 'Vencidas' },
  { value: 'TODAY', label: 'Vencen hoy' },
]

const statusOptions = [
  { value: 'TODOS', label: 'Todos los estados' },
  { value: 'ACTIVA', label: 'Activa' },
  { value: 'PROXIMA', label: 'Próxima' },
  { value: 'URGENTE', label: 'Urgente' },
  { value: 'VENCIDA', label: 'Vencida' },
  { value: 'ARCHIVADA', label: 'Archivada' },
]

const queryScope = computed(() => scope.value)

const accountsQuery = useQuery({
  queryKey: computed(() =>
    queryKeys.accounts.list({
      scope: queryScope.value,
      status: status.value,
      search: debouncedSearch.value,
      includeArchived: includeArchived.value,
      page: page.value,
      pageSize: pageSize.value,
    }),
  ),
  queryFn: () =>
    listAccounts({
      scope: queryScope.value,
      status: status.value,
      search: debouncedSearch.value,
      includeArchived: includeArchived.value || status.value === 'ARCHIVADA',
      page: page.value,
      pageSize: pageSize.value,
    }),
  placeholderData: keepPreviousData,
})

const rows = computed(() => accountsQuery.data.value?.rows ?? [])
const total = computed(() => accountsQuery.data.value?.total ?? 0)
const loading = computed(() => accountsQuery.isPending.value)
const loadError = computed(() => accountsQuery.error.value)

watch([debouncedSearch, includeArchived, status, scope], () => {
  page.value = 0
})

const columns: TableColumn[] = [
  { key: 'status', label: 'Estado', width: '120px', card: 'start' },
  { key: 'customer', label: 'Cliente', card: 'primary' },
  { key: 'username', label: 'Usuario externo', card: 'meta' },
  { key: 'reference', label: 'Referencia', width: '170px', hideBelow: 'lg' },
  { key: 'expires', label: 'Vence', width: '140px', align: 'right', card: 'end' },
  { key: 'verification', label: 'Verificación', width: '150px', hideBelow: 'xl' },
  { key: 'actions', label: 'Acciones', width: '190px', align: 'right', card: 'actions' },
]

const accountActions = ref<InstanceType<typeof AccountActionsHost> | null>(null)

function openDetail(account: Account): void {
  accountActions.value?.openDetail(account)
}

function openRenewal(account?: Account): void {
  accountActions.value?.openRenewal(account ? { account } : {})
}

function createAccount(): void {
  accountActions.value?.openCreate()
}

function clearFilters(): void {
  scope.value = 'ALL'
  status.value = 'TODOS'
  search.value = ''
  includeArchived.value = false
}

const hasFilters = computed(
  () =>
    scope.value !== 'ALL' ||
    status.value !== 'TODOS' ||
    debouncedSearch.value.length > 0 ||
    includeArchived.value,
)

/* Enlaces profundos desde el dashboard: ?scope=..., ?nueva=1 y ?account=... */
function isScope(value: unknown): value is Scope {
  return typeof value === 'string' && (SCOPE_VALUES as readonly string[]).includes(value)
}

if (isScope(route.query.scope)) {
  scope.value = route.query.scope
}

async function handleDeepLink(): Promise<void> {
  const query = route.query
  const accountId = typeof query.account === 'string' ? query.account : null
  const openNew = query.nueva === '1'
  if (!accountId && !openNew) return

  if (openNew) createAccount()
  if (accountId) {
    const account = await getAccount(accountId)
    if (account) openDetail(account)
  }
  const next = { ...query }
  delete next.account
  delete next.nueva
  await router.replace({ query: next })
}

onMounted(() => {
  void handleDeepLink()
})

watch(() => route.query, () => void handleDeepLink(), { flush: 'post' })
</script>

<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-3xl font-semibold text-content">Cuentas IPTV</h1>
        <p class="mt-1 text-base text-content-muted" aria-live="polite">
          <span class="tabular">{{ total }}</span>
          {{ total === 1 ? 'cuenta' : 'cuentas' }}
          según los filtros actuales. Sin contraseñas: solo usuario, referencia y fechas.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <AppButton variant="secondary" @click="openRenewal()">
          <template #icon><AppIcon name="refresh" :size="18" /></template>
          Registrar renovación
        </AppButton>
        <AppButton variant="primary" @click="createAccount">
          <template #icon><AppIcon name="plus" :size="18" /></template>
          Nueva cuenta
        </AppButton>
      </div>
    </header>

    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-2 lg:flex-row lg:items-center">
        <AppSegmentedFilter
          v-model="scope"
          class="min-w-0 flex-1"
          label="Filtro por vencimiento"
          :options="scopeOptions"
        />
        <AppInput
          v-model="search"
          type="search"
          label="Buscar cuenta"
          hide-label
          icon="search"
          placeholder="Cliente, usuario o teléfono"
          class="w-full lg:w-64"
        />
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <AppSelect
          v-model="status"
          class="w-48"
          :options="statusOptions"
          label="Estado"
          hide-label
        />
        <AppCheckbox v-model="includeArchived" label="Incluir archivadas" />
      </div>
    </div>

    <DataTable
      :columns="columns"
      :rows="rows"
      :row-key="(row) => row.id"
      :row-status="(row) => row.status"
      :row-label="(row) => `Abrir ficha de la cuenta ${row.externalUsername}`"
      :loading="loading"
      :error="loadError"
      error-message="No se pudieron cargar las cuentas."
      caption="Listado de cuentas IPTV"
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

      <template #cell-username="{ row }">
        <span class="block truncate font-mono text-sm">{{ row.externalUsername }}</span>
      </template>

      <template #cell-reference="{ row }">
        <span class="block max-w-[24ch] truncate text-sm" :title="row.reference ?? undefined">
          {{ row.reference ?? '—' }}
        </span>
      </template>

      <template #cell-expires="{ row }">
        <span class="block tabular">{{ formatDateKey(row.expiresOn) }}</span>
        <span class="block text-xs text-content-muted">{{ relativeDays(row.daysLeft) }}</span>
      </template>

      <template #cell-verification="{ row }">
        <span v-if="row.lastVerifiedAt" class="text-xs text-content-muted">
          {{ formatDateTime(row.lastVerifiedAt) }}
        </span>
        <span
          v-else
          class="badge badge-followup"
          data-followup="PENDIENTE"
        >
          Sin verificar
        </span>
        <span v-if="row.isStaleVerification && row.lastVerifiedAt" class="mt-1 block text-xs text-warning-text">
          Revisar fecha
        </span>
      </template>

      <template #cell-actions="{ row }">
        <div class="dt-actions">
          <button
            v-if="!row.archivedAt"
            type="button"
            class="btn"
            data-variant="secondary"
            data-size="sm"
            :aria-label="`Renovar cuenta de ${row.customerName}`"
            @click="openRenewal(row)"
          >
            Renovar
          </button>
          <button
            type="button"
            class="btn"
            data-variant="secondary"
            data-size="sm"
            :aria-label="`Ver detalle de ${row.externalUsername}`"
            @click="openDetail(row)"
          >
            Detalle
          </button>
        </div>
      </template>

      <template #empty>
        <EmptyState
          :icon="hasFilters ? 'search' : 'tv'"
          :title="hasFilters ? 'Ninguna cuenta coincide con estos filtros' : 'Todavía no hay cuentas IPTV'"
          :description="hasFilters ? 'Quita algún filtro para ver más resultados.' : 'Crea una cuenta desde la ficha de un cliente o aquí mismo.'"
        >
          <AppButton v-if="hasFilters" variant="secondary" @click="clearFilters">
            Limpiar filtros
          </AppButton>
          <AppButton variant="primary" @click="createAccount">Nueva cuenta</AppButton>
        </EmptyState>
      </template>
    </DataTable>

    <AppPagination
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="total"
      label="Paginación de cuentas"
    />

    <AccountActionsHost ref="accountActions" />
  </div>
</template>
