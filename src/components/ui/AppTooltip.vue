<script setup lang="ts">
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from 'reka-ui'

/* Tooltip accesible: aparece con hover y con foco de teclado. El disparador
   debe ser enfocable (span con tabindex o un botón). */

defineProps<{ text: string }>()
</script>

<template>
  <TooltipProvider :delay-duration="150">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          side="top"
          :side-offset="6"
          class="max-w-64 rounded-sm border border-border bg-surface-raised px-2 py-1.5 text-xs leading-4 text-content shadow-md"
          style="z-index: var(--z-tooltip)"
        >
          {{ text }}
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
