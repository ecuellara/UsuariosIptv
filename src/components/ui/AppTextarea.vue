<script setup lang="ts">
import { computed } from 'vue'
import FormField from './FormField.vue'

const model = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    label?: string
    hint?: string
    error?: string | null
    required?: boolean
    disabled?: boolean
    readonly?: boolean
    placeholder?: string
    rows?: number
    maxlength?: number
    hideLabel?: boolean
  }>(),
  {
    label: undefined,
    hint: undefined,
    error: null,
    required: false,
    disabled: false,
    readonly: false,
    placeholder: undefined,
    rows: 3,
    maxlength: undefined,
    hideLabel: false,
  },
)

const counter = computed(() => {
  if (!props.maxlength) return null
  return `${model.value.length}/${props.maxlength}`
})

const nearLimit = computed(() => {
  if (!props.maxlength) return false
  return model.value.length >= props.maxlength * 0.9
})
</script>

<template>
  <FormField :label="label" :hint="hint" :error="error" :required="required" :hide-label="hideLabel">
    <template #default="{ id, describedBy, invalid }">
      <div class="flex flex-col gap-1">
        <div
          class="field-control !items-start !py-2"
          :aria-invalid="invalid || undefined"
          :data-readonly="readonly ? 'true' : undefined"
        >
          <textarea
            :id="id"
            v-model="model"
            :rows="rows"
            :placeholder="placeholder"
            :disabled="disabled"
            :readonly="readonly"
            :maxlength="maxlength"
            :aria-describedby="describedBy"
            :aria-invalid="invalid || undefined"
            :required="required"
            class="resize-y"
          />
        </div>
        <span
          v-if="counter"
          class="self-end text-xs"
          :class="nearLimit ? 'text-warning-text' : 'text-content-muted'"
        >
          {{ counter }}
        </span>
      </div>
    </template>
  </FormField>
</template>
