<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSwitch from '@/components/ui/AppSwitch.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import { useToast } from '@/composables/useToast'
import { toUserMessage } from '@/lib/errors'
import { queryKeys } from '@/lib/query-keys'
import {
  buildTemplateValues,
  renderTemplate,
  TEMPLATE_VARIABLES,
  validateTemplateBody,
} from '@/lib/whatsapp'
import { updateWhatsAppTemplate } from '@/services/followups'
import type { WhatsAppTemplate } from '@/types/domain'

/* Editor de una plantilla. Guarda directo en `whatsapp_templates` (la RLS lo
   permite y no hay RPC). Nunca toca `contact_logs`: el mensaje enviado quedó
   congelado en `rendered_body`. */

const props = defineProps<{ template: WhatsAppTemplate }>()

const queryClient = useQueryClient()
const toast = useToast()

const draft = reactive({
  name: props.template.name,
  body: props.template.body,
  isActive: props.template.isActive,
})

const saving = ref(false)
const error = ref<string | null>(null)
const saved = ref(false)

const dirty = computed(
  () =>
    draft.name !== props.template.name ||
    draft.body !== props.template.body ||
    draft.isActive !== props.template.isActive,
)

watch(
  () => props.template,
  (template) => {
    draft.name = template.name
    draft.body = template.body
    draft.isActive = template.isActive
  },
)

/* Ejemplo fijo en Lima + 5 días; no son datos reales ni se persisten. */
const sampleValues = buildTemplateValues({
  firstName: 'María',
  lastName: 'Quispe',
  username: 'maria.iptv',
  plan: '3 meses / 3 dispositivos',
  expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  daysLeft: 5,
})

const preview = computed(() => renderTemplate(draft.body, sampleValues))

const bodyValidation = computed(() => validateTemplateBody(draft.body))

function formatUnknownVariables(variables: string[]): string {
  return variables.map((variable) => `{${variable}}`).join(', ')
}

function reset(): void {
  draft.name = props.template.name
  draft.body = props.template.body
  draft.isActive = props.template.isActive
  error.value = null
  saved.value = false
}

async function save(): Promise<void> {
  error.value = null
  saved.value = false

  if (draft.name.trim().length < 2) {
    error.value = 'El nombre de la plantilla debe tener al menos 2 caracteres.'
    return
  }
  const validation = validateTemplateBody(draft.body)
  if (validation.error) {
    error.value = validation.error
    return
  }

  saving.value = true
  try {
    await updateWhatsAppTemplate(props.template.id, {
      name: draft.name,
      body: draft.body,
      isActive: draft.isActive,
    })
    saved.value = true
    toast.success('Plantilla guardada', {
      description: 'Los contactos anteriores conservan su mensaje original.',
    })
    await queryClient.invalidateQueries({ queryKey: queryKeys.followups.templates })
  } catch (caught) {
    error.value = toUserMessage(caught, 'No se pudo guardar la plantilla.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <article class="rounded-lg border border-border bg-surface p-4">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="font-mono text-xs text-content-muted">{{ template.key }}</p>
        <h3 class="truncate text-lg font-semibold text-content">{{ draft.name }}</h3>
      </div>
      <AppSwitch
        v-model="draft.isActive"
        label="Activa"
        :loading="saving"
        @update:model-value="saved = false"
      />
    </header>

    <div class="mt-4 flex flex-col gap-4">
      <AppInput
        v-model="draft.name"
        label="Nombre"
        :maxlength="80"
        :disabled="saving"
        @update:model-value="saved = false"
      />

      <AppTextarea
        v-model="draft.body"
        label="Cuerpo del mensaje"
        :rows="8"
        :maxlength="1200"
        hint="Escribe el texto tal como lo recibirá el cliente. Las variables se reemplazan al preparar el mensaje."
        :disabled="saving"
        @update:model-value="saved = false"
      />

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

      <div class="rounded-md border border-border bg-surface-sunken p-3" aria-live="polite">
        <p class="section-label mb-2">Vista previa con datos de ejemplo</p>
        <pre class="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-content">{{ preview.text }}</pre>
      </div>

      <AppAlert
        v-if="bodyValidation.unknown.length > 0"
        variant="warning"
        title="Variables no permitidas en el cuerpo"
      >
        {{ formatUnknownVariables(bodyValidation.unknown) }}.
        No se podrá guardar hasta corregirlas.
      </AppAlert>

      <p v-if="error" class="text-sm text-danger-text" role="alert">{{ error }}</p>
      <p v-else-if="saved" class="text-sm text-success-text" role="status">
        Plantilla guardada. El historial de contactos no se modifica.
      </p>

      <div class="flex flex-wrap items-center gap-2">
        <AppButton
          variant="primary"
          :disabled="!dirty"
          :loading="saving"
          @click="save"
        >
          <template #icon><AppIcon name="check" :size="18" /></template>
          Guardar plantilla
        </AppButton>
        <AppButton
          variant="secondary"
          :disabled="!dirty || saving"
          @click="reset"
        >
          Restablecer
        </AppButton>
      </div>
    </div>
  </article>
</template>
