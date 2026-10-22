<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/vue-query'
import FollowupComposer from '@/components/followups/FollowupComposer.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCheckbox from '@/components/ui/AppCheckbox.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppPagination from '@/components/ui/AppPagination.vue'
import AppSegmentedFilter from '@/components/ui/AppSegmentedFilter.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import DataTable, { type TableColumn } from '@/components/ui/DataTable.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import FollowupBadge from '@/components/ui/FollowupBadge.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useDebouncedRef } from '@/composables/useDebouncedRef'
import {
  formatDate,
  formatDateKey,
  formatPhone,
  followupLabel,
  relativeDays,
} from '@/lib/format'
import { limaTimeKey } from '@/lib/dates'
import { queryKeys } from '@/lib/query-keys'
import { listFollowupInbox } from '@/services/followups'
import { FOLLOWUP_STATUSES, type FollowupInboxRow, type FollowupStatus, type FollowupWindow } from '@/types/domain'

/* Bandeja de seguimiento. El estado de vigencia y `status_rank` vienen de
   `v_account_status`; el estado actual del seguimiento, de `renewal_followups`.
   La app solo abre WhatsApp: el envío real lo confirma el administrador. */

const router = useRouter()
const queryClient = useQueryClient()

const windowFilter = ref<FollowupWindow>('ALL')
const statusFilter = ref<FollowupStatus | 'TODOS'>('TODOS')
const pendingOnly = ref(false)
const search = ref('')
const debouncedSearch = useDebouncedRef(search, 250)
const page = ref(0)
const pageSize = ref(25)

watch(pendingOnly, (value) => {
  if (value) statusFilter.value = 'TODOS'
})

const windowOptions = [
  { value: 'ALL', label: 'Todas' },
  { value: 'TODAY', label: 'Hoy' },
  { value: 'THREE', label: '≤ 3 días' },
  { value: 'WEEK', label: '≤ 7 días' },
  { value: 'OVERDUE', label: 'Vencidas' },
]

const statusOptions = [
  { value: 'TODOS', label: 'Todos los seguimientos' },
  ...FOLLOWUP_STATUSES.map((value) => ({ value, label: followupLabel(value) })),
]

const inboxFilter = computed(() => ({
  window: windowFilter.value,
  status: statusFilter.value,
  pendingOnly: pendingOnly.value,
  search: debouncedSearch.value,
}))

const inboxQuery = useQuery({
  queryKey: computed(() => queryKeys.followups.inbox(inboxFilter.value)),
  queryFn: () => listFollowupInbox(inboxFilter.value),
  placeholderData: keepPreviousData,
})

const allRows = computed<FollowupInboxRow[]>(() => inboxQuery.data.value?.rows ?? [])
const total = computed(() => inboxQuery.data.value?.total ?? 0)
const truncated = computed(() => inboxQuery.data.value?.truncated ?? false)
const loading = computed(() => inboxQuery.isPending.value)
const loadError = computed(() => inboxQuery.error.value)

const pageRows = computed(() => {
  const from = page.value * pageSize.value
  return allRows.value.slice(from, from + pageSize.value)
})

watch([windowFilter, statusFilter, pendingOnly, debouncedSearch], () => {
  page.value = 0
})

watch([() => allRows.value.length, pageSize], () => {
  const maxPage = Math.max(0, Math.ceil(allRows.value.length / pageSize.value) - 1)
  if (page.value > maxPage) page.value = maxPage
})

const hasFilters = computed(
  () =>
    windowFilter.value !== 'ALL' ||
    statusFilter.value !== 'TODOS' ||
    pendingOnly.value ||
    debouncedSearch.value.length > 0,
)

function clearFilters(): void {
  windowFilter.value = 'ALL'
  statusFilter.value = 'TODOS'
  pendingOnly.value = false
  search.value = ''
}

const columns: TableColumn[] = [
  { key: 'status', label: 'Vigencia', width: '92px', card: 'start' },
  { key: 'customer', label: 'Cliente y cuenta', card: 'primary' },
  { key: 'expires', label: 'Vencimiento', width: '104px', align: 'right', card: 'end', mobileLabel: 'Vencimiento' },
  { key: 'followup', label: 'Seguimiento', width: '132px', mobileLabel: 'Seguimiento' },
  {
    key: 'contact',
    label: 'Contacto y próxima',
    width: '136px',
    card: 'meta',
    mobileLabel: 'Contacto y próxima acción',
  },
  { key: 'actions', label: 'Acciones', width: '120px', align: 'right', card: 'actions' },
]

const composerOpen = ref(false)
const composerRow = ref<FollowupInboxRow | null>(null)

function openComposer(row: FollowupInboxRow): void {
  composerRow.value = row
  composerOpen.value = true
}

function openAccount(row: FollowupInboxRow): void {
  void router.push({ name: 'accounts', query: { account: row.account.id } })
}

async function onContactChanged(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.followups.all })
  await queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
  await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
}

function isOverdue(value: string | null): boolean {
  return value !== null && new Date(value).getTime() < Date.now()
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <header>
      <h1 class="text-3xl font-semibold text-content">Seguimiento</h1>
      <p class="mt-1 max-w-3xl text-base text-content-muted" aria-live="polite">
        <span class="tabular">{{ total }}</span>
        {{ total === 1 ? 'cuenta' : 'cuentas' }} en la bandeja. Abre WhatsApp con la
        plantilla lista y registra la respuesta. La app nunca envía mensajes por sí sola.
      </p>
    </header>

    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-2 lg:flex-row lg:items-center">
        <AppSegmentedFilter
          v-model="windowFilter"
          class="min-w-0 flex-1"
          label="Filtro por vencimiento"
          :options="windowOptions"
        />
        <AppInput
          v-model="search"
          type="search"
          label="Buscar en la bandeja"
          hide-label
          icon="search"
          placeholder="Cliente, usuario o teléfono"
          class="w-full lg:w-64"
        />
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <AppSelect
          v-model="statusFilter"
          class="w-56"
          :options="statusOptions"
          label="Estado de seguimiento"
          hide-label
          :disabled="pendingOnly"
        />
        <AppCheckbox
          v-model="pendingOnly"
          label="Solo con seguimiento pendiente"
        />
        <AppButton
          v-if="hasFilters"
          variant="ghost"
          size="sm"
          @click="clearFilters"
        >
          Limpiar filtros
        </AppButton>
      </div>
    </div>

    <p
      v-if="truncated"
      class="rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-sm text-warning-text"
      role="status"
    >
      La bandeja tiene {{ total }} cuentas y muestra las {{ allRows.length }} más urgentes.
      Afina los filtros para ver el resto.
    </p>

    <DataTable
      :columns="columns"
      :rows="pageRows"
      :row-key="(row) => row.account.id"
      :row-status="(row) => row.account.status"
      :loading="loading"
      :error="loadError"
      error-message="No se pudo cargar la bandeja de seguimiento."
      caption="Bandeja de seguimiento por cuenta"
      compact
      @retry="inboxQuery.refetch()"
    >
      <template #cell-status="{ row }">
        <StatusBadge :status="row.account.status" />
      </template>

      <template #cell-customer="{ row }">
        <span class="block font-medium">{{ row.account.customerName }}</span>
        <span class="block truncate font-mono text-xs text-content-muted">
          {{ row.account.externalUsername }}
        </span>
        <span class="block truncate text-xs tabular text-content-muted">
          {{ formatPhone(row.account.phone) }}
        </span>
      </template>

      <template #cell-expires="{ row }">
        <span class="block tabular">{{ formatDateKey(row.account.expiresOn) }}</span>
        <span class="block text-xs text-content-muted">
          {{ relativeDays(row.account.daysLeft) }}
        </span>
      </template>

      <template #cell-followup="{ row }">
        <div class="flex flex-col items-start gap-1">
          <FollowupBadge :status="row.followup.status" />
          <span
            v-if="row.followup.notes"
            class="line-clamp-2 max-w-[26ch] text-xs text-content-muted"
            :title="row.followup.notes"
          >
            {{ row.followup.notes }}
          </span>
        </div>
      </template>

      <!-- Último contacto y próxima acción comparten celda: dos líneas y sin
           empujar columnas esenciales bajo la columna fija de acciones. -->
      <template #cell-contact="{ row }">
        <span class="block truncate text-xs tabular text-content">
          <span class="text-content-muted">Últ. </span>
          <template v-if="row.followup.lastContactAt">
            {{ formatDate(row.followup.lastContactAt) }} · {{ limaTimeKey(row.followup.lastContactAt) }}
          </template>
          <span v-else class="text-content-muted">sin contacto</span>
        </span>
        <span
          v-if="row.followup.nextFollowupAt"
          class="block truncate text-xs tabular text-content"
        >
          <span class="text-content-muted">Próx. </span>
          {{ formatDate(row.followup.nextFollowupAt) }} · {{ limaTimeKey(row.followup.nextFollowupAt) }}
        </span>
        <span v-else class="block text-xs text-content-muted">Próx. sin programar</span>
        <span
          v-if="row.followup.nextFollowupAt && isOverdue(row.followup.nextFollowupAt)"
          class="block text-xs text-warning-text"
        >
          Atrasada
        </span>
      </template>

      <template #cell-actions="{ row }">
        <div class="dt-actions flex-wrap">
          <button
            type="button"
            class="btn"
            data-variant="secondary"
            data-size="sm"
            data-icon-only="true"
            :aria-label="`Abrir WhatsApp para ${row.account.customerName}`"
            @click="openComposer(row)"
          >
            <AppIcon name="whatsapp" :size="16" />
          </button>
          <button
            type="button"
            class="btn"
            data-variant="secondary"
            data-size="sm"
            :aria-label="`Ver cuenta ${row.account.externalUsername}`"
            @click="openAccount(row)"
          >
            Ver cuenta
          </button>
        </div>
      </template>

      <template #empty>
        <EmptyState
          :icon="hasFilters ? 'search' : 'message-circle'"
          :title="hasFilters ? 'Ninguna cuenta coincide con estos filtros' : 'Bandeja de seguimiento vacía'"
          :description="
            hasFilters
              ? 'Quita algún filtro para ver más cuentas.'
              : 'Cuando haya cuentas activas con vencimiento próximo aparecerán aquí.'
          "
        >
          <AppButton v-if="hasFilters" variant="secondary" @click="clearFilters">
            Limpiar filtros
          </AppButton>
        </EmptyState>
      </template>
    </DataTable>

    <AppPagination
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="allRows.length"
      label="Paginación de la bandeja de seguimiento"
    />

    <p class="text-xs text-content-muted">
      El orden prioriza la urgencia de SQL (<code class="font-mono">status_rank</code>) y
      luego la próxima acción más cercana. Las cuentas archivadas no entran en la bandeja.
    </p>

    <FollowupComposer
      v-model:open="composerOpen"
      :row="composerRow"
      @changed="onContactChanged"
    />
  </div>
</template>
