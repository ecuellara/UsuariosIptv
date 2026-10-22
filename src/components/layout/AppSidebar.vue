<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/ui/AppIcon.vue'
import { NAV_ITEMS } from '@/router/navigation'
import { countAccounts } from '@/services/accounts'
import { queryKeys } from '@/lib/query-keys'
import { useSessionStore } from '@/stores/session'
import { usePreferencesStore } from '@/stores/preferences'
import { formatInteger } from '@/lib/format'

const session = useSessionStore()
const preferences = usePreferencesStore()

const today = useQuery({
  queryKey: queryKeys.accounts.countToday,
  queryFn: () => countAccounts({ scope: 'TODAY' }),
  staleTime: 60_000,
})

const todayCount = computed(() => today.data.value ?? null)

function toggleTheme(): void {
  preferences.setTheme(preferences.resolvedTheme === 'dark' ? 'light' : 'dark')
}
</script>

<template>
  <aside
    data-chrome="dark"
    class="flex h-dvh w-(--layout-sidebar-w) shrink-0 flex-col bg-nav-bg px-3 py-4 xl:w-(--layout-sidebar-w-lg)"
  >
    <RouterLink
      :to="{ name: 'dashboard' }"
      class="mb-6 flex items-center gap-2 rounded-sm px-3 text-xl font-semibold tracking-tight text-nav-text"
    >
      IPTV Manager
    </RouterLink>

    <nav aria-label="Navegación principal" class="flex-1">
      <ul class="flex flex-col gap-0.5">
        <li v-for="item in NAV_ITEMS" :key="item.name">
          <RouterLink :to="{ name: item.name }" class="nav-item">
            <AppIcon :name="item.icon" :size="18" class="shrink-0" />
            <span class="truncate">{{ item.label }}</span>
            <span
              v-if="item.name === 'dashboard' && todayCount !== null"
              class="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-nav-active-bg px-1.5 text-xs tabular text-nav-active-text"
              :aria-label="`${todayCount} vencen hoy`"
            >
              {{ formatInteger(todayCount) }}
            </span>
            <span
              v-else-if="item.soon"
              class="ml-auto rounded-xs border border-nav-border px-1 text-[10px] uppercase tracking-caps text-nav-muted"
            >
              Pronto
            </span>
          </RouterLink>
        </li>
      </ul>
    </nav>

    <div class="mt-4 flex flex-col gap-2 border-t border-nav-border pt-3">
      <button
        type="button"
        class="nav-item w-full text-left"
        @click="toggleTheme"
      >
        <AppIcon :name="preferences.resolvedTheme === 'dark' ? 'sun' : 'moon'" :size="18" />
        <span>{{ preferences.resolvedTheme === 'dark' ? 'Tema claro' : 'Tema oscuro' }}</span>
      </button>

      <div class="flex items-center gap-2 px-3 py-1">
        <span
          class="flex size-8 shrink-0 items-center justify-center rounded-full bg-nav-active-bg text-xs font-semibold text-nav-active-text"
          aria-hidden="true"
        >
          {{ session.displayName.slice(0, 2).toUpperCase() }}
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-nav-text">{{ session.displayName }}</span>
          <span class="block truncate text-xs text-nav-muted">{{ session.userEmail }}</span>
        </span>
      </div>

      <button
        type="button"
        class="nav-item w-full text-left"
        @click="session.signOut()"
      >
        <AppIcon name="logout" :size="18" />
        <span>Cerrar sesión</span>
      </button>
    </div>
  </aside>
</template>
