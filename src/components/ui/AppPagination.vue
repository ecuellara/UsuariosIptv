<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

const props = withDefaults(
  defineProps<{
    page: number
    pageSize: number
    total: number
    pageSizeOptions?: number[]
    label?: string
  }>(),
  {
    pageSizeOptions: () => [25, 50, 100],
    label: 'Paginación',
  },
)

const emit = defineEmits<{
  'update:page': [page: number]
  'update:pageSize': [size: number]
}>()

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const from = computed(() => (props.total === 0 ? 0 : props.page * props.pageSize + 1))
const to = computed(() => Math.min(props.total, (props.page + 1) * props.pageSize))
const canPrev = computed(() => props.page > 0)
const canNext = computed(() => props.page + 1 < pageCount.value)

function go(page: number): void {
  if (page < 0 || page >= pageCount.value || page === props.page) return
  emit('update:page', page)
}

function changeSize(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  emit('update:pageSize', Number(target.value))
  emit('update:page', 0)
}
</script>

<template>
  <nav
    class="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
    :aria-label="label"
  >
    <p class="text-sm text-content-muted" aria-live="polite">
      <span class="tabular">{{ from }}–{{ to }}</span> de
      <span class="tabular">{{ total }}</span>
    </p>

    <div class="flex items-center gap-2">
      <label class="flex items-center gap-2 text-sm text-content-muted">
        <span class="hidden sm:inline">Filas</span>
        <select
          :value="pageSize"
          class="h-9 rounded-sm border border-border-control bg-surface px-2 text-sm text-content"
          aria-label="Filas por página"
          @change="changeSize"
        >
          <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }}</option>
        </select>
      </label>
      <button
        type="button"
        class="btn"
        data-variant="secondary"
        data-icon-only="true"
        data-size="sm"
        aria-label="Página anterior"
        :disabled="!canPrev"
        @click="go(page - 1)"
      >
        <AppIcon name="chevron-left" :size="16" />
      </button>
      <span class="text-sm text-content-muted">
        <span class="tabular">{{ page + 1 }}</span> / <span class="tabular">{{ pageCount }}</span>
      </span>
      <button
        type="button"
        class="btn"
        data-variant="secondary"
        data-icon-only="true"
        data-size="sm"
        aria-label="Página siguiente"
        :disabled="!canNext"
        @click="go(page + 1)"
      >
        <AppIcon name="chevron-right" :size="16" />
      </button>
    </div>
  </nav>
</template>
