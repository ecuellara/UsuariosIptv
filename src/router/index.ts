import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useSessionStore } from '@/stores/session'

declare module 'vue-router' {
  interface RouteMeta {
    title: string
    /** Rutas que se pueden abrir sin sesión (solo /login). */
    public?: boolean
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: 'Iniciar sesión', public: true },
  },
  {
    path: '/sin-acceso',
    name: 'forbidden',
    component: () => import('@/views/ForbiddenView.vue'),
    meta: { title: 'Sin acceso' },
  },
  {
    path: '/',
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { title: 'Hoy' },
  },
  {
    path: '/clientes',
    name: 'customers',
    component: () => import('@/views/CustomersView.vue'),
    meta: { title: 'Clientes' },
  },
  {
    path: '/clientes/:customerId',
    name: 'customer-detail',
    component: () => import('@/views/CustomerDetailView.vue'),
    meta: { title: 'Ficha de cliente' },
  },
  {
    path: '/cuentas',
    name: 'accounts',
    component: () => import('@/views/AccountsView.vue'),
    meta: { title: 'Cuentas IPTV' },
  },
  {
    path: '/seguimiento',
    name: 'followup',
    component: () => import('@/views/FollowupView.vue'),
    meta: { title: 'Seguimiento' },
  },
  {
    path: '/renovaciones',
    name: 'renewals',
    component: () => import('@/views/RenewalsView.vue'),
    meta: { title: 'Renovaciones' },
  },
  {
    path: '/tokens',
    name: 'tokens',
    component: () => import('@/views/TokensView.vue'),
    meta: { title: 'Tokens' },
  },
  {
    path: '/finanzas',
    name: 'finance',
    component: () => import('@/views/FinanceView.vue'),
    meta: { title: 'Finanzas' },
  },
  {
    path: '/configuracion',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: 'Configuración' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: 'Página no encontrada', public: true },
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  await session.ensureInitialized()

  if (to.meta.public === true) {
    if (to.name === 'login' && session.isAuthenticated) {
      return { name: 'dashboard' }
    }
    return true
  }

  if (!session.hasSession) {
    return {
      name: 'login',
      query: {
        ...(to.fullPath === '/' ? {} : { redirect: to.fullPath }),
        ...(session.expiredNotice ? { expired: '1' } : {}),
      },
    }
  }

  /* `access === 'denied'` significa que no hay fila en `profiles`. Un fallo de
     red deja `access` en 'unknown' y la app pinta la pantalla de reintento. */
  if (session.access === 'denied') {
    return to.name === 'forbidden' ? true : { name: 'forbidden' }
  }

  if (to.name === 'forbidden' && session.access === 'granted') {
    return { name: 'dashboard' }
  }

  return true
})

router.afterEach((to) => {
  document.title = to.meta.title
    ? `${to.meta.title} · IPTV Manager`
    : 'IPTV Manager'
})
