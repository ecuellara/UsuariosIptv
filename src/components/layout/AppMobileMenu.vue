<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import AppIcon from '@/components/ui/AppIcon.vue'
import { MOBILE_MORE_ITEMS } from '@/router/navigation'
import { useSessionStore } from '@/stores/session'
import { usePreferencesStore } from '@/stores/preferences'

const open = defineModel<boolean>('open', { default: false })
const session = useSessionStore()
const preferences = usePreferencesStore()

const themes = [
  { value: 'light', label: 'Claro', icon: 'sun' },
  { value: 'dark', label: 'Oscuro', icon: 'moon' },
  { value: 'system', label: 'Sistema', icon: 'monitor' },
] as const
</script>

<template>
  <DialogRoot :open="open" @update:open="open = $event">
    <DialogPortal>
      <DialogOverlay class="modal-overlay fixed inset-0 bg-overlay" style="z-index: var(--z-overlay)" />
      <DialogContent
        data-chrome="dark"
        class="drawer-content fixed inset-x-0 bottom-0 rounded-t-xl bg-nav-bg p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-lg"
        style="z-index: var(--z-sheet)"
        aria-describedby="undefined"
      >
        <div class="mb-3 flex items-center justify-between">
          <DialogTitle class="text-base font-semibold text-nav-text">Más</DialogTitle>
          <DialogDescription class="sr-only">Destinos de navegación adicionales</DialogDescription>
          <button
            type="button"
            class="-m-2 inline-flex size-11 items-center justify-center rounded-sm text-nav-muted"
            aria-label="Cerrar menú"
            @click="open = false"
          >
            <AppIcon name="x" :size="20" />
          </button>
        </div>

        <nav aria-label="Más destinos">
          <ul class="flex flex-col gap-1">
            <li v-for="item in MOBILE_MORE_ITEMS" :key="item.name">
              <RouterLink :to="{ name: item.name }" class="nav-item" @click="open = false">
                <AppIcon :name="item.icon" :size="20" />
                <span class="truncate">{{ item.label }}</span>
                <span
                  v-if="item.soon"
                  class="ml-auto rounded-xs border border-nav-border px-1 text-[10px] uppercase tracking-caps text-nav-muted"
                >
                  Pronto
                </span>
              </RouterLink>
            </li>
          </ul>
        </nav>

        <div class="mt-4 border-t border-nav-border pt-3">
          <p class="px-3 pb-1 text-xs uppercase tracking-caps text-nav-muted">Tema</p>
          <div class="flex gap-1 px-1" role="group" aria-label="Tema de la interfaz">
            <button
              v-for="theme in themes"
              :key="theme.value"
              type="button"
              class="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-sm border text-sm"
              :style="{
                borderColor: preferences.theme === theme.value ? 'var(--color-nav-active-bar)' : 'var(--color-nav-border)',
                color: preferences.theme === theme.value ? 'var(--color-nav-active-text)' : 'var(--color-nav-text-muted)',
                background: preferences.theme === theme.value ? 'var(--color-nav-active-bg)' : 'transparent',
              }"
              :aria-pressed="preferences.theme === theme.value"
              @click="preferences.setTheme(theme.value)"
            >
              <AppIcon :name="theme.icon" :size="16" />
              {{ theme.label }}
            </button>
          </div>

          <button
            type="button"
            class="nav-item mt-2 w-full text-left"
            @click="session.signOut(); open = false"
          >
            <AppIcon name="logout" :size="18" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
