<script setup lang="ts">
import { ref, watch } from 'vue'
import FormField from './FormField.vue'
import { formatPhone, isPeruMobile, normalizePhone } from '@/lib/format'

/* COMPONENTES.md §20. Se guardan solo dígitos (modelo: ^[0-9]{9,15}$).
   La máscara 3-3-3 es de Perú; "Otro número" la desactiva. */

const model = defineModel<string>({ default: '' })

withDefaults(
  defineProps<{
    label?: string
    hint?: string
    error?: string | null
    required?: boolean
    disabled?: boolean
    size?: 'md' | 'lg'
    hideLabel?: boolean
  }>(),
  {
    label: undefined,
    hint: undefined,
    error: null,
    required: false,
    disabled: false,
    size: 'md',
    hideLabel: false,
  },
)

const otherCountry = ref(false)
const text = ref(formatPhone(model.value))
const localError = ref<string | null>(null)

watch(
  () => model.value,
  (value) => {
    if (normalizePhone(text.value) !== value) text.value = formatPhone(value)
  },
  { immediate: true },
)

function onInput(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const digits = normalizePhone(target.value)
  const limit = otherCountry.value ? 15 : 9
  const trimmed = digits.slice(0, limit)
  text.value = otherCountry.value ? trimmed : formatPhone(trimmed)
  localError.value = null
  // Se emite siempre el valor normalizado (sin +, sin espacios).
  model.value = trimmed
}

function validate(): void {
  if (otherCountry.value) {
    if (!/^\d{9,15}$/.test(model.value)) {
      localError.value = 'Ingresa un número de 9 a 15 dígitos.'
    }
    return
  }
  if (!isPeruMobile(model.value)) {
    localError.value = 'Ingresa un celular de 9 dígitos (empieza con 9).'
  }
}

function toggleOther(): void {
  otherCountry.value = !otherCountry.value
  localError.value = null
  text.value = otherCountry.value ? model.value : formatPhone(model.value)
}
</script>

<template>
  <FormField
    :label="label"
    :hint="hint ?? (otherCountry ? 'Solo dígitos, de 9 a 15.' : 'Celular de 9 dígitos. No verificamos por SMS.')"
    :error="localError ?? error"
    :required="required"
    :hide-label="hideLabel"
  >
    <template #default="{ id, describedBy, invalid }">
      <div
        class="field-control"
        :data-size="size"
        :aria-invalid="invalid || undefined"
      >
        <span
          v-if="!otherCountry"
          class="shrink-0 select-none border-r border-border pr-2 text-sm text-content-muted"
          aria-hidden="true"
        >
          +51
        </span>
        <input
          :id="id"
          :value="text"
          type="tel"
          inputmode="numeric"
          autocomplete="tel"
          :placeholder="otherCountry ? '9 a 15 dígitos' : '987 654 321'"
          :disabled="disabled"
          :aria-describedby="describedBy"
          :aria-invalid="invalid || undefined"
          :required="required"
          class="tabular"
          @input="onInput"
          @blur="validate"
        />
      </div>
      <button
        type="button"
        class="mt-1 self-start text-xs text-primary-text underline"
        @click="toggleOther"
      >
        {{ otherCountry ? 'Usar celular de Perú' : 'Otro número' }}
      </button>
    </template>
  </FormField>
</template>
