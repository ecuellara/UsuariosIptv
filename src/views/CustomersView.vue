<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/vue-query'
import AppButton from '@/components/ui/AppButton.vue'
import AppCheckbox from '@/components/ui/AppCheckbox.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppPagination from '@/components/ui/AppPagination.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable, { type TableColumn } from '@/components/ui/DataTable.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import CustomerFormModal from '@/components/customers/CustomerFormModal.vue'
import { useDebouncedRef } from '@/composables/useDebouncedRef'
import { useToast } from '@/composables/useToast'
import { toUserMessage } from '@/lib/errors'
import { formatDate, formatPhone } from '@/lib/format'
import { queryKeys } from '@/lib/query-keys'
import {
  getCustomer,
  listCustomerSummaries,
  updateCustomer,
} from '@/services/customers'
import type { Customer, CustomerSummary } from '@/types/domain'

const router = useRouter()
const queryClient = useQueryClient()
const toast = useToast()

const search = ref('')
const debouncedSearch = useDebouncedRef(search, 250)
const includeArchived = ref(false)
const page = ref(0)
const pageSize = ref(25)

const customersQuery = useQuery({
  queryKey: computed(() =>
    queryKeys.customers.list({
      search: debouncedSearch.value,
      page: page.value,
      pageSize: pageSize.value,
      includeArchived: includeArchived.value,
    }),
  ),
  queryFn: () =>
    listCustomerSummaries({
      search: debouncedSearch.value,
      page: page.value,
      pageSize: pageSize.value,
      includeArchived: includeArchived.value,
    }),
  placeholderData: keepPreviousData,
})

const rows = computed(() => customersQuery.data.value?.rows ?? [])
const total = computed(() => customersQuery.data.value?.total ?? 0)
const loading = computed(() => customersQuery.isPending.value)
const loadError = computed(() => customersQuery.error.value)
const hasFilters = computed(() => debouncedSearch.value.length > 0 || includeArchived.value)

watch([debouncedSearch, includeArchived], () => {
  page.value = 0
})

const columns: TableColumn[] = [
  { key: 'status', label: 'Peor estado', width: '130px', card: 'start' },
  { key: 'customer', label: 'Cliente', card: 'primary' },
  { key: 'accounts', label: 'Cuentas activas', width: '140px', numeric: true, mobileLabel: 'Cuentas activas' },
  { key: 'next', label: 'Próximo vencimiento', width: '160px', card: 'end', mobileLabel: 'Próximo vencimiento' },
  {
    key: 'lastRenewal',
    label: 'Última renovación',
    width: '150px',
    hideBelow: 'lg',
    card: 'meta',
  },
  { key: 'actions', label: 'Acciones', width: '120px', align: 'right', card: 'actions' },
]

const formOpen = ref(false)
const editing = ref<Customer | null>(null)
const confirmOpen = ref(false)
const confirmTarget = ref<CustomerSummary | null>(null)
const confirmLoading = ref(false)
const confirmError = ref<string | null>(null)

function createCustomer(): void {
  editing.value = null
  formOpen.value = true
}

/** La vista no trae `notes`: se pide el cliente completo para editarlo. */
async function editCustomer(summary: CustomerSummary): Promise<void> {
  try {
    const customer = await getCustomer(summary.customerId)
    if (!customer) {
      toast.error('No se encontró el cliente.')
      return
    }
    editing.value = customer
    formOpen.value = true
  } catch (error) {
    toast.error(toUserMessage(error, 'No se pudo abrir el cliente.'))
  }
}

function openDetail(customer: CustomerSummary): void {
  void router.push({
    name: 'customer-detail',
    params: { customerId: customer.customerId },
  })
}

function requestToggle(customer: CustomerSummary): void {
  confirmTarget.value = customer
  confirmError.value = null
  confirmOpen.value = true
}

async function toggleArchive(): Promise<void> {
  const customer = confirmTarget.value
  if (!customer) return
  confirmLoading.value = true
  confirmError.value = null
  const archiving = customer.archivedAt === null
  try {
    if (archiving && customer.accountsActive > 0) {
      confirmError.value = 'Archiva o reasigna sus cuentas primero.'
      return
    }
    await updateCustomer(customer.customerId, {
      archived_at: archiving ? new Date().toISOString() : null,
    })
    toast.success(archiving ? 'Cliente archivado' : 'Cliente reactivado', {
      description: archiving
        ? 'Se conserva su historial y sus cuentas.'
        : 'Vuelve a aparecer en la lista y en sus cuentas.',
    })
    confirmOpen.value = false
    await queryClient.invalidateQueries({ queryKey: queryKeys.customers.all })
  } catch (error) {
    confirmError.value = toUserMessage(error, 'No se pudo cambiar el estado del cliente.')
  } finally {
    confirmLoading.value = false
  }
}

function onCreated(id: string): void {
  if (id) void router.push({ name: 'customer-detail', params: { customerId: id } })
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-3xl font-semibold text-content">Clientes</h1>
        <p class="mt-1 text-base text-content-muted" aria-live="polite">
          <span class="tabular">{{ total }}</span>
          {{ total === 1 ? 'cliente' : 'clientes' }}
          <template v-if="!includeArchived">activos</template>
        </p>
      </div>
      <AppButton variant="primary" @click="createCustomer">
        <template #icon><AppIcon name="user-plus" :size="18" /></template>
        Nuevo cliente
      </AppButton>
    </header>

    <div class="flex flex-wrap items-end justify-between gap-3">
      <AppInput
        v-model="search"
        type="search"
        label="Buscar cliente"
        hide-label
        icon="search"
        placeholder="Nombre, apellido o teléfono"
        class="w-full sm:w-80"
      />
      <AppCheckbox v-model="includeArchived" label="Incluir archivados" />
    </div>

    <DataTable
      :columns="columns"
      :rows="rows"
      :row-key="(row) => row.customerId"
      :row-label="(row) => `Abrir ficha de ${row.firstName} ${row.lastName}`"
      :loading="loading"
      :error="loadError"
      error-message="No se pudo cargar la lista de clientes."
      caption="Listado de clientes"
      interactive
      @retry="customersQuery.refetch()"
      @activate="openDetail"
    >
      <template #cell-status="{ row }">
        <StatusBadge v-if="row.worstStatus" :status="row.worstStatus" />
        <span v-else class="text-content-muted" title="Sin cuentas activas">—</span>
      </template>

      <template #cell-customer="{ row }">
        <span class="block truncate font-medium">{{ row.lastName }}, {{ row.firstName }}</span>
        <span class="block text-xs text-content-muted">
          {{ formatPhone(row.phone) }}
          <template v-if="row.archivedAt"> · Archivado</template>
        </span>
      </template>

      <template #cell-accounts="{ row }">
        <span class="tabular font-medium">{{ row.accountsActive }}</span>
        <span class="text-xs text-content-muted"> de {{ row.accountsTotal }}</span>
      </template>

      <template #cell-next="{ row }">
        <span v-if="row.nextExpiration" class="tabular">
          {{ formatDate(row.nextExpiration) }}
        </span>
        <span v-else class="text-content-muted">—</span>
      </template>

      <template #cell-lastRenewal="{ row }">
        <span v-if="row.lastRenewalAt" class="tabular">
          {{ formatDate(row.lastRenewalAt) }}
        </span>
        <span v-else class="text-content-muted">—</span>
      </template>

      <template #cell-actions="{ row }">
        <div class="dt-actions">
          <button
            type="button"
            class="btn"
            data-variant="ghost"
            data-size="sm"
            data-icon-only="true"
            :aria-label="`Editar a ${row.firstName} ${row.lastName}`"
            @click="editCustomer(row)"
          >
            <AppIcon name="pencil" :size="16" />
          </button>
          <button
            type="button"
            class="btn"
            data-variant="ghost"
            data-size="sm"
            data-icon-only="true"
            :aria-label="row.archivedAt ? `Reactivar a ${row.firstName} ${row.lastName}` : `Archivar a ${row.firstName} ${row.lastName}`"
            @click="requestToggle(row)"
          >
            <AppIcon name="archive" :size="16" />
          </button>
        </div>
      </template>

      <template #empty>
        <EmptyState
          :icon="hasFilters ? 'search' : 'users'"
          :title="hasFilters ? 'Sin resultados para la búsqueda' : 'Aún no hay clientes'"
          :description="hasFilters ? 'Revisa el nombre o el teléfono, o crea el cliente.' : 'Registra a la primera persona para poder crear su cuenta IPTV.'"
        >
          <AppButton variant="primary" @click="createCustomer">Nuevo cliente</AppButton>
          <AppButton
            v-if="hasFilters"
            variant="secondary"
            @click="search = ''; includeArchived = false"
          >
            Limpiar búsqueda
          </AppButton>
        </EmptyState>
      </template>
    </DataTable>

    <AppPagination
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="total"
      label="Paginación de clientes"
    />

    <CustomerFormModal
      v-model:open="formOpen"
      :customer="editing"
      @saved="onCreated"
    />

    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="confirmTarget?.archivedAt ? 'Reactivar cliente' : 'Archivar cliente'"
      :body="
        confirmTarget?.archivedAt
          ? 'El cliente volverá a aparecer en la lista. Sus cuentas no cambian.'
          : 'El cliente dejará de aparecer en la lista por defecto. Sus cuentas y su historial se conservan.'
      "
      :confirm-label="confirmTarget?.archivedAt ? 'Reactivar cliente' : 'Archivar cliente'"
      :destructive="!confirmTarget?.archivedAt"
      :loading="confirmLoading"
      :error="confirmError"
      @confirm="toggleArchive"
    />
  </div>
</template>
