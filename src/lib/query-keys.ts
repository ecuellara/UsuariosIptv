import type { AccountListFilter } from '@/types/domain'

/* Claves de TanStack Query en un solo lugar: cualquier mutación invalida por
   prefijo y no hay strings sueltos por la app. */

export const queryKeys = {
  session: {
    profile: (userId: string) => ['session', 'profile', userId] as const,
  },
  dashboard: {
    metrics: (customerFree?: boolean) =>
      ['dashboard', 'metrics', customerFree ?? true] as const,
    cash: (monthKey: string) => ['dashboard', 'cash', monthKey] as const,
  },
  accounts: {
    all: ['accounts'] as const,
    list: (filter: AccountListFilter) => ['accounts', 'list', filter] as const,
    detail: (id: string) => ['accounts', 'detail', id] as const,
    byCustomer: (customerId: string) =>
      ['accounts', 'customer', customerId] as const,
    stale: (limit: number) => ['accounts', 'stale', limit] as const,
    countToday: ['accounts', 'count-today'] as const,
  },
  customers: {
    all: ['customers'] as const,
    list: (params: {
      search: string
      page: number
      pageSize: number
      includeArchived: boolean
    }) => ['customers', 'list', params] as const,
    detail: (id: string) => ['customers', 'detail', id] as const,
  },
  plans: {
    all: ['plans'] as const,
  },
  settings: {
    all: ['settings'] as const,
  },
  tokens: {
    stock: ['tokens', 'stock'] as const,
  },
}
