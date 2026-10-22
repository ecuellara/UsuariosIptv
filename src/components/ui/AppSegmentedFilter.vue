<script setup lang="ts">
withDefaults(
  defineProps<{
    options: ReadonlyArray<{ value: string; label: string; count?: number }>
    label: string
  }>(),
  {},
)
const model = defineModel<string>({ required: true })
</script>

<template>
  <div
    class="flex items-center gap-1 overflow-x-auto pb-1"
    role="group"
    :aria-label="label"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="segment shrink-0"
      :aria-pressed="model === option.value"
      @click="model = option.value"
    >
      {{ option.label }}
      <span
        v-if="option.count !== undefined"
        class="rounded-full bg-surface-sunken px-1.5 text-xs tabular"
        :style="{ color: 'var(--color-text-muted)' }"
      >
        {{ option.count }}
      </span>
    </button>
  </div>
</template>
