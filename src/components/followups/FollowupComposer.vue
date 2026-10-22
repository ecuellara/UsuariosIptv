<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import FollowupBadge from '@/components/ui/FollowupBadge.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useToast } from '@/composables/useToast'
import { toUserMessage } from '@/lib/errors'
import {
  formatDateKey,
  formatDateTime,
  formatPhone,
  relativeDays,
} from '@/lib/format'
import { queryKeys } from '@/lib/query-keys'
import {
  buildTemplateValues,
  buildWhatsAppUrl,
  renderTemplate,
  TEMPLATE_VARIABLES,
  type TemplateValues,
} from '@/lib/whatsapp'
import {
  getCustomerNameParts,
  getLastPlanName,
  listWhatsAppTemplates,
} from '@/services/followups'
import { updateFollowup } from '@/services/rpc'
import type { FollowupInboxRow, WhatsAppTemplate } from '@/types/domain'

/* Redactor de WhatsApp. La app NUNCA envía: abre `wa.me` y después el admin
   confirma «Marcar como enviado». Cada acción deja su contacto por RPC.
   Las claves de idempotencia se generan al abrir el diálogo y se reutilizan
   en los reintentos; nunca por clic. */

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{ row: FollowupInboxRow | null }>()

const emit = defineEmits<{ changed: [] }>()

const toast = useToast()

const accountId = computed(() => props.row?.account.id ?? '')

const templatesQuery = useQuery({
  queryKey: queryKeys.followups.templates,
  queryFn: listWhatsAppTemplates,
  enabled: open,
})

const planQuery = useQuery({
  queryKey: computed(() => queryKeys.followups.plan(accountId.value || 'none')),
  queryFn: () => getLastPlanName(accountId.value),
  enabled: computed(() => open.value && Boolean(accountId.value)),
})

const customerQuery = useQuery({
  queryKey: computed(() =>
    queryKeys.followups.customer(props.row?.account.customerId ?? 'none'),
  ),
  queryFn: () => getCustomerNameParts(props.row?.account.customerId ?? ''),
  enabled: computed(() => open.value && Boolean(props.row)),
})

const activeTemplates = computed(() =>
  (templatesQuery.data.value ?? []).filter((template) => template.isActive),
)

const templateOptions = computed(() =>
  activeTemplates.value.map((template) => ({
    value: template.key,
    label: template.name,
    secondary: template.key,
  })),
)

const selectedKey = ref<string | null>(null)
const selectedTemplate = computed<WhatsAppTemplate | null>(
  () => activeTemplates.value.find((template) => template.key === selectedKey.value) ?? null,
)

function defaultTemplateKey(templates: WhatsAppTemplate[]): string | null {
  const followup = props.row?.followup.status
  const accountStatus = props.row?.account.status
  const preferred =
    followup === 'CONFIRMADO' || followup === 'RENOVADO'
      ? 'RENOVACION_CONFIRMADA'
      : accountStatus === 'VENCIDA'
        ? 'VENCIDO'
        : 'RECORDATORIO'
  return templates.find((template) => template.key === preferred)?.key ?? templates[0]?.key ?? null
}

const linkKey = ref('')
const sentKey = ref('')
const responseKey = ref('')

const linkAttempted = ref(false)
const linkLogged = ref(false)
const linkLogging = ref(false)
const sentLogged = ref(false)
const sending = ref(false)
const actionError = ref<string | null>(null)

const responseOpen = ref(false)
const responseNotes = ref('')
const nextFollowupAt = ref<string | null>(null)
const responseSaving = ref(false)
const responseSaved = ref(false)
const responseError = ref<string | null>(null)

const openedSnapshot = ref<{
  templateKey: string
  renderedBody: string
  waUrl: string
} | null>(null)

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    linkKey.value = crypto.randomUUID()
    sentKey.value = crypto.randomUUID()
    responseKey.value = crypto.randomUUID()
    linkAttempted.value = false
    linkLogged.value = false
    linkLogging.value = false
    sentLogged.value = false
    sending.value = false
    actionError.value = null
    responseOpen.value = false
    responseNotes.value = ''
    nextFollowupAt.value = null
    responseSaving.value = false
    responseSaved.value = false
    responseError.value = null
    openedSnapshot.value = null
    selectedKey.value = defaultTemplateKey(activeTemplates.value)
  },
  { immediate: true },
)

/* Si las plantillas llegan después de abrir, se elige la primera válida. */
watch(activeTemplates, (templates) => {
  if (!open.value) return
  if (
    selectedKey.value &&
    templates.some((template) => template.key === selectedKey.value)
  ) {
    return
  }
  selectedKey.value = defaultTemplateKey(templates)
})

const values = computed<TemplateValues>(() =>
  buildTemplateValues({
    firstName:
      customerQuery.data.value?.firstName ??
      props.row?.account.customerName ??
      '',
    lastName: customerQuery.data.value?.lastName ?? '',
    username: props.row?.account.externalUsername ?? '',
    plan: planQuery.data.value ?? null,
    expiresAt: props.row?.account.expiresAt ?? new Date().toISOString(),
    daysLeft: props.row?.account.daysLeft ?? 0,
  }),
)

const rendered = computed(() =>
  selectedTemplate.value
    ? renderTemplate(selectedTemplate.value.body, values.value)
    : { text: '', unknown: [] as string[] },
)

const contextReady = computed(
  () => customerQuery.isSuccess.value && planQuery.isSuccess.value,
)

const waUrl = computed(() => {
  if (!selectedTemplate.value || !contextReady.value) return ''
  return buildWhatsAppUrl(props.row?.account.phone ?? '', rendered.value.text)
})

const planLabel = computed(() => {
  if (planQuery.isPending.value) return 'cargando…'
  if (planQuery.isError.value) return 'no disponible'
  return planQuery.data.value ?? 'sin plan'
})

function formatUnknownVariables(variables: string[]): string {
  return variables.map((variable) => `{${variable}}`).join(', ')
}

async function onOpenLink(): Promise<void> {
  if (!waUrl.value || linkLogged.value || linkLogging.value) return
  linkAttempted.value = true
  linkLogging.value = true
  actionError.value = null

  const snapshot = {
    templateKey: selectedTemplate.value?.key ?? '',
    renderedBody: rendered.value.text,
    waUrl: waUrl.value,
  }
  openedSnapshot.value = snapshot

  try {
    await updateFollowup({
      accountId: accountId.value,
      templateKey: snapshot.templateKey,
      renderedBody: snapshot.renderedBody,
      waUrl: snapshot.waUrl,
      eventType: 'ENLACE_ABIERTO',
      idempotencyKey: linkKey.value,
    })
    linkLogged.value = true
    emit('changed')
  } catch (error) {
    actionError.value = toUserMessage(
      error,
      'WhatsApp se abrió, pero no se pudo registrar el contacto.',
    )
  } finally {
    linkLogging.value = false
  }
}

async function markAsSent(): Promise<void> {
  if (sentLogged.value || sending.value || !linkLogged.value) return
  sending.value = true
  actionError.value = null

  const snapshot = openedSnapshot.value ?? {
    templateKey: selectedTemplate.value?.key ?? '',
    renderedBody: rendered.value.text,
    waUrl: waUrl.value,
  }

  try {
    await updateFollowup({
      accountId: accountId.value,
      status: 'CONTACTADO',
      templateKey: snapshot.templateKey,
      renderedBody: snapshot.renderedBody,
      waUrl: snapshot.waUrl,
      eventType: 'MENSAJE_ENVIADO',
      idempotencyKey: sentKey.value,
    })
    sentLogged.value = true
    toast.success('Mensaje marcado como enviado', {
      description: 'El seguimiento quedó en Contactado.',
    })
    emit('changed')
  } catch (error) {
    actionError.value = toUserMessage(
      error,
      'No se pudo registrar el mensaje enviado.',
    )
  } finally {
    sending.value = false
  }
}

async function saveResponse(): Promise<void> {
  if (responseSaved.value || responseSaving.value) return
  const notes = responseNotes.value.trim()
  if (notes.length === 0 && !nextFollowupAt.value) {
    responseError.value = 'Escribe la respuesta o elige una próxima acción.'
    return
  }

  responseSaving.value = true
  responseError.value = null
  try {
    await updateFollowup({
      accountId: accountId.value,
      status: 'EN_CONVERSACION',
      eventType: 'RESPUESTA_RECIBIDA',
      ...(notes.length > 0 ? { notes } : {}),
      ...(nextFollowupAt.value ? { nextFollowupAt: nextFollowupAt.value } : {}),
      idempotencyKey: responseKey.value,
    })
    responseSaved.value = true
    responseOpen.value = false
    toast.success('Respuesta registrada', {
      description: 'El seguimiento quedó en En conversación.',
    })
    emit('changed')
  } catch (error) {
    responseError.value = toUserMessage(error, 'No se pudo registrar la respuesta.')
  } finally {
    responseSaving.value = false
  }
}
</script>

<template>
  <AppModal
    v-model:open="open"
    :title="row ? `WhatsApp · ${row.account.customerName}` : 'WhatsApp'"
    :description="row ? `Usuario ${row.account.externalUsername}` : undefined"
    width="lg"
  >
    <div v-if="!row" class="text-sm text-content-muted">Sin cuenta seleccionada.</div>

    <div v-else class="flex flex-col gap-4">
      <section class="rounded-md border border-border bg-surface-sunken p-3" aria-label="Datos de la cuenta">
        <div class="flex flex-wrap items-center gap-2">
          <StatusBadge :status="row.account.status" />
          <FollowupBadge :status="row.followup.status" />
          <span class="text-xs text-content-muted">
            {{ formatDateKey(row.account.expiresOn) }} · {{ relativeDays(row.account.daysLeft) }}
          </span>
        </div>
        <dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div>
            <dt class="text-xs text-content-muted">Teléfono</dt>
            <dd class="text-content">{{ formatPhone(row.account.phone) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-content-muted">Último plan</dt>
            <dd class="truncate text-content" :title="planLabel">{{ planLabel }}</dd>
          </div>
          <div>
            <dt class="text-xs text-content-muted">Último contacto</dt>
            <dd class="text-content">
              {{ row.followup.lastContactAt ? formatDateTime(row.followup.lastContactAt) : 'Sin contacto' }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-content-muted">Próxima acción</dt>
            <dd class="text-content">
              {{ row.followup.nextFollowupAt ? formatDateTime(row.followup.nextFollowupAt) : 'Sin programar' }}
            </dd>
          </div>
        </dl>
      </section>

      <div v-if="templatesQuery.isPending.value" class="flex flex-col gap-2" aria-busy="true">
        <p class="text-sm text-content-muted">Cargando plantillas…</p>
      </div>

      <AppAlert
        v-else-if="templatesQuery.isError.value"
        variant="danger"
        title="No se pudieron cargar las plantillas"
      >
        <template #actions>
          <AppButton size="sm" variant="secondary" @click="templatesQuery.refetch()">
            Reintentar
          </AppButton>
        </template>
      </AppAlert>

      <AppAlert
        v-else-if="activeTemplates.length === 0"
        variant="warning"
        title="No hay plantillas activas"
      >
        Activa una plantilla en Configuración para poder preparar el mensaje.
      </AppAlert>

      <template v-else>
        <AppSelect
          v-model="selectedKey"
          :options="templateOptions"
          label="Plantilla"
          hint="Solo se muestran las plantillas activas."
          :disabled="linkAttempted || sentLogged"
        />

        <div v-if="selectedTemplate" class="flex flex-col gap-3">
          <div>
            <p class="field-label mb-1">Variables permitidas</p>
            <ul class="flex flex-wrap gap-1">
              <li
                v-for="variable in TEMPLATE_VARIABLES"
                :key="variable"
                class="rounded-sm border border-border bg-surface-sunken px-1.5 py-0.5 font-mono text-xs text-content-muted"
              >
                {{ '{' + variable + '}' }}
              </li>
            </ul>
          </div>

          <div class="rounded-md border border-border bg-surface-raised p-3" aria-live="polite">
            <p class="section-label mb-2">Vista previa</p>
            <pre class="whitespace-pre-wrap break-words font-sans text-base leading-6 text-content">{{ rendered.text }}</pre>
          </div>

          <AppAlert
            v-if="rendered.unknown.length > 0"
            variant="warning"
            title="Hay variables sin reemplazar"
          >
            {{ formatUnknownVariables(rendered.unknown) }}
            no está en la lista permitida; se enviará tal cual.
          </AppAlert>

          <p v-if="!contextReady" class="text-xs text-content-muted">
            Preparando el plan y el nombre del cliente…
          </p>

          <div class="flex flex-wrap items-center gap-2">
            <a
              v-if="waUrl"
              class="btn"
              data-variant="primary"
              :href="waUrl"
              target="_blank"
              rel="noopener noreferrer"
              :aria-disabled="linkLogging || undefined"
              @click="onOpenLink"
            >
              <AppIcon name="whatsapp" :size="18" />
              Abrir WhatsApp
            </a>
            <button v-else type="button" class="btn" data-variant="primary" disabled>
              <AppIcon name="whatsapp" :size="18" />
              Abrir WhatsApp
            </button>

            <span v-if="linkLogged" class="badge badge-followup" data-followup="CONTACTADO">
              Enlace registrado
            </span>
          </div>

          <p class="text-xs text-content-muted">
            La app no envía nada: abre el chat con el texto listo. Después confirma el envío
            para dejar el seguimiento al día.
          </p>
        </div>
      </template>

      <AppAlert v-if="actionError" variant="danger" title="No se pudo registrar el contacto">
        {{ actionError }}
      </AppAlert>

      <section
        v-if="linkLogged"
        class="rounded-md border border-border bg-surface p-3"
        aria-labelledby="followup-enviado"
      >
        <h2 id="followup-enviado" class="section-label mb-2">Confirmar envío</h2>
        <div class="flex flex-wrap items-center gap-2">
          <AppButton
            variant="primary"
            :loading="sending"
            :disabled="sentLogged"
            @click="markAsSent"
          >
            <template #icon><AppIcon name="check" :size="18" /></template>
            Marcar como enviado
          </AppButton>
          <span
            v-if="sentLogged"
            class="badge badge-followup"
            data-followup="CONTACTADO"
          >
            Enviado registrado
          </span>
        </div>
        <p v-if="sentLogged" class="mt-2 text-xs text-content-muted">
          El seguimiento quedó en Contactado y el último contacto se actualizó.
        </p>
      </section>

      <section class="rounded-md border border-border bg-surface p-3" aria-labelledby="followup-respuesta">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 id="followup-respuesta" class="section-label">Respuesta del cliente</h2>
          <AppButton
            v-if="!responseOpen && !responseSaved"
            variant="secondary"
            size="sm"
            @click="responseOpen = true"
          >
            <template #icon><AppIcon name="message-circle" :size="16" /></template>
            Registrar respuesta
          </AppButton>
        </div>

        <AppAlert
          v-if="responseSaved"
          class="mt-2"
          variant="success"
          title="Respuesta registrada"
        >
          El seguimiento quedó en En conversación.
        </AppAlert>

        <form
          v-else-if="responseOpen"
          class="mt-3 flex flex-col gap-3"
          novalidate
          @submit.prevent="saveResponse"
        >
          <AppTextarea
            v-model="responseNotes"
            label="Respuesta o nota"
            :rows="3"
            :maxlength="1000"
            hint="Qué respondió el cliente o qué acordaron."
            :disabled="responseSaving"
          />

          <AppDatePicker
            v-model="nextFollowupAt"
            label="Próxima acción (opcional)"
            :with-time="true"
            :disabled="responseSaving"
          />

          <div class="flex flex-wrap items-center gap-2">
            <AppButton
              type="submit"
              variant="primary"
              :loading="responseSaving"
              :disabled="responseSaved"
            >
              Guardar respuesta
            </AppButton>
            <AppButton
              variant="secondary"
              :disabled="responseSaving"
              @click="nextFollowupAt = null"
            >
              Quitar fecha
            </AppButton>
            <AppButton
              variant="ghost"
              :disabled="responseSaving"
              @click="responseOpen = false"
            >
              Cancelar
            </AppButton>
          </div>

          <p v-if="responseError" class="text-sm text-danger-text" role="alert">
            {{ responseError }}
          </p>
        </form>

        <p v-else class="mt-2 text-xs text-content-muted">
          Registra lo que respondió el cliente para mover el seguimiento a En conversación.
        </p>
      </section>
    </div>

    <template #footer>
      <AppButton variant="secondary" @click="open = false">Cerrar</AppButton>
    </template>
  </AppModal>
</template>
