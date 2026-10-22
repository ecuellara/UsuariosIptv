<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import AccountActionsHost from '@/components/accounts/AccountActionsHost.vue'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppSkeleton from '@/components/ui/AppSkeleton.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import CustomerFormModal from '@/components/customers/CustomerFormModal.vue'
import { useToast } from '@/composables/useToast'
import { formatDate, formatDateTime, formatPhone, relativeDays } from '@/lib/format'
import { toUserMessage } from '@/lib/errors'
import { queryKeys } from '@/lib/query-keys'
import { whatsappUrl } from '@/lib/text'
import { listAccounts } from '@/services/accounts'
import { countActiveAccounts, getCustomer, updateCustomer } from '@/services/customers'
import type { Account } from '@/types/domain'

const route = useRoute()
const queryClient = useQueryClient()
const toast = useToast()

const customerId = computed(() => {
  const value = route.params.customerId
  return typeof value === 'string' ? value : ''
})

const customerQuery = useQuery({
  queryKey: computed(() => queryKeys.customers.detail(customerId.value)),
  queryFn: () => getCustomer(customerId.value),
  enabled: computed(() => customerId.value.length > 0),
})

const accountsQuery = useQuery({
  queryKey: computed(() => queryKeys.accounts.byCustomer(customerId.value)),
  queryFn: () => listAccounts({ customerId: customerId.value, includeArchived: true, pageSize: 50 }),
  enabled: computed(() => customerId.value.length > 0),
})

const customer = computed(() => customerQuery.data.value ?? null)
const accounts = computed(() => accountsQuery.data.value?.rows ?? [])
const loading = computed(() => customerQuery.isPending.value)
const loadError = computed(() => customerQuery.error.value)
const notFound = computed(() => customerQuery.isSuccess.value && customer.value === null)

const accountActions = ref<InstanceType<typeof AccountActionsHost> | null>(null)
const formOpen = ref(false)
const confirmOpen = ref(false)
const confirmLoading = ref(false)
const confirmError = ref<string | null>(null)

async function copyPhone(): Promise<void> {
  if (!customer.value) return
  try {
    await navigator.clipboard.writeText(customer.value.phone)
    toast.success('Teléfono copiado')
  } catch {
    toast.error('No se pudo copiar. Selecciona el número manualmente.')
  }
}

function openAccount(account: Account): void {
  accountActions.value?.openDetail(account)
}

function createAccount(): void {
  accountActions.value?.openCreate(customer.value?.id, customer.value?.firstName)
}

function openRenewal(account?: Account): void {
  const active = account ?? accounts.value.find((candidate) => !candidate.archivedAt) ?? null
  accountActions.value?.openRenewal({
    account: active,
    customerId: customer.value?.id ?? null,
    customerName: customer.value
      ? `${customer.value.firstName} ${customer.value.lastName}`
      : null,
  })
}

async function toggleArchive(): Promise<void> {
  if (!customer.value) return
  confirmLoading.value = true
  confirmError.value = null
  const archiving = customer.value.archivedAt === null
  try {
    if (archiving) {
      const active = await countActiveAccounts(customer.value.id)
      if (active > 0) {
        confirmError.value = 'Archiva o reasigna sus cuentas primero.'
        return
      }
    }
    await updateCustomer(customer.value.id, {
      archived_at: archiving ? new Date().toISOString() : null,
    })
    toast.success(archiving ? 'Cliente archivado' : 'Cliente reactivado')
    confirmOpen.value = false
    await queryClient.invalidateQueries({ queryKey: queryKeys.customers.all })
  } catch (error) {
    confirmError.value = toUserMessage(error, 'No se pudo cambiar el estado del cliente.')
  } finally {
    confirmLoading.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <RouterLink :to="{ name: 'customers' }" class="text-sm text-primary-text underline">
        ← Volver a clientes
      </RouterLink>
    </div>

    <div v-if="loading" class="flex flex-col gap-3" aria-busy="true">
      <AppSkeleton width="220px" height="24px" />
      <AppSkeleton width="160px" height="16px" />
      <AppSkeleton width="100%" height="96px" />
    </div>

    <AppAlert
      v-else-if="loadError"
      variant="danger"
      title="No se pudo cargar este cliente"
    >
      <template #actions>
        <AppButton size="sm" variant="secondary" @click="customerQuery.refetch()">Reintentar</AppButton>
        <RouterLink :to="{ name: 'customers' }" class="btn" data-variant="ghost" data-size="sm">
          Volver a clientes
        </RouterLink>
      </template>
    </AppAlert>

    <EmptyState
      v-else-if="notFound"
      icon="users"
      title="No encontramos este cliente"
      description="Puede haberse archivado o el enlace estar mal."
    >
      <RouterLink :to="{ name: 'customers' }" class="btn" data-variant="primary">
        Volver a clientes
      </RouterLink>
    </EmptyState>

    <template v-else-if="customer">
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-2xl font-semibold text-content">
              {{ customer.firstName }} {{ customer.lastName }}
            </h1>
            <span
              v-if="customer.archivedAt"
              class="badge"
              :style="{ color: 'var(--status-archivada-fg)', background: 'var(--status-archivada-bg)', borderStyle: 'dashed', borderColor: 'var(--status-archivada-border)' }"
            >
              Archivado
            </span>
          </div>

          <div class="mt-2 flex flex-wrap items-center gap-2 text-base">
            <a
              class="tabular text-primary-text underline"
              :href="whatsappUrl(customer.phone)"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ formatPhone(customer.phone) }}
            </a>
            <button
              type="button"
              class="inline-flex size-9 items-center justify-center rounded-sm text-content-muted hover:bg-surface-hover hover:text-content"
              aria-label="Copiar teléfono"
              @click="copyPhone"
            >
              <AppIcon name="copy" :size="16" />
            </button>
            <span class="text-xs text-content-muted">
              Alta: {{ formatDate(customer.createdAt) }}
            </span>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <AppButton variant="secondary" @click="formOpen = true">
            <template #icon><AppIcon name="pencil" :size="18" /></template>
            Editar cliente
          </AppButton>
          <AppButton variant="secondary" @click="openRenewal()">
            <template #icon><AppIcon name="refresh" :size="18" /></template>
            Registrar renovación
          </AppButton>
          <AppButton variant="primary" @click="createAccount">
            <template #icon><AppIcon name="plus" :size="18" /></template>
            Nueva cuenta
          </AppButton>
          <AppButton
            :variant="customer.archivedAt ? 'secondary' : 'danger-ghost'"
            @click="confirmOpen = true"
          >
            <template #icon><AppIcon name="archive" :size="18" /></template>
            {{ customer.archivedAt ? 'Reactivar' : 'Archivar' }}
          </AppButton>
        </div>
      </header>

      <section aria-labelledby="cuentas-cliente" class="flex flex-col gap-3">
        <div class="flex items-end justify-between gap-3">
          <div>
            <h2 id="cuentas-cliente" class="text-2xl font-semibold text-content">Cuentas IPTV</h2>
            <p class="text-sm text-content-muted">
              El estado se lee de la vista de cuentas; aquí no se calcula.
            </p>
          </div>
        </div>

        <div v-if="accountsQuery.isPending.value" class="grid gap-3 md:grid-cols-2">
          <AppSkeleton width="100%" height="120px" rounded="lg" />
          <AppSkeleton width="100%" height="120px" rounded="lg" />
        </div>

        <AppAlert
          v-else-if="accountsQuery.isError.value"
          variant="danger"
          title="No se pudieron cargar las cuentas"
        >
          <template #actions>
            <AppButton size="sm" variant="secondary" @click="accountsQuery.refetch()">
              Reintentar
            </AppButton>
          </template>
        </AppAlert>

        <EmptyState
          v-else-if="accounts.length === 0"
          icon="tv"
          title="Sin cuentas registradas"
          description="Registra el usuario del panel del proveedor para controlar su vencimiento."
        >
          <AppButton variant="primary" @click="createAccount">Agregar cuenta</AppButton>
        </EmptyState>

        <ul v-else class="grid gap-3 md:grid-cols-2">
          <li
            v-for="account in accounts"
            :key="account.id"
            class="panel flex flex-col gap-2 p-4"
          >
            <div class="flex items-start justify-between gap-2">
              <StatusBadge :status="account.status" />
              <span class="text-xs text-content-muted">{{ relativeDays(account.daysLeft) }}</span>
            </div>

            <div class="min-w-0">
              <p class="truncate font-mono text-sm text-content">{{ account.externalUsername }}</p>
              <p class="mt-0.5 text-sm text-content-muted">
                Vence {{ formatDateTime(account.expiresAt) }}
              </p>
              <p v-if="account.reference" class="mt-0.5 truncate text-xs text-content-muted">
                Referencia: {{ account.reference }}
              </p>
            </div>

            <div class="mt-auto flex items-center gap-2 pt-2">
              <AppButton size="sm" variant="secondary" @click="openAccount(account)">
                Abrir ficha
              </AppButton>
              <AppButton
                v-if="!account.archivedAt"
                size="sm"
                variant="ghost"
                @click="openRenewal(account)"
              >
                Renovar
              </AppButton>
            </div>
          </li>
        </ul>
      </section>

      <section class="panel p-4" aria-labelledby="notas-cliente">
        <h2 id="notas-cliente" class="section-label mb-2">Notas</h2>
        <p class="whitespace-pre-line text-base text-content">
          {{ customer.notes ?? 'Sin notas.' }}
        </p>
      </section>

      <AppAlert variant="info" title="Historial y seguimiento">
        El historial de renovaciones, cobros y contactos vive en la ficha de cada cuenta.
        Ábrela desde la lista de cuentas de este cliente. Los importes y márgenes se calculan
        en SQL.
      </AppAlert>
    </template>

    <CustomerFormModal v-model:open="formOpen" :customer="customer" />

    <AccountActionsHost ref="accountActions" />

    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="customer?.archivedAt ? 'Reactivar cliente' : 'Archivar cliente'"
      :body="
        customer?.archivedAt
          ? 'El cliente volverá a aparecer en la lista. Sus cuentas no cambian.'
          : 'El cliente dejará de aparecer en la lista por defecto. No se permite archivarlo si tiene cuentas activas.'
      "
      :confirm-label="customer?.archivedAt ? 'Reactivar cliente' : 'Archivar cliente'"
      :destructive="!customer?.archivedAt"
      :loading="confirmLoading"
      :error="confirmError"
      @confirm="toggleArchive"
    />
  </div>
</template>
