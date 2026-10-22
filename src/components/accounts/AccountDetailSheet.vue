<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import AccountRenewalHistory from '@/components/accounts/AccountRenewalHistory.vue'
import AccountContactHistory from '@/components/followups/AccountContactHistory.vue'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppSheet from '@/components/ui/AppSheet.vue'
import AppSkeleton from '@/components/ui/AppSkeleton.vue'
import FollowupBadge from '@/components/ui/FollowupBadge.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { queryKeys } from '@/lib/query-keys'
import { formatDate, formatDateTime, formatPhone, relativeDays } from '@/lib/format'
import { whatsappUrl } from '@/lib/text'
import { getAccount } from '@/services/accounts'
import { useToast } from '@/composables/useToast'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{ accountId: string | null }>()

const emit = defineEmits<{
  edit: []
  renew: []
  'correct-expiration': []
  archive: []
  verify: []
}>()

const toast = useToast()

const accountQuery = useQuery({
  queryKey: computed(() => queryKeys.accounts.detail(props.accountId ?? 'none')),
  queryFn: () => getAccount(props.accountId ?? ''),
  enabled: computed(() => open.value && Boolean(props.accountId)),
})

const account = computed(() => accountQuery.data.value ?? null)
const loading = computed(() => accountQuery.isPending.value)
const loadError = computed(() => accountQuery.isError.value)

async function copyUsername(): Promise<void> {
  if (!account.value) return
  try {
    await navigator.clipboard.writeText(account.value.externalUsername)
    toast.success('Usuario copiado')
  } catch {
    toast.error('No se pudo copiar. Selecciona el texto manualmente.')
  }
}
</script>

<template>
  <AppSheet
    v-model:open="open"
    :title="account?.customerName ?? 'Cuenta IPTV'"
    :description="account ? `Usuario ${account.externalUsername}` : undefined"
  >
    <div v-if="loading" class="flex flex-col gap-3" aria-busy="true">
      <AppSkeleton width="180px" height="20px" />
      <AppSkeleton width="100%" height="14px" />
      <AppSkeleton width="100%" height="14px" />
      <AppSkeleton width="60%" height="14px" />
    </div>

    <AppAlert
      v-else-if="loadError"
      variant="danger"
      title="No se pudo cargar la cuenta"
    >
      <div class="mt-2">
        <AppButton size="sm" variant="secondary" @click="accountQuery.refetch()">
          Reintentar
        </AppButton>
      </div>
    </AppAlert>

    <template v-else-if="account">
      <section class="flex flex-wrap items-center gap-2">
        <StatusBadge :status="account.status" />
        <FollowupBadge v-if="account.followupStatus" :status="account.followupStatus" />
        <span v-if="account.isStaleVerification" class="badge badge-followup" data-followup="PENDIENTE">
          Verificación desactualizada
        </span>
      </section>

      <section aria-labelledby="cuenta-datos" class="panel p-4">
        <h2 id="cuenta-datos" class="section-label mb-3">Datos</h2>
        <dl class="grid grid-cols-[minmax(96px,120px)_minmax(0,1fr)] gap-y-2 text-base">
          <dt class="text-sm text-content-muted">Cliente</dt>
          <dd class="text-content">{{ account.customerName }}</dd>

          <dt class="text-sm text-content-muted">Teléfono</dt>
          <dd class="text-content">
            <a
              class="text-primary-text underline"
              :href="whatsappUrl(account.phone)"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ formatPhone(account.phone) }}
            </a>
          </dd>

          <dt class="text-sm text-content-muted">Usuario</dt>
          <dd class="flex items-center gap-2">
            <code class="min-w-0 truncate font-mono text-sm text-content">{{ account.externalUsername }}</code>
            <button
              type="button"
              class="inline-flex size-9 items-center justify-center rounded-sm text-content-muted hover:bg-surface-hover hover:text-content"
              aria-label="Copiar usuario externo"
              @click="copyUsername"
            >
              <AppIcon name="copy" :size="16" />
            </button>
          </dd>

          <dt class="text-sm text-content-muted">Referencia</dt>
          <dd class="text-content">{{ account.reference ?? '—' }}</dd>

          <dt class="text-sm text-content-muted">Comprada</dt>
          <dd class="tabular text-content">{{ formatDateTime(account.purchasedAt) }}</dd>

          <dt class="text-sm text-content-muted">Vence</dt>
          <dd class="text-content">
            <span class="tabular">{{ formatDateTime(account.expiresAt) }}</span>
            <span class="text-content-muted"> · {{ relativeDays(account.daysLeft) }}</span>
          </dd>

          <dt class="text-sm text-content-muted">Verificada</dt>
          <dd class="text-content">
            {{ account.lastVerifiedAt ? formatDateTime(account.lastVerifiedAt) : 'Sin verificar' }}
          </dd>

          <dt class="text-sm text-content-muted">Notas</dt>
          <dd class="whitespace-pre-line text-content">{{ account.notes ?? 'Sin notas' }}</dd>
        </dl>
      </section>

      <section class="rounded-md border border-border bg-surface-sunken px-3 py-2 text-sm text-content-muted">
        <template v-if="account.reference">
          La contraseña se gestiona fuera de este panel (referencia: “{{ account.reference }}”).
        </template>
        <template v-else>
          La contraseña se gestiona fuera de este panel.
        </template>
        No se almacena aquí (ADR-002).
      </section>

      <section class="panel p-4">
        <AccountContactHistory :account-id="account.id" />
      </section>

      <section class="panel p-4">
        <AccountRenewalHistory
          :account-id="account.id"
          :initial-expires-at="account.initialExpiresAt"
          @changed="accountQuery.refetch()"
        />
      </section>

      <section aria-labelledby="cuenta-acciones">
        <h2 id="cuenta-acciones" class="section-label mb-2">Acciones</h2>
        <div class="grid gap-2 sm:grid-cols-2">
          <AppButton variant="primary" class="sm:col-span-2" @click="emit('renew')">
            <template #icon><AppIcon name="refresh" :size="18" /></template>
            Registrar renovación
          </AppButton>
          <AppButton variant="secondary" @click="emit('edit')">
            <template #icon><AppIcon name="pencil" :size="18" /></template>
            Editar datos
          </AppButton>
          <AppButton variant="secondary" @click="emit('correct-expiration')">
            <template #icon><AppIcon name="calendar" :size="18" /></template>
            Corregir vencimiento
          </AppButton>
          <AppButton variant="secondary" @click="emit('verify')">
            <template #icon><AppIcon name="check" :size="18" /></template>
            Marcar verificada hoy
          </AppButton>
          <AppButton
            :variant="account.archivedAt ? 'secondary' : 'danger-ghost'"
            @click="emit('archive')"
          >
            <template #icon><AppIcon name="archive" :size="18" /></template>
            {{ account.archivedAt ? 'Reactivar cuenta' : 'Archivar cuenta' }}
          </AppButton>
        </div>
        <p class="mt-2 text-xs text-content-muted">
          Archivar conserva el historial: la cuenta deja de contar en los vencimientos.
        </p>
      </section>

      <p class="text-xs text-content-muted">
        Fecha de la última actualización del registro: {{ formatDate(account.updatedAt) }}.
      </p>
    </template>
  </AppSheet>
</template>
