<script setup lang="ts" generic="T extends object">
import AppAlert from './AppAlert.vue'
import AppSkeleton from './AppSkeleton.vue'
import EmptyState from './EmptyState.vue'

/* Tabla con conversión a tarjetas a ≤640 px de contenedor (DESIGN.md §7.3).
   Un solo marcado: el CSS cambia `tr` a grid. Las columnas declaran su papel
   en la tarjeta y el consumidor solo rellena celdas por slot. */

export interface TableColumn {
  key: string
  label: string
  align?: 'left' | 'right'
  width?: string
  /** Se oculta por debajo del breakpoint indicado (sigue visible en la ficha). */
  hideBelow?: 'lg' | 'xl'
  /** Posición en la tarjeta móvil. */
  card?: 'start' | 'end' | 'primary' | 'meta' | 'actions'
  numeric?: boolean
}

const props = withDefaults(
  defineProps<{
    columns: TableColumn[]
    rows: T[]
    rowKey: (row: T) => string
    caption: string
    loading?: boolean
    error?: unknown
    errorMessage?: string
    emptyTitle?: string
    emptyDescription?: string
    rowStatus?: (row: T) => string | undefined
    rowLabel?: (row: T) => string
    interactive?: boolean
    skeletonRows?: number
    retryLabel?: string
  }>(),
  {
    loading: false,
    errorMessage: 'No se pudieron cargar los datos.',
    emptyTitle: 'Sin resultados',
    emptyDescription: undefined,
    rowStatus: undefined,
    rowLabel: undefined,
    interactive: false,
    skeletonRows: 6,
    retryLabel: 'Reintentar',
  },
)

const emit = defineEmits<{ retry: []; activate: [row: T] }>()

defineSlots<{
  empty?: () => unknown
  [name: `cell-${string}`]: ((props: { row: T; value: unknown }) => unknown) | undefined
}>()

function cellClasses(column: TableColumn): string[] {
  const classes: string[] = ['align-top']
  if (column.align === 'right' || column.numeric) classes.push('dt-cell--num')
  switch (column.card) {
    case 'start':
      classes.push('dt-card-start')
      break
    case 'end':
      classes.push('dt-card-end')
      break
    case 'primary':
      classes.push('dt-card-primary')
      break
    case 'meta':
      classes.push('dt-card-meta')
      break
    case 'actions':
      classes.push('dt-card-actions')
      break
    default:
      break
  }
  if (column.hideBelow === 'lg') classes.push('hidden lg:table-cell')
  if (column.hideBelow === 'xl') classes.push('hidden xl:table-cell')
  return classes
}

function valueFor(row: T, key: string): unknown {
  return (row as Record<string, unknown>)[key]
}

function fallbackValue(row: T, key: string): string {
  const value = valueFor(row, key)
  if (value === null || value === undefined) return '—'
  return String(value)
}

function onRowClick(row: T, event: MouseEvent): void {
  if (!props.interactive) return
  const target = event.target
  /* `Element` (no `HTMLElement`): el clic puede caer en el <svg> de un botón. */
  if (
    target instanceof Element &&
    target.closest('button, a, input, label, [role="switch"], [role="checkbox"]')
  ) {
    return
  }
  emit('activate', row)
}

function onRowKeydown(row: T, event: KeyboardEvent): void {
  if (!props.interactive) return
  if (event.key === 'Enter') {
    event.preventDefault()
    emit('activate', row)
  }
}
</script>

<template>
  <div class="dt-container">
    <p v-if="loading" class="sr-only" aria-live="polite">Cargando resultados…</p>
    <table class="dt">
      <caption class="sr-only">{{ caption }}</caption>
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            scope="col"
            :style="column.width ? { width: column.width } : undefined"
            :class="[
              column.align === 'right' || column.numeric ? 'text-right' : 'text-left',
              column.hideBelow === 'lg' ? 'hidden lg:table-cell' : '',
              column.hideBelow === 'xl' ? 'hidden xl:table-cell' : '',
            ]"
          >
            {{ column.label }}
          </th>
        </tr>
      </thead>
      <tbody :aria-busy="loading || undefined">
        <template v-if="loading">
          <tr v-for="index in skeletonRows" :key="`skeleton-${index}`">
            <td v-for="column in columns" :key="column.key" :class="cellClasses(column)">
              <AppSkeleton :height="'12px'" :width="column.card === 'actions' ? '80%' : '70%'" />
            </td>
          </tr>
        </template>

        <tr v-else-if="error">
          <td :colspan="columns.length">
            <div class="p-4">
              <AppAlert variant="danger" :title="errorMessage">
                <div class="mt-2">
                  <button type="button" class="btn" data-variant="secondary" data-size="sm" @click="emit('retry')">
                    {{ retryLabel }}
                  </button>
                </div>
              </AppAlert>
            </div>
          </td>
        </tr>

        <tr v-else-if="rows.length === 0">
          <td :colspan="columns.length">
            <slot name="empty">
              <EmptyState :title="emptyTitle" :description="emptyDescription" />
            </slot>
          </td>
        </tr>

        <template v-else>
          <tr
            v-for="row in rows"
            :key="rowKey(row)"
            :data-status="rowStatus?.(row)"
            :data-interactive="interactive ? 'true' : undefined"
            :tabindex="interactive ? 0 : undefined"
            :aria-label="interactive ? rowLabel?.(row) : undefined"
            @click="onRowClick(row, $event)"
            @keydown="onRowKeydown(row, $event)"
          >
            <td v-for="column in columns" :key="column.key" :class="cellClasses(column)">
              <slot
                :name="`cell-${column.key}`"
                :row="row"
                :value="valueFor(row, column.key)"
              >
                {{ fallbackValue(row, column.key) }}
              </slot>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
