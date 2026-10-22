<script setup lang="ts">
import { ref, watch } from 'vue'
import FormField from './FormField.vue'
import { decimalString } from '@/lib/format'

/* COMPONENTES.md §18. El valor viaja como string decimal ("15.00"): el input
   no hace aritmética de punto flotante ni suma importes. */

const model = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    label?: string
    hint?: string
    error?: string | null
    required?: boolean
    disabled?: boolean
    readonly?: boolean
    size?: 'md' | 'lg'
    min?: number
    placeholder?: string
    hideLabel?: boolean
  }>(),
  {
    label: undefined,
    hint: undefined,
    error: null,
    required: false,
    disabled: false,
    readonly: false,
    size: 'md',
    min: undefined,
    placeholder: '0.00',
    hideLabel: false,
  },
)

const text = ref(decimalString(model.value))
const localError = ref<string | null>(null)

const MAX = 9_999_999.99

function parse(raw: string): { value: string } | { error: string } {
  let candidate = raw.replace(/s\/?/gi, '').replace(/\s/g, '')
  if (candidate.length === 0) {
    return props.required ? { error: 'Ingresa un importe.' } : { value: '' }
  }
  if (candidate.includes(',') && candidate.includes('.')) {
    candidate = candidate.replace(/,/g, '')
  } else if (candidate.includes(',')) {
    candidate = candidate.replace(',', '.')
  }
  if (!/^\d+(\.\d{1,2})?$/.test(candidate)) {
    if (/^\d+\.\d{3,}$/.test(candidate)) {
      return { error: 'Usa como máximo 2 decimales.' }
    }
    return { error: 'Ingresa un importe válido.' }
  }
  const value = Number(candidate)
  if (!Number.isFinite(value)) return { error: 'Ingresa un importe válido.' }
  if (value > MAX) return { error: 'El importe máximo es S/ 9,999,999.99.' }
  if (props.min !== undefined && value < props.min) {
    return {
      error:
        props.min <= 0.01
          ? 'Ingresa un importe mayor a 0.'
          : `El importe mínimo es S/ ${props.min.toFixed(2)}.`,
    }
  }
  return { value: value.toFixed(2) }
}

watch(
  () => model.value,
  (value) => {
    const result = parse(text.value)
    if ('value' in result && result.value === value) return
    text.value = decimalString(value)
  },
)

function onInput(): void {
  localError.value = null
  const result = parse(text.value)
  if ('value' in result) {
    model.value = result.value
    return
  }
  /* Un campo vacío no conserva el último importe válido: si es obligatorio,
     el formulario debe poder rechazarlo (y enfocar este input). */
  if (text.value.trim().length === 0) model.value = ''
}

function selectAll(event: FocusEvent): void {
  const target = event.target
  if (target instanceof HTMLInputElement) target.select()
}

function onBlur(): void {
  const result = parse(text.value)
  if ('error' in result) {
    localError.value = result.error
    return
  }
  localError.value = null
  model.value = result.value
  text.value = result.value
}
</script>

<template>
  <FormField
    :label="label"
    :hint="hint"
    :error="localError ?? error"
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
        <span class="shrink-0 select-none text-sm text-content-muted" aria-hidden="true">S/</span>
        <input
          :id="id"
          v-model="text"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          :placeholder="placeholder"
          :disabled="disabled"
          :readonly="readonly"
          :aria-describedby="describedBy"
          :aria-invalid="invalid || undefined"
          :required="required"
          class="text-right tabular"
          @input="onInput"
          @blur="onBlur"
          @focus="selectAll"
        />
      </div>
    </template>
  </FormField>
</template>
