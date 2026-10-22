<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import AppSkeleton from './AppSkeleton.vue'

/* COMPONENTES.md §10. La severidad nunca va solo en el color: el contexto
   textual dice qué pasa. `loading` no muestra 0: muestra esqueleto. */

const props = withDefaults(
  defineProps<{
    label: string
    value: string | number | null
    context?: string
    severity?: 'neutral' | 'attention' | 'critical'
    loading?: boolean
    error?: boolean
    to?: RouteLocationRaw
    meter?: { value: number; max: number; level: 'ok' | 'low' | 'empty'; label: string }
  }>(),
  {
    context: undefined,
    severity: 'neutral',
    loading: false,
    error: false,
    to: undefined,
    meter: undefined,
  },
)

const barColor = computed(() => {
  if (props.severity === 'critical') return 'var(--status-vencida-bg)'
  if (props.severity === 'attention') return 'var(--status-proxima-mark)'
  return 'transparent'
})

const fillPercent = computed(() => {
  if (!props.meter) return 0
  const max = Math.max(props.meter.max, 1)
  return Math.min(100, Math.max(0, Math.round((props.meter.value / max) * 100)))
})

const isLink = computed(() => Boolean(props.to))
</script>

<template>
  <component
    :is="isLink ? RouterLink : 'div'"
    v-bind="isLink ? { to } : {}"
    class="panel flex min-h-24 flex-col gap-2 p-4 lg:p-5"
    :class="isLink ? 'transition-colors duration-fast hover:border-border-strong' : undefined"
    :style="{ borderTop: `3px solid ${barColor}` }"
  >
    <p class="section-label">{{ label }}</p>

    <template v-if="loading">
      <AppSkeleton width="96px" height="30px" />
      <AppSkeleton width="120px" height="10px" />
    </template>

    <template v-else-if="error">
      <p class="metric-value text-content-disabled">—</p>
      <p class="text-xs text-content-muted">No disponible</p>
    </template>

    <template v-else>
      <p
        class="metric-value text-3xl sm:text-4xl"
        :class="severity === 'critical' ? 'text-danger-text' : 'text-content'"
      >
        {{ value === null ? '—' : value }}
      </p>
      <p v-if="context" class="text-xs leading-4 text-content-muted">{{ context }}</p>
      <div v-if="meter" class="mt-1 flex flex-col gap-1">
        <span
          class="meter"
          role="img"
          :aria-label="meter.label"
          :data-level="meter.level"
        >
          <span :style="{ width: `${fillPercent}%` }" />
        </span>
      </div>
    </template>
  </component>
</template>
