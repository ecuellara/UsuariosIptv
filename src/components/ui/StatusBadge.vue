<script setup lang="ts">
import { computed } from 'vue'
import type { AccountStatus } from '@/types/domain'
import { statusLabel } from '@/lib/format'

/* COMPONENTES.md §8: el estado se comunica por texto + forma del glifo +
   tratamiento (relleno, tinte, borde discontinuo). Nunca solo por color. */

const props = defineProps<{ status: AccountStatus }>()

const label = computed(() => statusLabel(props.status))
</script>

<template>
  <span class="badge badge-status" :data-status="status">
    <span aria-hidden="true" class="inline-flex size-2.5 shrink-0 items-center justify-center">
      <span v-if="status === 'ACTIVA'" class="size-2 rounded-full bg-current" />
      <svg
        v-else-if="status === 'PROXIMA'"
        viewBox="0 0 12 12"
        class="size-2.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
      >
        <circle cx="6" cy="6" r="4.4" />
        <path d="M6 3.6V6l1.8 1.1" stroke-linecap="round" />
      </svg>
      <svg
        v-else-if="status === 'URGENTE'"
        viewBox="0 0 12 12"
        class="size-2.5"
        fill="currentColor"
      >
        <path d="M6 1.4 11 10.4H1z" />
      </svg>
      <svg
        v-else-if="status === 'VENCIDA'"
        viewBox="0 0 12 12"
        class="size-2.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
      >
        <rect x="1.4" y="1.4" width="9.2" height="9.2" rx="1" />
        <path d="m4.2 4.2 3.6 3.6M7.8 4.2 4.2 7.8" stroke-linecap="round" />
      </svg>
      <svg
        v-else
        viewBox="0 0 12 12"
        class="size-2.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
      >
        <path d="M2.5 6h7" stroke-linecap="round" />
      </svg>
    </span>
    <span>{{ label }}</span>
  </span>
</template>
