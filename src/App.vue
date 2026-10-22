<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import AppButton from '@/components/ui/AppButton.vue'
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
/* La sesión existe, pero `profiles` no se pudo leer por red/5xx. */
const accessUnknown = computed(
  () => session.hasSession && session.accessCheckFailed,
)

watch(
  () => session.hasSession,
  (hasSession) => {
    if (!hasSession && !route.meta.public) {
      /* Solo se anuncia "Tu sesión expiró" cuando de verdad expiró; un cierre
         voluntario vuelve al login sin ese aviso. */
      void router.replace({
        name: 'login',
        query: {
          ...(session.expiredNotice ? { expired: '1' } : {}),
          redirect: route.fullPath,
        },
      })
    }
  },
)

/* Si el segundo factor pasa a estar pendiente con la app ya abierta (por
   ejemplo tras una reautenticación), se abandona la ruta privada. El guard
   también lo cubre, pero este watch evita pintar datos con un JWT aal1. */
watch(
  () => session.mfaPending,
  (pending) => {
    if (!pending || route.name === 'login') return
    void router.replace({
      name: 'login',
      query: {
        ...(route.fullPath === '/' ? {} : { redirect: route.fullPath }),
      },
    })
  },
)
</script>

<template>
  <div v-if="!ready" class="min-h-dvh bg-bg" aria-busy="true" />

  <div
    v-else-if="accessUnknown"
    class="flex min-h-dvh items-center justify-center px-4"
  >
    <div
      class="w-full max-w-md rounded-lg border border-border bg-surface p-6 text-center shadow-sm"
    >
      <h1 class="text-2xl font-semibold text-content">
        No pudimos verificar tu acceso
      </h1>
      <p class="mt-2 text-base text-content-muted">
        Tu sesión sigue abierta, pero no pudimos leer tu perfil. Revisa la
        conexión y vuelve a intentarlo.
      </p>
      <p v-if="session.errorMessage" class="mt-2 text-sm text-danger-text" role="alert">
        {{ session.errorMessage }}
      </p>
      <div class="mt-6 flex flex-col gap-2">
        <AppButton variant="primary" block :loading="session.loading" @click="session.retryAccess()">
          Reintentar
        </AppButton>
        <AppButton variant="secondary" block @click="session.signOut()">
          Cerrar sesión
        </AppButton>
      </div>
    </div>
  </div>

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
