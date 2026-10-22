<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import AppButton from './AppButton.vue'
import AppIcon from './AppIcon.vue'
import AppTextarea from './AppTextarea.vue'
import AppModal from './AppModal.vue'

/* COMPONENTES.md §17. El cuerpo dice qué va a pasar; el botón nombra la
   acción. Con motivo obligatorio, confirmar se bloquea hasta 5 caracteres. */

const open = defineModel<boolean>('open', { default: false })

const props = withDefaults(
  defineProps<{
    title: string
    body: string
    confirmLabel: string
    cancelLabel?: string
    destructive?: boolean
    requireReason?: boolean
    reasonLabel?: string
    loading?: boolean
    error?: string | null
  }>(),
  {
    cancelLabel: 'Cancelar',
    destructive: false,
    requireReason: false,
    reasonLabel: 'Motivo',
    loading: false,
    error: null,
  },
)

const emit = defineEmits<{ confirm: [reason: string] }>()

const reason = ref('')
const cancelRef = ref<InstanceType<typeof AppButton> | null>(null)
const reasonError = ref<string | null>(null)

watch(open, async (value) => {
  if (!value) {
    reason.value = ''
    reasonError.value = null
    return
  }
  await nextTick()
  const element = cancelRef.value?.$el
  if (element instanceof HTMLElement) element.focus()
})

function confirm(): void {
  if (props.requireReason && reason.value.trim().length < 5) {
    reasonError.value = 'Escribe al menos 5 caracteres.'
    return
  }
  reasonError.value = null
  emit('confirm', reason.value.trim())
}
</script>

<template>
  <AppModal
    v-model:open="open"
    :title="title"
    :prevent-close="loading"
    width="sm"
  >
    <div class="flex gap-3">
      <span
        class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full"
        :style="{
          background: destructive ? 'var(--color-danger-soft)' : 'var(--color-primary-soft)',
          color: destructive ? 'var(--color-danger-text)' : 'var(--color-primary-soft-fg)',
        }"
        aria-hidden="true"
      >
        <AppIcon :name="destructive ? 'alert-triangle' : 'info'" :size="18" />
      </span>
      <p class="text-base leading-5 text-content">{{ body }}</p>
    </div>

    <div v-if="requireReason" class="mt-4">
      <AppTextarea
        v-model="reason"
        :label="reasonLabel"
        :error="reasonError"
        :disabled="loading"
        :required="true"
        :rows="2"
        :maxlength="500"
      />
    </div>

    <p v-if="error" class="mt-3 text-sm text-danger-text" role="alert">{{ error }}</p>

    <template #footer>
      <AppButton ref="cancelRef" variant="secondary" :disabled="loading" @click="open = false">
        {{ cancelLabel }}
      </AppButton>
      <AppButton
        :variant="destructive ? 'danger' : 'primary'"
        :loading="loading"
        @click="confirm"
      >
        {{ confirmLabel }}
      </AppButton>
    </template>
  </AppModal>
</template>
