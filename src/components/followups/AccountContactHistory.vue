<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppSkeleton from '@/components/ui/AppSkeleton.vue'
import FollowupBadge from '@/components/ui/FollowupBadge.vue'
import { formatDateTime } from '@/lib/dates'
import { queryKeys } from '@/lib/query-keys'
import {
  getFollowup,
  listContactLogs,
  listWhatsAppTemplates,
} from '@/services/followups'
import type { ContactEventType } from '@/types/domain'

/* Historial de contactos de una cuenta: solo lectura. El mensaje se muestra
   desde `rendered_body`, el snapshot que guardó el RPC; editar la plantilla
   después no reescribe este historial. */

const props = defineProps<{ accountId: string }>()

const logsQuery = useQuery({
  queryKey: computed(() => queryKeys.followups.contacts(props.accountId)),
  queryFn: () => listContactLogs(props.accountId),
  enabled: computed(() => props.accountId.length > 0),
})

const followupQuery = useQuery({
  queryKey: computed(() => queryKeys.followups.byAccount(props.accountId)),
  queryFn: () => getFollowup(props.accountId),
  enabled: computed(() => props.accountId.length > 0),
})

const templatesQuery = useQuery({
  queryKey: queryKeys.followups.templates,
  queryFn: listWhatsAppTemplates,
})

const logs = computed(() => logsQuery.data.value ?? [])

const templateNames = computed(
  () =>
    new Map(
      (templatesQuery.data.value ?? []).map((template) => [template.key, template.name]),
    ),
)

const nextActionLabel = computed(() => {
  if (followupQuery.isPending.value) return 'cargando…'
  if (followupQuery.isError.value) return 'no disponible'
  const next = followupQuery.data.value?.nextFollowupAt
  return next ? formatDateTime(next) : 'sin programar'
})

const EVENT_LABELS: Record<ContactEventType, string> = {
  ENLACE_ABIERTO: 'Enlace abierto',
  MENSAJE_ENVIADO: 'Mensaje enviado',
  RESPUESTA_RECIBIDA: 'Respuesta recibida',
}

function templateLabel(key: string | null): string {
  if (!key) return 'Sin plantilla'
  return templateNames.value.get(key) ?? key
}
</script>

<template>
  <section aria-labelledby="cuenta-contactos">
    <div class="mb-2 flex items-center justify-between gap-2">
      <h2 id="cuenta-contactos" class="section-label">Contactos</h2>
      <span v-if="logs.length > 0" class="text-xs tabular text-content-muted">
        {{ logs.length }}
      </span>
    </div>

    <p class="mb-2 text-xs text-content-muted">
      Próxima acción:
      <span class="text-content">{{ nextActionLabel }}</span>
    </p>

    <div v-if="logsQuery.isPending.value" class="flex flex-col gap-2" aria-busy="true">
      <AppSkeleton width="100%" height="56px" rounded="lg" />
      <AppSkeleton width="100%" height="56px" rounded="lg" />
    </div>

    <AppAlert
      v-else-if="logsQuery.isError.value"
      variant="danger"
      title="No se pudo cargar el historial de contactos"
    >
      <template #actions>
        <AppButton size="sm" variant="secondary" @click="logsQuery.refetch()">
          Reintentar
        </AppButton>
      </template>
    </AppAlert>

    <p v-else-if="logs.length === 0" class="text-sm text-content-muted">
      Sin contactos registrados. Los mensajes de WhatsApp que abras desde Seguimiento
      aparecerán aquí.
    </p>

    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="log in logs"
        :key="log.id"
        class="rounded-md border border-border bg-surface-raised p-3"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-sm font-medium text-content">{{ EVENT_LABELS[log.eventType] }}</p>
            <p class="text-xs text-content-muted">
              {{ formatDateTime(log.createdAt) }} · {{ templateLabel(log.templateKey) }}
            </p>
          </div>
          <FollowupBadge
            v-if="log.followupStatusAfter"
            :status="log.followupStatusAfter"
          />
        </div>

        <p v-if="log.notes" class="mt-2 whitespace-pre-line text-sm text-content">
          {{ log.notes }}
        </p>

        <details v-if="log.renderedBody" class="mt-2">
          <summary class="cursor-pointer text-xs text-primary-text">
            Ver mensaje ({{ log.renderedBody.length }} caracteres)
          </summary>
          <pre class="mt-2 whitespace-pre-wrap break-words rounded-sm border border-border bg-surface-sunken p-2 font-sans text-sm text-content">{{ log.renderedBody }}</pre>
        </details>
      </li>
    </ul>
  </section>
</template>
