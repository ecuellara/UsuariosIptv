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
    cashMonthly: (monthKey: string) =>
      ['dashboard', 'cash-monthly', monthKey] as const,
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
  renewals: {
    all: ['renewals'] as const,
    byAccount: (accountId: string) =>
      ['renewals', 'account', accountId] as const,
    list: (params: { includeReversed: boolean; limit: number }) =>
      ['renewals', 'list', params] as const,
  },
  tokens: {
    all: ['tokens'] as const,
    stock: ['tokens', 'stock'] as const,
    summary: ['tokens', 'summary'] as const,
    purchases: ['tokens', 'purchases'] as const,
    movements: ['tokens', 'movements'] as const,
  },
  finance: {
    all: ['finance'] as const,
    cash: (monthKey: string) => ['finance', 'cash', monthKey] as const,
    profit: (monthKey: string) => ['finance', 'profit', monthKey] as const,
    expenses: (monthKey: string) => ['finance', 'expenses', monthKey] as const,
  },
  payments: {
    byRenewal: (renewalId: string) =>
      ['payments', 'renewal', renewalId] as const,
  },
  followups: {
    all: ['followups'] as const,
    inbox: (filter: unknown) => ['followups', 'inbox', filter] as const,
    byAccount: (accountId: string) =>
      ['followups', 'account', accountId] as const,
    contacts: (accountId: string) =>
      ['followups', 'contacts', accountId] as const,
    templates: ['followups', 'templates'] as const,
    plan: (accountId: string) => ['followups', 'plan', accountId] as const,
    customer: (customerId: string) =>
      ['followups', 'customer', customerId] as const,
  },
}
