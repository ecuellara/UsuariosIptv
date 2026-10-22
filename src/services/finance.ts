import { supabase } from '@/lib/supabase'
import { monthKeyToDate, monthRangeInLima } from '@/lib/finance'
import { toCashMonthly, toExpense, toProfitMonthly } from '@/lib/mappers'
import type {
  CashMonthly,
  Expense,
  ExpenseCategory,
  ProfitMonthly,
} from '@/types/domain'

/* Finanzas. Los totales de caja y rentabilidad se leen de las vistas de SQL
   (`v_cash_monthly`, `v_profit_monthly`); el navegador no agrega filas.
   `expenses` es la única tabla de dinero que se edita directo: tiene política
   de admin y trigger de auditoría (docs/02 §5). */

const CASH_COLUMNS = 'month,income,outflow,net,payments_count,token_purchases'
const PROFIT_COLUMNS =
  'month,agreed_revenue,token_cost,operating_expenses,gross_margin'
const EXPENSE_COLUMNS = 'id,category,amount,spent_at,description,reference'

/** Fila del mes o `null` si no hubo movimientos (no es un error). */
export async function getCashMonthly(
  monthKey: string,
): Promise<CashMonthly | null> {
  const { data, error } = await supabase
    .from('v_cash_monthly')
    .select(CASH_COLUMNS)
    .eq('month', monthKeyToDate(monthKey))
    .maybeSingle()

  if (error) throw error
  return data ? toCashMonthly(data) : null
}

/** Fila del mes o `null` si no hubo ingresos ni gastos (se muestra en ceros). */
export async function getProfitMonthly(
  monthKey: string,
): Promise<ProfitMonthly | null> {
  const { data, error } = await supabase
    .from('v_profit_monthly')
    .select(PROFIT_COLUMNS)
    .eq('month', monthKeyToDate(monthKey))
    .maybeSingle()

  if (error) throw error
  return data ? toProfitMonthly(data) : null
}

/** Gastos del mes en el calendario de Lima, ya ordenados por fecha. */
export async function listExpenses(monthKey: string): Promise<Expense[]> {
  const range = monthRangeInLima(monthKey)
  const { data, error } = await supabase
    .from('expenses')
    .select(EXPENSE_COLUMNS)
    .gte('spent_at', range.startIso)
    .lt('spent_at', range.endIso)
    .order('spent_at', { ascending: false })
    .limit(500)

  if (error) throw error
  return (data ?? []).map(toExpense)
}

export interface ExpenseInput {
  category: ExpenseCategory
  amount: number
  spentAt: string
  description: string
  reference: string | null
}

export async function createExpense(input: ExpenseInput): Promise<string> {
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      category: input.category,
      amount: input.amount,
      spent_at: input.spentAt,
      description: input.description,
      reference: input.reference,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export type ExpensePatch = Partial<
  Pick<
    ExpenseInput,
    'category' | 'amount' | 'spentAt' | 'description' | 'reference'
  >
>

export async function updateExpense(
  id: string,
  patch: ExpensePatch,
): Promise<void> {
  const payload: {
    category?: ExpenseCategory
    amount?: number
    spent_at?: string
    description?: string
    reference?: string | null
  } = {}
  if (patch.category !== undefined) payload.category = patch.category
  if (patch.amount !== undefined) payload.amount = patch.amount
  if (patch.spentAt !== undefined) payload.spent_at = patch.spentAt
  if (patch.description !== undefined) payload.description = patch.description
  if (patch.reference !== undefined) payload.reference = patch.reference

  const { error } = await supabase.from('expenses').update(payload).eq('id', id)
  if (error) throw error
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
}
