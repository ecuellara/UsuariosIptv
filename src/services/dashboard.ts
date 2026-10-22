import { countAccounts, listStaleAccounts } from '@/services/accounts'
import { countCashMovements, listCashMovements, type CashRange } from '@/services/cash'
import { countCustomers } from '@/services/customers'
import { getAppSettings, getTokenStock } from '@/services/plans'
import type { Account, AppSettings, CashMovement, TokenStock } from '@/types/domain'

/**
 * Métricas del dashboard. Todos los conteos son `COUNT` ejecutados por
 * PostgREST (SQL); el navegador no agrega estados ni importes.
 *
 * Nota: son varias consultas `head: true` porque PostgREST tiene las funciones
 * de agregación deshabilitadas en este proyecto. Una vista de resumen las
 * reduciría a una sola petición cuando `db-architect` la agregue.
 */
export interface DashboardMetrics {
  today: number
  urgent: number
  warning: number
  overdue: number
  active: number
  stale: number
  customers: number
  totalAccounts: number
  stock: TokenStock
  settings: AppSettings
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const [
    today,
    urgent,
    warning,
    overdue,
    active,
    stale,
    customers,
    totalAccounts,
    stock,
    settings,
  ] = await Promise.all([
    countAccounts({ scope: 'TODAY' }),
    countAccounts({ scope: 'URGENT' }),
    countAccounts({ scope: 'WARNING' }),
    countAccounts({ scope: 'OVERDUE' }),
    countAccounts({ scope: 'ACTIVE' }),
    countAccounts({ scope: 'ALL', staleOnly: true }),
    countCustomers(),
    countAccounts({ scope: 'ALL' }),
    getTokenStock(),
    getAppSettings(),
  ])

  return {
    today,
    urgent,
    warning,
    overdue,
    active,
    stale,
    customers,
    totalAccounts,
    stock,
    settings,
  }
}

export interface CashOverview {
  movements: CashMovement[]
  count: number
}

export async function getCashOverview(range: CashRange): Promise<CashOverview> {
  const [movements, count] = await Promise.all([
    listCashMovements(range, 6),
    countCashMovements(range),
  ])
  return { movements, count }
}

export function getStaleAccounts(limit = 4): Promise<Account[]> {
  return listStaleAccounts(limit)
}
