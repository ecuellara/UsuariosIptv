<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxViewport,
} from 'reka-ui'
import AppIcon from './AppIcon.vue'
import AppSpinner from './AppSpinner.vue'
import FormField from './FormField.vue'

export interface ComboboxOption {
  value: string
  label: string
  secondary?: string
}

const model = defineModel<string | null>({ default: null })

const props = withDefaults(
  defineProps<{
    options: ComboboxOption[]
    label?: string
    hint?: string
    error?: string | null
    placeholder?: string
    required?: boolean
    disabled?: boolean
    loading?: boolean
    emptyText?: string
    size?: 'md' | 'lg'
  }>(),
  {
    label: undefined,
    hint: undefined,
    error: null,
    placeholder: 'Buscar…',
    required: false,
    disabled: false,
    loading: false,
    emptyText: 'Sin resultados',
    size: 'md',
  },
)

const emit = defineEmits<{ search: [term: string] }>()

const searchTerm = ref('')
const open = ref(false)

watch(searchTerm, (term) => emit('search', term))

function onSelect(value: unknown): void {
  model.value = typeof value === 'string' ? value : null
  open.value = false
}

function displayValue(value: unknown): string {
  if (typeof value !== 'string') return ''
  return props.options.find((option) => option.value === value)?.label ?? value
}
</script>

<template>
  <FormField :label="label" :hint="hint" :error="error" :required="required">
    <template #default="{ id, describedBy, invalid }">
      <ComboboxRoot
        :model-value="model ?? undefined"
        :open="open"
        :ignore-filter="true"
        :disabled="disabled"
        @update:model-value="onSelect"
        @update:open="open = $event"
      >
        <ComboboxAnchor as-child>
          <div
            class="field-control"
            :data-size="size"
            :aria-invalid="invalid || undefined"
          >
            <AppIcon name="search" :size="16" class="shrink-0 text-content-muted" />
            <ComboboxInput
              :id="id"
              :display-value="displayValue"
              :placeholder="placeholder"
              :aria-describedby="describedBy"
              :aria-invalid="invalid || undefined"
              :aria-required="required || undefined"
              autocomplete="off"
              class="w-full bg-transparent outline-none"
            />
            <AppSpinner v-if="loading" :size="14" class="shrink-0 text-content-muted" />
          </div>
        </ComboboxAnchor>

        <ComboboxPortal>
          <ComboboxContent
            position="popper"
            :side-offset="4"
            class="overflow-hidden rounded-md border border-border bg-surface-raised shadow-md"
            style="z-index: var(--z-dropdown); width: var(--reka-combobox-trigger-width, 18rem)"
          >
            <ComboboxViewport class="max-h-80 overflow-y-auto p-1">
              <ComboboxEmpty class="px-3 py-2 text-sm text-content-muted">
                {{ emptyText }}
              </ComboboxEmpty>
              <ComboboxItem
                v-for="option in options"
                :key="option.value"
                :value="option.value"
                class="flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 text-base text-content outline-none data-[highlighted]:bg-surface-selected"
              >
                <span class="flex min-w-0 flex-col">
                  <span class="truncate font-medium">{{ option.label }}</span>
                  <span v-if="option.secondary" class="text-xs text-content-muted">
                    {{ option.secondary }}
                  </span>
                </span>
              </ComboboxItem>
            </ComboboxViewport>
          </ComboboxContent>
        </ComboboxPortal>
      </ComboboxRoot>
    </template>
  </FormField>
</template>
