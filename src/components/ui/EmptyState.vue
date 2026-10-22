<script setup lang="ts">
import AppIcon, { type IconName } from './AppIcon.vue'

withDefaults(
  defineProps<{
    title: string
    description?: string
    icon?: IconName
  }>(),
  { description: undefined, icon: 'inbox' },
)
</script>

<template>
  <div class="flex flex-col items-center gap-3 px-6 py-12 text-center">
    <span
      class="flex size-12 items-center justify-center rounded-full bg-surface-sunken text-content-muted"
      aria-hidden="true"
    >
      <AppIcon :name="icon" :size="24" />
    </span>
    <p class="text-lg font-semibold text-content">{{ title }}</p>
    <p v-if="description" class="max-w-[46ch] text-sm leading-5 text-content-muted">
      {{ description }}
    </p>
    <div v-if="$slots.default" class="mt-2 flex flex-wrap items-center justify-center gap-2">
      <slot />
    </div>
  </div>
</template>
