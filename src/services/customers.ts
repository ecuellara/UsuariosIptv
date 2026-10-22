import { supabase } from '@/lib/supabase'
import { toCustomer, toCustomerSummary } from '@/lib/mappers'
import { sanitizeSearch } from '@/lib/text'
import type { Customer, CustomerSummary } from '@/types/domain'
import type { TablesUpdate } from '@/types/domain'

export const CUSTOMER_PAGE_SIZE = 25

const CUSTOMER_COLUMNS =
  'id,first_name,last_name,phone,notes,archived_at,created_at,updated_at'

const CUSTOMER_SUMMARY_COLUMNS =
  'customer_id,first_name,last_name,phone,archived_at,accounts_total,accounts_active,next_expiration,worst_status,last_renewal_at'

export interface CustomerSummaryPage {
  rows: CustomerSummary[]
  total: number
}

export interface CustomerListParams {
  search?: string
  page?: number
  pageSize?: number
  includeArchived?: boolean
}

/**
 * Listado de clientes con sus agregados. La paginación y el filtro por texto
 * se resuelven en el servidor sobre `v_customer_summary` (worst_status,
 * next_expiration y last_renewal_at ya calculados en SQL).
 */
export async function listCustomerSummaries(
  params: CustomerListParams = {},
): Promise<CustomerSummaryPage> {
  const {
    search = '',
    page = 0,
    pageSize = CUSTOMER_PAGE_SIZE,
    includeArchived = false,
  } = params

  let query = supabase
    .from('v_customer_summary')
    .select(CUSTOMER_SUMMARY_COLUMNS, { count: 'exact' })

  if (!includeArchived) query = query.is('archived_at', null)

  const term = sanitizeSearch(search)
  if (term.length > 0) {
    query = query.or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%`,
    )
  }

  const from = page * pageSize
  const { data, error, count } = await query
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })
    .range(from, from + pageSize - 1)

  if (error) throw error
  return { rows: (data ?? []).map(toCustomerSummary), total: count ?? 0 }
}

/** Opciones para el selector de cliente (máx. 50, sin archivados). */
export async function searchCustomerOptions(
  term: string,
  limit = 8,
): Promise<Customer[]> {
  let query = supabase
    .from('customers')
    .select(CUSTOMER_COLUMNS)
    .is('archived_at', null)
    .order('last_name', { ascending: true })
    .limit(limit)

  const clean = sanitizeSearch(term)
  if (clean.length > 0) {
    query = query.or(
      `first_name.ilike.%${clean}%,last_name.ilike.%${clean}%,phone.ilike.%${clean}%`,
    )
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(toCustomer)
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('customers')
    .select(CUSTOMER_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? toCustomer(data) : null
}

export interface CustomerInput {
  firstName: string
  lastName: string
  phone: string
  notes: string | null
}

export async function createCustomer(input: CustomerInput): Promise<string> {
  const { data, error } = await supabase
    .from('customers')
    .insert({
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
      notes: input.notes,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export type CustomerPatch = Pick<
  TablesUpdate<'customers'>,
  'first_name' | 'last_name' | 'phone' | 'notes' | 'archived_at'
>

export async function updateCustomer(
  id: string,
  patch: CustomerPatch,
): Promise<void> {
  const { error } = await supabase.from('customers').update(patch).eq('id', id)
  if (error) throw error
}

/** Cuentas activas del cliente: bloquea el archivado si existen (PANTALLAS §4). */
export async function countActiveAccounts(customerId: string): Promise<number> {
  const { count, error } = await supabase
    .from('v_account_status')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .neq('status', 'ARCHIVADA')
  if (error) throw error
  return count ?? 0
}

/** Total de clientes no archivados (métrica del dashboard; COUNT de SQL). */
export async function countCustomers(): Promise<number> {
  const { count, error } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .is('archived_at', null)
  if (error) throw error
  return count ?? 0
}
