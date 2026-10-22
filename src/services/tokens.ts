import { supabase } from '@/lib/supabase'
import { toTokenMovement, toTokenPurchase, toTokenSummary } from '@/lib/mappers'
import type { TokenMovement, TokenPurchase, TokenSummary } from '@/types/domain'

/* Lecturas del inventario. `v_token_summary` devuelve una sola fila con saldo,
   costo promedio y valor de inventario ya calculados. Cero filas significan
   "no disponible", nunca saldo 0 (docs/05-sql.md §11.3). */

const TOKEN_SUMMARY_COLUMNS =
  'quantity,avg_unit_cost,inventory_value,min_balance,below_minimum'

const PURCHASE_COLUMNS =
  'id,quantity,total_cost,unit_cost,purchased_at,supplier,reference,notes'

const MOVEMENT_COLUMNS =
  'id,movement_type,quantity_delta,unit_cost,cost_amount,renewal_id,purchase_id,reason,created_at'

export async function getTokenSummary(): Promise<TokenSummary | null> {
  const { data, error } = await supabase
    .from('v_token_summary')
    .select(TOKEN_SUMMARY_COLUMNS)
    .maybeSingle()

  if (error) throw error
  return data ? toTokenSummary(data) : null
}

export async function listTokenPurchases(limit = 25): Promise<TokenPurchase[]> {
  const { data, error } = await supabase
    .from('token_purchases')
    .select(PURCHASE_COLUMNS)
    .order('purchased_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []).map(toTokenPurchase)
}

export async function listTokenMovements(limit = 50): Promise<TokenMovement[]> {
  const { data, error } = await supabase
    .from('token_movements')
    .select(MOVEMENT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []).map(toTokenMovement)
}
