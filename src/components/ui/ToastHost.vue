<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { useToast, type ToastItem } from '@/composables/useToast'

const { items, dismiss, pause, resume } = useToast()

const icons = {
  success: 'check',
  error: 'alert-circle',
  info: 'info',
} as const

function tone(item: ToastItem): { border: string; bar: string; icon: string } {
  if (item.variant === 'error') {
    return {
      border: 'var(--color-danger-border)',
      bar: 'var(--color-danger)',
      icon: 'var(--color-danger-text)',
    }
  }
  if (item.variant === 'success') {
    return {
      border: 'var(--color-success-border)',
      bar: 'var(--color-success)',
      icon: 'var(--color-success-text)',
    }
  }
  return {
    border: 'var(--color-info-border)',
    bar: 'var(--color-info)',
    icon: 'var(--color-info-text)',
  }
}
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-4 bottom-4 z-[var(--z-toast)] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
    aria-live="polite"
    aria-atomic="false"
  >
    <TransitionGroup
      enter-active-class="transition duration-normal ease-out"
      enter-from-class="translate-y-2 opacity-0"
      leave-active-class="transition duration-fast ease-in"
      leave-to-class="translate-y-1 opacity-0"
    >
      <div
        v-for="item in items"
        :key="item.id"
        class="pointer-events-auto flex w-full items-start gap-3 rounded-md border bg-surface-raised p-3 shadow-md sm:w-[380px]"
        :style="{ borderColor: tone(item).border, borderLeft: `3px solid ${tone(item).bar}` }"
        :role="item.variant === 'error' ? 'alert' : 'status'"
        @mouseenter="pause(item.id)"
        @mouseleave="resume(item.id)"
        @focusin="pause(item.id)"
        @focusout="resume(item.id)"
      >
        <AppIcon
          :name="icons[item.variant]"
          :size="18"
          class="mt-0.5 shrink-0"
          :style="{ color: tone(item).icon }"
        />
        <div class="min-w-0 flex-1">
          <p class="text-base font-medium text-content">{{ item.title }}</p>
          <p v-if="item.description" class="mt-0.5 text-sm text-content-muted">
            {{ item.description }}
          </p>
          <button
            v-if="item.action"
            type="button"
            class="mt-2 text-sm font-medium text-primary-text underline"
            @click="item.action.onClick(); dismiss(item.id)"
          >
            {{ item.action.label }}
          </button>
        </div>
        <button
          type="button"
          class="-m-1.5 inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-content-muted hover:bg-surface-hover hover:text-content"
          aria-label="Cerrar aviso"
          @click="dismiss(item.id)"
        >
          <AppIcon name="x" :size="16" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
