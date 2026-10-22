import { supabase } from '@/lib/supabase'
import { toCashMovement } from '@/lib/mappers'
import type { CashMovement } from '@/types/domain'

/* Caja: una sola vista (ADR-005). Se leen movimientos, no se duplica el libro.
   Nota de arquitectura: PostgREST tiene las funciones de agregación
   deshabilitadas (`PGRST123`), así que los totales del mes NO se pueden pedir
   con `select=amount.sum()`. Sumar en JavaScript está prohibido (AGENTS.md):
   hace falta una vista/RPC de resumen que aún no existe en el modelo.
   Por eso aquí solo se listan movimientos; la UI no suma. */

export interface CashRange {
  startIso: string
  endIso: string
}

export async function listCashMovements(
  range: CashRange,
  limit = 8,
): Promise<CashMovement[]> {
  const { data, error } = await supabase
    .from('v_cash_movements')
    .select('direction,amount,occurred_at,kind,source_id,description,reference')
    .gte('occurred_at', range.startIso)
    .lt('occurred_at', range.endIso)
    .order('occurred_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []).map(toCashMovement)
}

/** Conteo de movimientos del rango: el agregado es un COUNT de SQL. */
export async function countCashMovements(range: CashRange): Promise<number> {
  const { count, error } = await supabase
    .from('v_cash_movements')
    .select('amount', { count: 'exact', head: true })
    .gte('occurred_at', range.startIso)
    .lt('occurred_at', range.endIso)
  if (error) throw error
  return count ?? 0
}
