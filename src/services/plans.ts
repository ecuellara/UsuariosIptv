import { supabase } from '@/lib/supabase'
import { toAppSettings, toPlan, toTokenStock } from '@/lib/mappers'
import type { AppSettings, Plan, TokenStock } from '@/types/domain'
import type { TablesUpdate } from '@/types/domain'

const PLAN_COLUMNS =
  'id,key,name,duration_months,devices,suggested_price,tokens_required,is_active,sort_order,created_at,updated_at'

export async function listPlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('plans')
    .select(PLAN_COLUMNS)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map(toPlan)
}

export type PlanPatch = Pick<
  TablesUpdate<'plans'>,
  | 'name'
  | 'duration_months'
  | 'devices'
  | 'suggested_price'
  | 'tokens_required'
  | 'is_active'
  | 'sort_order'
>

export async function updatePlan(id: string, patch: PlanPatch): Promise<void> {
  const { error } = await supabase.from('plans').update(patch).eq('id', id)
  if (error) throw error
}

export async function getAppSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('id,urgent_days,warning_days,min_token_balance,timezone,updated_at')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    throw new Error('La configuración del panel no está inicializada.')
  }
  return toAppSettings(data)
}

export interface SettingsPatch {
  urgentDays?: number
  warningDays?: number
  minTokenBalance?: number
}

export async function updateAppSettings(patch: SettingsPatch): Promise<void> {
  const payload: TablesUpdate<'app_settings'> = {}
  if (patch.urgentDays !== undefined) payload.urgent_days = patch.urgentDays
  if (patch.warningDays !== undefined) payload.warning_days = patch.warningDays
  if (patch.minTokenBalance !== undefined) {
    payload.min_token_balance = patch.minTokenBalance
  }

  const { error } = await supabase
    .from('app_settings')
    .update(payload)
    .eq('id', 1)
  if (error) throw error
}

export async function getTokenStock(): Promise<TokenStock> {
  const { data, error } = await supabase
    .from('token_stock')
    .select('id,quantity,avg_unit_cost,updated_at')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('El inventario de tokens no está inicializado.')
  return toTokenStock(data)
}
