import { supabase } from '@/lib/supabase'
import { toAccount, toRenewalSummary } from '@/lib/mappers'
import { ACCOUNT_COLUMNS } from '@/services/accounts'
import type {
  RenewalSummary,
  RenewalWithAccount,
} from '@/types/domain'

/* Lecturas de renovaciones. Los importes agregados (pagado, pendiente, costo
   de tokens y margen) vienen calculados de `v_renewal_summary`; el navegador
   no los suma (AGENTS.md). Las escrituras van por `services/rpc.ts`. */

const RENEWAL_COLUMNS =
  'id,account_id,plan_id,plan_name,operation_type,duration_months,devices,price_snapshot,amount_agreed,tokens_used,previous_expiration,new_expiration,expiration_edited,effective_at,recorded_at,amount_paid,amount_pending,token_cost,gross_margin,is_reversed,reversal_reason,notes,created_at,created_by,idempotency_key,reversed_at,reversed_by'

export interface RenewalListParams {
  limit?: number
  includeReversed?: boolean
}

export async function listRenewalsByAccount(
  accountId: string,
): Promise<RenewalSummary[]> {
  const { data, error } = await supabase
    .from('v_renewal_summary')
    .select(RENEWAL_COLUMNS)
    .eq('account_id', accountId)
    .order('recorded_at', { ascending: false })
    .order('id', { ascending: false })

  if (error) throw error
  return (data ?? []).map(toRenewalSummary)
}

export async function listRenewals(
  params: RenewalListParams = {},
): Promise<RenewalSummary[]> {
  const { limit = 100, includeReversed = true } = params
  let query = supabase.from('v_renewal_summary').select(RENEWAL_COLUMNS)

  if (!includeReversed) query = query.eq('is_reversed', false)

  const { data, error } = await query
    .order('recorded_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []).map(toRenewalSummary)
}

/** Cuenta las renovaciones de una cuenta (SQL) para elegir el tipo por defecto. */
export async function countRenewals(accountId: string): Promise<number> {
  const { count, error } = await supabase
    .from('renewals')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
  if (error) throw error
  return count ?? 0
}

/**
 * Renovaciones recientes con su cuenta. La vista no trae el nombre del cliente,
 * así que se resuelve con una segunda lectura de `v_account_status` (sin
 * recalcular estados ni sumar importes).
 */
export async function listRenewalsWithAccounts(
  params: RenewalListParams = {},
): Promise<RenewalWithAccount[]> {
  const renewals = await listRenewals(params)
  const accountIds = [...new Set(renewals.map((renewal) => renewal.accountId))]
  if (accountIds.length === 0) return []

  const { data, error } = await supabase
    .from('v_account_status')
    .select(ACCOUNT_COLUMNS)
    .in('id', accountIds)

  if (error) throw error

  const accounts = new Map((data ?? []).map((row) => [row.id, toAccount(row)]))
  return renewals.map((renewal) => ({
    renewal,
    account: accounts.get(renewal.accountId) ?? null,
  }))
}
