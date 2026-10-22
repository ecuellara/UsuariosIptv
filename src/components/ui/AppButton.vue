<script setup lang="ts">
import AppSpinner from './AppSpinner.vue'

/* COMPONENTES.md §1. En `loading` el botón sigue enfocable pero ignora el
   clic: nunca se envían dos operaciones por doble clic. */

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost'
    size?: 'sm' | 'md' | 'lg'
    type?: 'button' | 'submit' | 'reset'
    loading?: boolean
    disabled?: boolean
    block?: boolean
    iconOnly?: boolean
    ariaLabel?: string
  }>(),
  {
    variant: 'secondary',
    size: 'md',
    type: 'button',
    loading: false,
    disabled: false,
    block: false,
    iconOnly: false,
    ariaLabel: undefined,
  },
)

const emit = defineEmits<{ click: [event: MouseEvent] }>()

function onClick(event: MouseEvent): void {
  if (props.loading) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  emit('click', event)
}
</script>

<template>
  <button
    :type="type"
    class="btn"
    :data-variant="variant"
    :data-size="size"
    :data-block="block ? 'true' : undefined"
    :data-icon-only="iconOnly ? 'true' : undefined"
    :disabled="disabled"
    :aria-disabled="loading || undefined"
    :aria-busy="loading || undefined"
    :aria-label="ariaLabel"
    @click="onClick"
  >
    <AppSpinner v-if="loading" :size="size === 'lg' ? 18 : 16" />
    <slot v-else name="icon" />
    <span v-if="!iconOnly" class="inline-flex items-center gap-2">
      <slot />
    </span>
  </button>
</template>
