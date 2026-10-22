import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

export type ThemePreference = 'light' | 'dark' | 'system'
export type DensityPreference = 'comfortable' | 'compact'

const THEME_KEY = 'iptv-manager-theme'
const DENSITY_KEY = 'iptv-manager-density'

function readStored<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = localStorage.getItem(key)
  return raw && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : fallback
}

const media = window.matchMedia('(prefers-color-scheme: dark)')

/**
 * Preferencias locales (tema y densidad). No tocan la base de datos:
 * PANTALLAS.md §10 → Apariencia.
 */
export const usePreferencesStore = defineStore('preferences', () => {
  const theme = ref<ThemePreference>(
    readStored(THEME_KEY, ['light', 'dark', 'system'] as const, 'system'),
  )
  const density = ref<DensityPreference>(
    readStored(
      DENSITY_KEY,
      ['comfortable', 'compact'] as const,
      'comfortable',
    ),
  )
  const systemPrefersDark = ref(media.matches)

  const resolvedTheme = computed<'light' | 'dark'>(() => {
    if (theme.value === 'system') return systemPrefersDark.value ? 'dark' : 'light'
    return theme.value
  })

  function apply(): void {
    const root = document.documentElement
    root.dataset.theme = resolvedTheme.value
    root.dataset.density = density.value
    root.style.colorScheme = resolvedTheme.value
  }

  function setTheme(next: ThemePreference): void {
    theme.value = next
  }

  function setDensity(next: DensityPreference): void {
    density.value = next
  }

  watch(theme, (value) => localStorage.setItem(THEME_KEY, value), { flush: 'sync' })
  watch(density, (value) => localStorage.setItem(DENSITY_KEY, value), {
    flush: 'sync',
  })
  watch([theme, density, systemPrefersDark], apply, { immediate: true })

  media.addEventListener('change', (event) => {
    systemPrefersDark.value = event.matches
  })

  return { theme, density, resolvedTheme, setTheme, setDensity }
})
