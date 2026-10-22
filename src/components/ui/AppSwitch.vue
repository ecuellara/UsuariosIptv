<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'

const model = defineModel<boolean>({ default: false })

withDefaults(
  defineProps<{
    label: string
    disabled?: boolean
    hideLabel?: boolean
    loading?: boolean
  }>(),
  { disabled: false, hideLabel: false, loading: false },
)
</script>

<template>
  <label class="inline-flex min-h-11 cursor-pointer items-center gap-2 text-base text-content">
    <SwitchRoot
      v-model="model"
      :disabled="disabled || loading"
      :aria-busy="loading || undefined"
      class="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-transparent bg-border-strong transition-colors duration-fast data-[state=checked]:bg-primary data-[disabled]:cursor-not-allowed"
    >
      <SwitchThumb
        class="block size-4.5 translate-x-1 rounded-full bg-white shadow-sm transition-transform duration-fast data-[state=checked]:translate-x-[18px]"
      />
    </SwitchRoot>
    <span :class="hideLabel ? 'sr-only' : undefined">{{ label }}</span>
  </label>
</template>
