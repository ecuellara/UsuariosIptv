<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'
import AppIcon from './AppIcon.vue'
import FormField from './FormField.vue'

export interface SelectOption {
  value: string
  label: string
  secondary?: string
  disabled?: boolean
}

const model = defineModel<string | null>({ default: null })

withDefaults(
  defineProps<{
    options: SelectOption[]
    label?: string
    hint?: string
    error?: string | null
    placeholder?: string
    required?: boolean
    disabled?: boolean
    size?: 'md' | 'lg'
    emptyText?: string
    hideLabel?: boolean
  }>(),
  {
    label: undefined,
    hint: undefined,
    error: null,
    placeholder: 'Seleccionar',
    required: false,
    disabled: false,
    size: 'md',
    emptyText: 'Sin opciones',
    hideLabel: false,
  },
)

/* Dentro de un modal/sheet el dropdown debe portalarse al propio diálogo: el
   layer modal deja `pointer-events: none` en el resto del body, así que un
   portal a `body` no sería clickeable (mismo criterio que AppDatePicker). */
const root = ref<HTMLElement | null>(null)
const portalTarget = ref<HTMLElement | undefined>(undefined)

onMounted(() => {
  const dialog = root.value?.closest('[role="dialog"]')
  portalTarget.value = dialog instanceof HTMLElement ? dialog : undefined
})
</script>

<template>
  <FormField :label="label" :hint="hint" :error="error" :required="required" :hide-label="hideLabel">
    <template #default="{ id, describedBy, invalid }">
      <div ref="root">
        <SelectRoot v-model="model" :disabled="disabled">
          <SelectTrigger
            :id="id"
            class="field-control justify-between text-left"
            :data-size="size"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedBy"
            :aria-required="required || undefined"
          >
            <SelectValue :placeholder="placeholder" class="truncate" />
            <SelectIcon class="shrink-0 text-content-muted">
              <AppIcon name="chevron-down" :size="16" />
            </SelectIcon>
          </SelectTrigger>

          <SelectPortal :to="portalTarget">
            <SelectContent
              position="popper"
              :side-offset="4"
              class="overflow-hidden rounded-md border border-border bg-surface-raised shadow-md"
              style="z-index: var(--z-dropdown); width: var(--reka-select-trigger-width, 12rem)"
            >
              <SelectViewport class="max-h-80 overflow-y-auto p-1">
                <div
                  v-if="options.length === 0"
                  class="px-3 py-2 text-sm text-content-muted"
                >
                  {{ emptyText }}
                </div>
                <SelectItem
                  v-for="option in options"
                  :key="option.value"
                  :value="option.value"
                  :disabled="option.disabled"
                  class="flex min-h-9 cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 text-base text-content outline-none data-[highlighted]:bg-surface-selected data-[disabled]:cursor-not-allowed data-[disabled]:text-content-disabled"
                >
                  <SelectItemIndicator class="shrink-0 text-primary-text">
                    <AppIcon name="check" :size="16" />
                  </SelectItemIndicator>
                  <span class="flex min-w-0 flex-col">
                    <SelectItemText class="truncate">{{ option.label }}</SelectItemText>
                    <span v-if="option.secondary" class="text-xs text-content-muted">
                      {{ option.secondary }}
                    </span>
                  </span>
                </SelectItem>
              </SelectViewport>
            </SelectContent>
          </SelectPortal>
        </SelectRoot>
      </div>
    </template>
  </FormField>
</template>
