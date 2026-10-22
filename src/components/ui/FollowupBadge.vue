<script setup lang="ts">
import { computed } from 'vue'
import type { FollowupStatus } from '@/types/domain'
import { followupLabel } from '@/lib/format'

const props = defineProps<{ status: FollowupStatus }>()
const label = computed(() => followupLabel(props.status))
</script>

<template>
  <span class="badge badge-followup" :data-followup="status">{{ label }}</span>
</template>
