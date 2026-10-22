<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppIcon from '@/components/ui/AppIcon.vue'
import { formatLongDate } from '@/lib/dates'
import { useSessionStore } from '@/stores/session'
import { usePreferencesStore } from '@/stores/preferences'

defineEmits<{ 'open-menu': [] }>()

const route = useRoute()
const session = useSessionStore()
const preferences = usePreferencesStore()

const title = computed(() => {
  const metaTitle = route.meta.title
  return typeof metaTitle === 'string' ? metaTitle : 'IPTV Manager'
})

const initials = computed(() => session.displayName.slice(0, 2).toUpperCase())
const today = formatLongDate()

function toggleTheme(): void {
  preferences.setTheme(preferences.resolvedTheme === 'dark' ? 'light' : 'dark')
}
</script>

<template>
  <header
    class="sticky top-0 flex h-(--layout-topbar-h) items-center gap-2 border-b border-border bg-surface px-4 lg:px-8"
    style="z-index: var(--z-sticky)"
  >
    <button
      type="button"
      class="btn lg:hidden"
      data-variant="ghost"
      data-icon-only="true"
      data-size="sm"
      aria-label="Abrir menú de navegación"
      @click="$emit('open-menu')"
    >
      <AppIcon name="menu" :size="20" />
    </button>

    <p class="truncate text-base font-semibold text-content lg:hidden">{{ title }}</p>
    <p class="hidden text-sm text-content-muted lg:block">
      {{ today }} <span aria-hidden="true">·</span> Lima
    </p>

    <div class="ml-auto flex items-center gap-1">
      <button
        type="button"
        class="btn"
        data-variant="ghost"
        data-icon-only="true"
        data-size="sm"
        :aria-label="preferences.resolvedTheme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'"
        @click="toggleTheme"
      >
        <AppIcon :name="preferences.resolvedTheme === 'dark' ? 'sun' : 'moon'" :size="18" />
      </button>

      <RouterLink
        :to="{ name: 'settings' }"
        class="hidden min-h-11 items-center gap-2 rounded-sm px-2 hover:bg-surface-hover lg:flex"
        :aria-label="`Perfil de ${session.displayName}`"
      >
        <span
          class="flex size-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-fg"
          aria-hidden="true"
        >
          {{ initials }}
        </span>
        <span class="hidden truncate text-sm text-content xl:block">{{ session.displayName }}</span>
      </RouterLink>
    </div>
  </header>
</template>
