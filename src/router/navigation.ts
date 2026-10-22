import type { IconName } from '@/components/ui/AppIcon.vue'

/* Orden fijo de PANTALLAS.md §0. Los módulos del slice 2 existen como ruta
   para que la navegación no prometa destinos que no están y expliquen su
   estado sin inventar datos. */

export interface NavItem {
  name: string
  label: string
  icon: IconName
  /** Módulo planificado para el slice 2. */
  soon?: boolean
}

export const NAV_ITEMS: readonly NavItem[] = [
  { name: 'dashboard', label: 'Hoy', icon: 'home' },
  { name: 'customers', label: 'Clientes', icon: 'users' },
  { name: 'accounts', label: 'Cuentas IPTV', icon: 'tv' },
  { name: 'followup', label: 'Seguimiento', icon: 'message-circle', soon: true },
  { name: 'renewals', label: 'Renovaciones', icon: 'refresh' },
  { name: 'tokens', label: 'Tokens', icon: 'coins' },
  { name: 'finance', label: 'Finanzas', icon: 'wallet' },
  { name: 'settings', label: 'Configuración', icon: 'settings' },
]

export const MOBILE_NAV_ITEMS: readonly NavItem[] = [
  { name: 'dashboard', label: 'Hoy', icon: 'home' },
  { name: 'customers', label: 'Clientes', icon: 'users' },
  { name: 'accounts', label: 'Cuentas', icon: 'tv' },
]

export const MOBILE_MORE_ITEMS: readonly NavItem[] = NAV_ITEMS.filter(
  (item) => !MOBILE_NAV_ITEMS.some((mobile) => mobile.name === item.name),
)
