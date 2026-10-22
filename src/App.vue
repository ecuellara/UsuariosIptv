<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import { useSessionStore } from '@/stores/session'

/* Superficie:
   - /login y /sin-acceso: pantalla completa (sin chrome de navegación).
   - Rutas privadas: shell con sidebar/topbar/bottom-bar.
   Si la sesión se pierde (expiración o logout), vuelve a /login.
   No se pinta nada hasta conocer la sesión: evita un destello del shell y
   peticiones sin token en la primera carga. */

const session = useSessionStore()
const route = useRoute()
const router = useRouter()

const ready = computed(
  () => session.initialized && route.name !== undefined,
)
const isAuthRoute = computed(
  () => route.name === 'login' || route.name === 'forbidden',
)

watch(
  () => session.hasSession,
  (hasSession) => {
    if (!hasSession && !route.meta.public) {
      void router.replace({
        name: 'login',
        query: { expired: '1', redirect: route.fullPath },
      })
    }
  },
)
</script>

<template>
  <div v-if="!ready" class="min-h-dvh bg-bg" aria-busy="true" />

  <RouterView v-else v-slot="{ Component }">
    <AppShell v-if="!isAuthRoute">
      <component :is="Component" />
    </AppShell>
    <component :is="Component" v-else />
  </RouterView>
</template>

<script lang="ts">
export default { name: 'App' }
</script>
