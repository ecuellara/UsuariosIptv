<script setup lang="ts">
import { nextTick, ref, type ComponentPublicInstance } from 'vue'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import AppIcon from './AppIcon.vue'

/* COMPONENTES.md §11 — Modal centrado. Foco atrapado por Reka, Escape cierra
   (salvo `preventClose`), devolución de foco al disparador automática. */

const open = defineModel<boolean>('open', { default: false })

withDefaults(
  defineProps<{
    title: string
    description?: string
    width?: 'sm' | 'md' | 'lg'
    preventClose?: boolean
  }>(),
  { description: undefined, width: 'md', preventClose: false },
)

const titleEl = ref<ComponentPublicInstance | null>(null)

/* El foco inicial va al título, no al botón "Cerrar". */
async function focusTitle(event: Event): Promise<void> {
  event.preventDefault()
  await nextTick()
  const element = titleEl.value?.$el
  if (element instanceof HTMLElement) element.focus()
}

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
        class="modal-content fixed left-1/2 top-1/2 flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-surface-raised shadow-lg"
        :style="{
          zIndex: 'var(--z-modal)',
          maxWidth: width === 'sm' ? '400px' : width === 'lg' ? '720px' : 'var(--layout-modal-w)',
        }"
        aria-modal="true"
        @open-auto-focus="focusTitle"
        @escape-key-down="preventClose ? guard($event) : undefined"
        @pointer-down-outside="preventClose ? guard($event) : undefined"
        @interact-outside="preventClose ? guard($event) : undefined"
      >
        <header class="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div class="min-w-0">
            <DialogTitle
              ref="titleEl"
              tabindex="-1"
              class="text-xl font-semibold text-content outline-none"
            >
              {{ title }}
            </DialogTitle>
            <DialogDescription v-if="description" class="mt-1 text-sm text-content-muted">
              {{ description }}
            </DialogDescription>
            <DialogDescription v-else class="sr-only">{{ title }}</DialogDescription>
          </div>
          <button
            type="button"
            class="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-content-muted hover:bg-surface-hover hover:text-content"
            aria-label="Cerrar"
            @click="open = false"
          >
            <AppIcon name="x" :size="18" />
          </button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <slot />
        </div>

        <footer
          v-if="$slots.footer"
          class="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-raised px-6 py-3"
        >
          <slot name="footer" />
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
