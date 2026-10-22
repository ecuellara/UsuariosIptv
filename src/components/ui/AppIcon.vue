<script setup lang="ts">
import { computed } from 'vue'

/* Set de iconos inline (sin fuentes ni red). Trazo 1.75, currentColor.
   Decorativos: aria-hidden por defecto; quien los usa con acción pone
   aria-label en el botón. */

export type IconName =
  | 'home'
  | 'users'
  | 'tv'
  | 'message-circle'
  | 'refresh'
  | 'coins'
  | 'wallet'
  | 'settings'
  | 'menu'
  | 'x'
  | 'search'
  | 'plus'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'check'
  | 'alert-circle'
  | 'alert-triangle'
  | 'info'
  | 'calendar'
  | 'whatsapp'
  | 'copy'
  | 'logout'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'external-link'
  | 'arrow-right'
  | 'archive'
  | 'pencil'
  | 'trash'
  | 'clock'
  | 'banknote'
  | 'receipt'
  | 'user-plus'
  | 'eye'
  | 'eye-off'
  | 'more'
  | 'circle-dot'
  | 'inbox'

const props = withDefaults(
  defineProps<{ name: IconName; size?: number }>(),
  { size: 18 },
)

const PATHS: Record<IconName, string> = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5',
  users:
    'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-4A3.5 3.5 0 0 0 5 17.5V19M10.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  tv: 'M3 6.5h18v11H3zM8 21h8M12 17.5V21M8 3l4 3.5L16 3',
  'message-circle':
    'M20 12a8 8 0 1 1-3.2-6.4M20 12c0 4.4-3.6 8-8 8-1.2 0-2.4-.3-3.4-.8L4 20l1-4.1A8 8 0 0 1 4 12',
  refresh: 'M20 11a8 8 0 1 0-2.3 6.3M20 5v6h-6',
  coins:
    'M12 7c4.4 0 8-1.3 8-2.5S16.4 2 12 2 4 3.3 4 4.5 7.6 7 12 7ZM4 4.5v5C4 10.7 7.6 12 12 12s8-1.3 8-2.5v-5M4 9.5v5C4 15.7 7.6 17 12 17s8-1.3 8-2.5v-5M4 14.5v5C4 20.7 7.6 22 12 22s8-1.3 8-2.5v-5',
  wallet: 'M3 7.5A2.5 2.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5V8M3 7.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3M3 8h17m0 4h-4a2 2 0 0 0 0 4h4z',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 13.6H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 7L4.6 7a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9',
  menu: 'M4 7h16M4 12h16M4 17h16',
  x: 'M6 6l12 12M18 6 6 18',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4.2-4.2',
  plus: 'M12 5v14M5 12h14',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-left': 'm14 6-6 6 6 6',
  'chevron-right': 'm10 6 6 6-6 6',
  check: 'm5 13 4 4L19 7',
  'alert-circle': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 8v5M12 16.5v.5',
  'alert-triangle': 'M12 3.5 21 20H3zM12 9v5M12 17v.5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v6M12 7.5v.5',
  calendar: 'M4 6.5h16V20H4zM4 10.5h16M8 3v4M16 3v4',
  whatsapp:
    'M20 11.7a8 8 0 0 1-11.8 7L4 20l1.3-4.1A8 8 0 1 1 20 11.7ZM8.5 8.6c.2 2.6 2.2 4.6 4.8 4.9l1-.9 1.9.9c0 1-.8 1.7-1.7 1.8-3.6.4-7.2-3.2-6.8-6.8.1-.9.8-1.7 1.8-1.7l.9 1.9-.9.9Z',
  copy: 'M9 9h10v12H9zM5 15H3V3h12v2',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h9',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  monitor: 'M3 5h18v11H3zM8 21h8M12 16v5',
  'external-link': 'M14 4h6v6M20 4l-8 8M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5',
  'arrow-right': 'M4 12h15M13 6l6 6-6 6',
  archive: 'M3 4h18v4H3zM5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M9 12h6',
  pencil: 'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3ZM14.5 5.5l3 3',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2',
  banknote: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 9v.5M18 14.5V15',
  receipt: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6',
  'user-plus': 'M15 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-3A3.5 3.5 0 0 0 5 17.5V19M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM18 9v6M15 12h6',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  'eye-off':
    'M3 3l18 18M10.6 6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.1 9.5 6.1a17 17 0 0 1-2.7 3.4M6.3 7.7A16.6 16.6 0 0 0 2.5 12S6 18.1 12 18.1c1.2 0 2.3-.2 3.3-.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  'circle-dot': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  inbox: 'M3 13h5l1.5 3h5L16 13h5M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
}

const path = computed(() => PATHS[props.name])
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="path" />
  </svg>
</template>
