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
import CustomerFormModal from '@/components/customers/CustomerFormModal.vue'
import { useDebouncedRef } from '@/composables/useDebouncedRef'
import { useToast } from '@/composables/useToast'
import { toUserMessage } from '@/lib/errors'
import { formatPhone } from '@/lib/format'
import { queryKeys } from '@/lib/query-keys'
import {
  countActiveAccounts,
  listCustomers,
  updateCustomer,
} from '@/services/customers'
import type { Customer } from '@/types/domain'

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
    listCustomers({
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
  { key: 'customer', label: 'Cliente', card: 'primary' },
  { key: 'phone', label: 'Teléfono', card: 'meta' },
  { key: 'status', label: 'Estado', width: '130px' },
  { key: 'notes', label: 'Notas', hideBelow: 'xl' },
  { key: 'actions', label: 'Acciones', width: '120px', align: 'right', card: 'actions' },
]

const formOpen = ref(false)
const editing = ref<Customer | null>(null)
const confirmOpen = ref(false)
const confirmTarget = ref<Customer | null>(null)
const confirmLoading = ref(false)
const confirmError = ref<string | null>(null)

function createCustomer(): void {
  editing.value = null
  formOpen.value = true
}

function editCustomer(customer: Customer): void {
  editing.value = customer
  formOpen.value = true
}

function openDetail(customer: Customer): void {
  void router.push({ name: 'customer-detail', params: { customerId: customer.id } })
}

function requestToggle(customer: Customer): void {
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
    if (archiving) {
      const active = await countActiveAccounts(customer.id)
      if (active > 0) {
        confirmError.value = 'Archiva o reasigna sus cuentas primero.'
        return
      }
    }
    await updateCustomer(customer.id, {
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
      :row-key="(row) => row.id"
      :row-label="(row) => `Abrir ficha de ${row.firstName} ${row.lastName}`"
      :loading="loading"
      :error="loadError"
      error-message="No se pudo cargar la lista de clientes."
      caption="Listado de clientes"
      interactive
      @retry="customersQuery.refetch()"
      @activate="openDetail"
    >
      <template #cell-customer="{ row }">
        <span class="block truncate font-medium">{{ row.lastName }}, {{ row.firstName }}</span>
        <span v-if="row.archivedAt" class="text-xs text-content-muted">Archivado</span>
      </template>

      <template #cell-phone="{ row }">
        <span class="tabular">{{ formatPhone(row.phone) }}</span>
      </template>

      <template #cell-status="{ row }">
        <span
          class="badge"
          :style="
            row.archivedAt
              ? { color: 'var(--status-archivada-fg)', background: 'var(--status-archivada-bg)', borderStyle: 'dashed', borderColor: 'var(--status-archivada-border)' }
              : { color: 'var(--status-activa-fg)', background: 'var(--status-activa-bg)', borderColor: 'var(--status-activa-border)' }
          "
        >
          {{ row.archivedAt ? 'Archivado' : 'Activo' }}
        </span>
      </template>

      <template #cell-notes="{ row }">
        <span class="block max-w-[28ch] truncate text-sm text-content-muted">
          {{ row.notes ?? '—' }}
        </span>
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
