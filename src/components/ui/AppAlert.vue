<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

type AlertVariant = 'info' | 'success' | 'warning' | 'danger'

const props = withDefaults(
  defineProps<{
    variant?: AlertVariant
    title: string
    closable?: boolean
  }>(),
  { variant: 'info', closable: false },
)

const emit = defineEmits<{ close: [] }>()

const icons: Record<AlertVariant, 'info' | 'check' | 'alert-triangle' | 'alert-circle'> = {
  info: 'info',
  success: 'check',
  warning: 'alert-triangle',
  danger: 'alert-circle',
}

const style = computed(() => {
  switch (props.variant) {
    case 'success':
      return { background: 'var(--color-success-soft)', borderColor: 'var(--color-success)', color: 'var(--color-success-text)' }
    case 'warning':
      return { background: 'var(--color-warning-soft)', borderColor: 'var(--color-warning)', color: 'var(--color-warning-text)' }
    case 'danger':
      return { background: 'var(--color-danger-soft)', borderColor: 'var(--color-danger)', color: 'var(--color-danger-text)' }
    default:
      return { background: 'var(--color-info-soft)', borderColor: 'var(--color-info)', color: 'var(--color-info-text)' }
  }
})

const role = computed(() => (props.variant === 'danger' || props.variant === 'warning' ? 'alert' : 'status'))
</script>

<template>
  <div
    class="flex items-start gap-3 rounded-md border-l-[3px] border-y border-r px-4 py-3 text-sm"
    :style="{ ...style, borderTopColor: 'var(--color-border)', borderRightColor: 'var(--color-border)', borderBottomColor: 'var(--color-border)' }"
    :role="role"
  >
    <AppIcon :name="icons[variant]" :size="18" class="mt-0.5 shrink-0" />
    <div class="min-w-0 flex-1">
      <p class="font-semibold leading-5">{{ title }}</p>
      <div v-if="$slots.default" class="mt-0.5 leading-5">
        <slot />
      </div>
      <div v-if="$slots.actions" class="mt-2 flex flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
    <button
      v-if="closable"
      type="button"
      class="-m-1 inline-flex size-11 shrink-0 items-center justify-center rounded-sm"
      aria-label="Cerrar aviso"
      @click="emit('close')"
    >
      <AppIcon name="x" :size="16" />
    </button>
  </div>
</template>
