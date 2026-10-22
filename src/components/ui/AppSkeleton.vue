<script setup lang="ts">
withDefaults(
  defineProps<{
    width?: string
    height?: string
    rounded?: 'xs' | 'sm' | 'md' | 'lg'
  }>(),
  { width: '100%', height: '12px', rounded: 'xs' },
)
</script>

<template>
  <span
    class="skeleton"
    :style="{ width, height, borderRadius: `var(--radius-${rounded})` }"
    aria-hidden="true"
  />
</template>
