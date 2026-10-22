import { supabase } from '@/lib/supabase'
import { toAccount } from '@/lib/mappers'
import { sanitizeSearch } from '@/lib/text'
import type { Account, AccountListFilter, AccountStatus } from '@/types/domain'
import type { TablesUpdate } from '@/types/domain'

/* Lecturas de cuentas: SIEMPRE desde `v_account_status` (ADR-006).
   El estado nunca se recalcula en el cliente. */

export const ACCOUNT_COLUMNS =
  'id,customer_id,customer_name,phone,external_username,reference,purchased_at,expires_at,initial_expires_at,last_verified_at,notes,archived_at,created_by,created_at,updated_at,expires_on,days_left,status,status_rank,followup_status,is_stale_verification'

export const ACCOUNT_PAGE_SIZE = 25

export interface AccountPage {
  rows: Account[]
  total: number
}

export async function listAccounts(
  filter: AccountListFilter = {},
): Promise<AccountPage> {
  const {
    scope = 'ALL',
    status = 'TODOS',
    search = '',
    includeArchived = false,
    customerId,
    staleOnly = false,
    page = 0,
    pageSize = ACCOUNT_PAGE_SIZE,
  } = filter

  let query = supabase
    .from('v_account_status')
    .select(ACCOUNT_COLUMNS, { count: 'exact' })

  if (customerId) query = query.eq('customer_id', customerId)

  switch (scope) {
    case 'TODAY':
      query = query.eq('status', 'URGENTE').eq('days_left', 0)
      break
    case 'URGENT':
      query = query.eq('status', 'URGENTE')
      break
    case 'WARNING':
      query = query.in('status', ['URGENTE', 'PROXIMA'])
      break
    case 'OVERDUE':
      query = query.eq('status', 'VENCIDA')
      break
    case 'ACTIVE':
      query = query.eq('status', 'ACTIVA')
      break
    case 'ALL':
      break
  }

  if (status === 'TODOS') {
    if (!includeArchived) query = query.neq('status', 'ARCHIVADA')
  } else {
    query = query.eq('status', status as AccountStatus)
  }

  if (staleOnly) query = query.eq('is_stale_verification', true)

  const term = sanitizeSearch(search)
  if (term.length > 0) {
    query = query.or(
      `customer_name.ilike.%${term}%,external_username.ilike.%${term}%,phone.ilike.%${term}%`,
    )
  }

  // Orden canónico de la vista: status_rank, expires_on (docs/05-sql.md §4.3).
  const from = page * pageSize
  const to = from + pageSize - 1
  const { data, error, count } = await query
    .order('status_rank', { ascending: true })
    .order('expires_on', { ascending: true })
    .order('customer_name', { ascending: true })
    .range(from, to)

  if (error) throw error
  return { rows: (data ?? []).map(toAccount), total: count ?? 0 }
}

export async function getAccount(id: string): Promise<Account | null> {
  const { data, error } = await supabase
    .from('v_account_status')
    .select(ACCOUNT_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data ? toAccount(data) : null
}

/** Conteo por estado para los métricos del dashboard: el agregado es de SQL. */
export async function countAccounts(
  filter: Omit<AccountListFilter, 'page' | 'pageSize' | 'search'>,
): Promise<number> {
  const { scope = 'ALL', status = 'TODOS', includeArchived = false, staleOnly = false } =
    filter

  let query = supabase
    .from('v_account_status')
    .select('id', { count: 'exact', head: true })

  switch (scope) {
    case 'TODAY':
      query = query.eq('status', 'URGENTE').eq('days_left', 0)
      break
    case 'URGENT':
      query = query.eq('status', 'URGENTE')
      break
    case 'WARNING':
      query = query.in('status', ['URGENTE', 'PROXIMA'])
      break
    case 'OVERDUE':
      query = query.eq('status', 'VENCIDA')
      break
    case 'ACTIVE':
      query = query.eq('status', 'ACTIVA')
      break
    case 'ALL':
      break
  }

  if (status === 'TODOS') {
    if (!includeArchived) query = query.neq('status', 'ARCHIVADA')
  } else {
    query = query.eq('status', status)
  }

  if (staleOnly) query = query.eq('is_stale_verification', true)

  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

/* --- Escrituras locales (RLS permite INSERT/UPDATE; DELETE está denegado) ---
   `expires_at` NO se escribe aquí: las correcciones van por
   `rpc_set_account_expiration` para dejar rastro en audit_log. */

export interface CreateAccountInput {
  customerId: string
  externalUsername: string
  reference: string | null
  purchasedAt: string
  expiresAt: string
  notes: string | null
}

export async function createAccount(
  input: CreateAccountInput,
  createdBy: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('iptv_accounts')
    .insert({
      customer_id: input.customerId,
      external_username: input.externalUsername,
      reference: input.reference,
      purchased_at: input.purchasedAt,
      expires_at: input.expiresAt,
      initial_expires_at: input.expiresAt,
      notes: input.notes,
      created_by: createdBy,
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export type AccountLocalPatch = Pick<
  TablesUpdate<'iptv_accounts'>,
  'external_username' | 'reference' | 'purchased_at' | 'notes' | 'archived_at' | 'last_verified_at'
>

export async function updateAccount(
  id: string,
  patch: AccountLocalPatch,
): Promise<void> {
  const { error } = await supabase
    .from('iptv_accounts')
    .update(patch)
    .eq('id', id)
  if (error) throw error
}

export async function setAccountArchived(
  id: string,
  archived: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('iptv_accounts')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
}

export async function markVerification(
  id: string,
  isoDate: string,
): Promise<void> {
  const { error } = await supabase
    .from('iptv_accounts')
    .update({ last_verified_at: isoDate })
    .eq('id', id)
  if (error) throw error
}

/** Últimas cuentas sin verificación reciente (rail del dashboard). */
export async function listStaleAccounts(limit = 4): Promise<Account[]> {
  const { data, error } = await supabase
    .from('v_account_status')
    .select(ACCOUNT_COLUMNS)
    .eq('is_stale_verification', true)
    .neq('status', 'ARCHIVADA')
    .order('status_rank', { ascending: true })
    .order('expires_on', { ascending: true })
    .limit(limit)

  if (error) throw error
  return (data ?? []).map(toAccount)
}
