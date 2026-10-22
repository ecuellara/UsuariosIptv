<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

/* Módulos del slice 2. No se simulan datos ni se muestran métricas falsas:
   se explica qué hará el módulo y qué falta para construirlo. */

const route = useRoute()
const pending = computed(() => route.meta.pending)
</script>

<template>
  <div class="flex flex-col gap-6">
    <header>
      <h1 class="text-3xl font-semibold text-content">{{ route.meta.title }}</h1>
      <p class="mt-1 max-w-2xl text-base text-content-muted">
        {{ pending?.summary }}
      </p>
    </header>

    <AppAlert variant="info" title="Módulo en preparación">
      Esta entrega cubre autenticación, dashboard, clientes, cuentas IPTV y planes.
      El módulo se habilitará en la siguiente entrega, sobre esta misma base de código.
    </AppAlert>

    <section class="panel p-5" aria-labelledby="pendiente-alcance">
      <h2 id="pendiente-alcance" class="text-xl font-semibold text-content">
        Qué incluirá
      </h2>
      <ul class="mt-3 flex flex-col gap-2">
        <li
          v-for="item in pending?.items ?? []"
          :key="item"
          class="flex items-start gap-2 text-base text-content"
        >
          <AppIcon name="circle-dot" :size="16" class="mt-1 shrink-0 text-content-muted" />
          <span>{{ item }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>
