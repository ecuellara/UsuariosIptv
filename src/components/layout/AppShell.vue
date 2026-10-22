<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppMobileMenu from './AppMobileMenu.vue'
import AppSidebar from './AppSidebar.vue'
import AppTopbar from './AppTopbar.vue'
import ToastHost from '@/components/ui/ToastHost.vue'
import { MOBILE_NAV_ITEMS } from '@/router/navigation'

/* Layout: sidebar ≥1024, topbar sticky, bottom-bar móvil + drawer "Más"
   (DESIGN.md §7.2). */

const menuOpen = ref(false)
</script>

<template>
  <div class="min-h-dvh lg:grid lg:grid-cols-[auto_minmax(0,1fr)]">
    <a href="#contenido" class="skip-link">Saltar al contenido</a>

    <AppSidebar class="sticky top-0 hidden lg:flex" />

    <div class="flex min-h-dvh min-w-0 flex-col">
      <AppTopbar @open-menu="menuOpen = true" />

      <main
        id="contenido"
        tabindex="-1"
        class="mx-auto w-full max-w-(--layout-content-max) flex-1 px-4 pb-28 pt-4 lg:px-8 lg:pb-12"
      >
        <slot />
      </main>
    </div>

    <nav
      data-chrome="dark"
      aria-label="Navegación móvil"
      class="fixed inset-x-0 bottom-0 flex border-t border-nav-border bg-nav-bg pb-[env(safe-area-inset-bottom)] lg:hidden"
      style="z-index: var(--z-nav)"
    >
      <RouterLink
        v-for="item in MOBILE_NAV_ITEMS"
        :key="item.name"
        :to="{ name: item.name }"
        class="mobile-nav-item flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs"
      >
        <AppIcon :name="item.icon" :size="22" />
        <span>{{ item.label }}</span>
      </RouterLink>
      <button
        type="button"
        class="mobile-nav-item flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs"
        :aria-expanded="menuOpen"
        aria-controls="menu-mas"
        @click="menuOpen = true"
      >
        <AppIcon name="menu" :size="22" />
        <span>Más</span>
      </button>
    </nav>

    <AppMobileMenu id="menu-mas" v-model:open="menuOpen" />
    <ToastHost />
  </div>
</template>
