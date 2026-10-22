<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'
import AppIcon from './AppIcon.vue'

const model = defineModel<boolean>({ default: false })

withDefaults(
  defineProps<{
    label: string
    disabled?: boolean
    hideLabel?: boolean
  }>(),
  { disabled: false, hideLabel: false },
)
</script>

<template>
  <label class="inline-flex min-h-11 cursor-pointer items-center gap-2 text-base text-content">
    <CheckboxRoot
      v-model="model"
      :disabled="disabled"
      class="flex size-4 shrink-0 items-center justify-center rounded-xs border border-border-control bg-surface data-[state=checked]:border-primary data-[state=checked]:bg-primary"
    >
      <CheckboxIndicator class="text-primary-fg">
        <AppIcon name="check" :size="12" />
      </CheckboxIndicator>
    </CheckboxRoot>
    <span :class="hideLabel ? 'sr-only' : undefined">{{ label }}</span>
  </label>
</template>
