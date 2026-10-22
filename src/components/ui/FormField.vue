<script setup lang="ts">
import { computed, useId } from 'vue'
import AppIcon from './AppIcon.vue'

/* Label siempre visible + hint o error con `aria-describedby`.
   Nunca se usa el placeholder como etiqueta (DESIGN.md §8). */

const props = withDefaults(
  defineProps<{
    label?: string
    hint?: string
    error?: string | null
    required?: boolean
    fieldId?: string
    hideLabel?: boolean
  }>(),
  {
    label: undefined,
    hint: undefined,
    error: null,
    required: false,
    fieldId: undefined,
    hideLabel: false,
  },
)

const uid = useId()
const id = computed(() => props.fieldId ?? `field-${uid}`)
const hintId = computed(() => `${id.value}-hint`)
const errorId = computed(() => `${id.value}-error`)
const describedBy = computed(() => {
  if (props.error) return errorId.value
  if (props.hint) return hintId.value
  return undefined
})
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label
      v-if="label"
      :for="id"
      class="field-label"
      :class="hideLabel ? 'sr-only' : undefined"
    >
      {{ label }}
      <span v-if="required" class="field-required" aria-hidden="true">*</span>
      <span v-if="required" class="sr-only">(obligatorio)</span>
    </label>

    <slot
      :id="id"
      :described-by="describedBy"
      :invalid="Boolean(error)"
    />

    <p
      v-if="error"
      :id="errorId"
      class="field-error"
      role="alert"
    >
      <AppIcon name="alert-circle" :size="14" class="mt-0.5 shrink-0" />
      <span>{{ error }}</span>
    </p>
    <p v-else-if="hint" :id="hintId" class="field-hint">{{ hint }}</p>
  </div>
</template>
