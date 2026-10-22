<script setup lang="ts">
import { RouterLink } from 'vue-router'
import EmptyState from '@/components/ui/EmptyState.vue'
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center px-4">
    <div class="w-full max-w-lg rounded-lg border border-border bg-surface">
      <EmptyState
        icon="search"
        title="No encontramos esa página"
        description="La dirección puede estar mal escrita o el módulo cambió de nombre."
      >
        <RouterLink :to="{ name: 'dashboard' }" class="btn" data-variant="primary">
          Ir a Hoy
        </RouterLink>
      </EmptyState>
    </div>
  </div>
</template>
