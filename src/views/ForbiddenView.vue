<script setup lang="ts">
import { useRouter } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()

async function leave(): Promise<void> {
  await session.signOut()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center px-4">
    <div class="w-full max-w-md rounded-lg border border-border bg-surface p-6 text-center shadow-sm">
      <h1 class="text-2xl font-semibold text-content">Tu cuenta no tiene acceso a este panel</h1>
      <p class="mt-2 text-sm leading-5 text-content-muted">
        La sesión es válida, pero falta habilitar el perfil de administrador. No se muestran
        datos ni conteos hasta que exista ese permiso.
      </p>
      <AppButton class="mt-6" variant="secondary" block @click="leave">
        Cerrar sesión
      </AppButton>
    </div>
  </div>
</template>
