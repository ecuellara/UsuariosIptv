<script setup lang="ts">
import type { IconName } from './AppIcon.vue'
import AppIcon from './AppIcon.vue'
import FormField from './FormField.vue'

const model = defineModel<string>({ default: '' })

withDefaults(
  defineProps<{
    label?: string
    hint?: string
    error?: string | null
    required?: boolean
    disabled?: boolean
    readonly?: boolean
    placeholder?: string
    type?: 'text' | 'email' | 'password' | 'search' | 'tel'
    autocomplete?: string
    inputmode?: 'text' | 'numeric' | 'decimal' | 'search' | 'tel' | 'email'
    size?: 'md' | 'lg'
    icon?: IconName
    maxlength?: number
    enterkeyhint?: 'next' | 'done' | 'search' | 'go'
    suffixIcon?: IconName
    suffixLabel?: string
    autofocus?: boolean
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
    type: 'text',
    autocomplete: 'off',
    inputmode: undefined,
    size: 'md',
    icon: undefined,
    maxlength: undefined,
    enterkeyhint: undefined,
    suffixIcon: undefined,
    suffixLabel: undefined,
    autofocus: false,
    hideLabel: false,
  },
)

const emit = defineEmits<{ suffix: [] }>()
</script>

<template>
  <FormField
    :label="label"
    :hint="hint"
    :error="error"
    :required="required"
    :hide-label="hideLabel"
  >
    <template #default="{ id, describedBy, invalid }">
      <div
        class="field-control"
        :data-size="size"
        :data-readonly="readonly ? 'true' : undefined"
        :aria-invalid="invalid || undefined"
      >
        <AppIcon
          v-if="icon"
          :name="icon"
          :size="16"
          class="shrink-0 text-content-muted"
        />
        <input
          :id="id"
          v-model="model"
          :type="type"
          :placeholder="placeholder"
          :autocomplete="autocomplete"
          :inputmode="inputmode"
          :disabled="disabled"
          :readonly="readonly"
          :maxlength="maxlength"
          :enterkeyhint="enterkeyhint"
          :aria-describedby="describedBy"
          :aria-invalid="invalid || undefined"
          :required="required"
          :autofocus="autofocus"
        />
        <button
          v-if="suffixIcon"
          type="button"
          class="inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-content-muted hover:text-content"
          :aria-label="suffixLabel ?? 'Acción del campo'"
          @click="emit('suffix')"
        >
          <AppIcon :name="suffixIcon" :size="18" />
        </button>
        <slot name="suffix" />
      </div>
    </template>
  </FormField>
</template>
