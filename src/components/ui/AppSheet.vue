<script setup lang="ts">
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import AppIcon from './AppIcon.vue'

/* COMPONENTES.md §11 — Sheet lateral (renovación, ficha, filtros en móvil).
   En <768 px ocupa el 100 % del ancho. */

const open = defineModel<boolean>('open', { default: false })

withDefaults(
  defineProps<{
    title: string
    description?: string
    preventClose?: boolean
  }>(),
  { description: undefined, preventClose: false },
)

function guard(event: Event): void {
  event.preventDefault()
}
</script>

<template>
  <DialogRoot :open="open" @update:open="open = $event">
    <DialogPortal>
      <DialogOverlay
        class="modal-overlay fixed inset-0 bg-overlay"
        style="z-index: var(--z-overlay)"
      />
      <DialogContent
        class="sheet-content"
        style="z-index: var(--z-sheet)"
        @escape-key-down="preventClose ? guard($event) : undefined"
        @pointer-down-outside="preventClose ? guard($event) : undefined"
        @interact-outside="preventClose ? guard($event) : undefined"
      >
        <header class="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
          <div class="min-w-0">
            <DialogTitle class="text-xl font-semibold text-content">{{ title }}</DialogTitle>
            <DialogDescription v-if="description" class="mt-0.5 text-sm text-content-muted">
              {{ description }}
            </DialogDescription>
            <DialogDescription v-else class="sr-only">{{ title }}</DialogDescription>
          </div>
          <button
            type="button"
            class="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-content-muted hover:bg-surface-hover hover:text-content"
            aria-label="Cerrar panel"
            @click="open = false"
          >
            <AppIcon name="x" :size="18" />
          </button>
        </header>

        <div class="sheet-body">
          <slot />
        </div>

        <footer v-if="$slots.footer" class="sheet-footer">
          <slot name="footer" />
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
