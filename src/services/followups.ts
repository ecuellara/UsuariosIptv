import { supabase } from '@/lib/supabase'
import { limaDateKey } from '@/lib/dates'
import {
  toAccount,
  toContactLog,
  toFollowupRecord,
  toWhatsAppTemplate,
} from '@/lib/mappers'
import { sanitizeSearch } from '@/lib/text'
import { ACCOUNT_COLUMNS } from '@/services/accounts'
import type {
  ContactLog,
  FollowupInboxFilter,
  FollowupInboxRow,
  FollowupRecord,
  FollowupStatus,
  WhatsAppTemplate,
} from '@/types/domain'

/* Seguimiento: lecturas de `v_account_status` + `renewal_followups` +
   `contact_logs`. Las escrituras de seguimiento NO viven aquí: van por
   `services/rpc.ts` (`rpc_update_followup`). Las plantillas sí se editan
   directo porque la RLS lo permite y no hay RPC para ellas. */

/** Tope defensivo de la bandeja. Con más filas se avisa, no se oculta. */
const INBOX_LIMIT = 1000
const CONTACT_LIMIT = 100

const FOLLOWUP_COLUMNS =
  'id,account_id,status,last_contact_at,next_followup_at,notes'

const CONTACT_COLUMNS =
  'id,account_id,template_key,rendered_body,wa_url,event_type,followup_status_after,notes,created_at'

const TEMPLATE_COLUMNS = 'id,key,name,body,is_active,updated_at'

export interface FollowupInboxResult {
  rows: FollowupInboxRow[]
  total: number
  /** `total` supera lo devuelto: la bandeja aplica un tope explícito. */
  truncated: boolean
}

function applyWindowFilters(
  query: ReturnType<typeof baseAccountQuery>,
  window: FollowupInboxFilter['window'],
) {
  switch (window) {
    case 'TODAY':
      /* El día es el de Lima y lo calcula `v_account_status.expires_on`. */
      return query.eq('expires_on', limaDateKey(new Date()))
    case 'THREE':
      return query.gte('days_left', 0).lte('days_left', 3)
    case 'WEEK':
      return query.gte('days_left', 0).lte('days_left', 7)
    case 'OVERDUE':
      /* Estado de vigencia desde la vista, nunca recalculado (ADR-006). */
      return query.eq('status', 'VENCIDA')
    case 'ALL':
    case undefined:
      return query
  }
}

function baseAccountQuery() {
  return supabase
    .from('v_account_status')
    .select(ACCOUNT_COLUMNS, { count: 'exact' })
    // Una cuenta archivada no es trabajo pendiente.
    .neq('status', 'ARCHIVADA')
}

async function loadFollowups(accountIds: string[]): Promise<Map<string, FollowupRecord>> {
  const map = new Map<string, FollowupRecord>()
  if (accountIds.length === 0) return map

  /* PostgREST arma una URL por consulta: se trocea para no superar límites. */
  const chunkSize = 80
  const chunks: string[][] = []
  for (let index = 0; index < accountIds.length; index += chunkSize) {
    chunks.push(accountIds.slice(index, index + chunkSize))
  }

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await supabase
        .from('renewal_followups')
        .select(FOLLOWUP_COLUMNS)
        .in('account_id', chunk)
      if (error) throw error
      return data ?? []
    }),
  )

  for (const row of results.flat()) {
    map.set(row.account_id, toFollowupRecord(row))
  }
  return map
}

function compareInboxRows(a: FollowupInboxRow, b: FollowupInboxRow): number {
  // Urgencia: `status_rank` viene de SQL (VENCIDA=0 … ARCHIVADA=4).
  if (a.account.statusRank !== b.account.statusRank) {
    return a.account.statusRank - b.account.statusRank
  }
  // Luego la próxima acción más cercana; sin programar va al final.
  const nextA = a.followup.nextFollowupAt ?? '9999-12-31T23:59:59.999Z'
  const nextB = b.followup.nextFollowupAt ?? '9999-12-31T23:59:59.999Z'
  if (nextA !== nextB) return nextA < nextB ? -1 : 1
  return a.account.expiresOn < b.account.expiresOn ? -1 : 1
}

/**
 * Bandeja de seguimiento. Los filtros de vigencia, estado de seguimiento y
 * búsqueda se resuelven en SQL; el cruce con `renewal_followups` se hace aquí
 * porque la vista no expone `last_contact_at` ni `next_followup_at`.
 */
export async function listFollowupInbox(
  filter: FollowupInboxFilter = {},
): Promise<FollowupInboxResult> {
  const { status = 'TODOS', window = 'ALL', pendingOnly = false, search = '' } = filter

  let query = baseAccountQuery()

  query = applyWindowFilters(query, window)

  const effectiveStatus: FollowupStatus | 'TODOS' = pendingOnly ? 'PENDIENTE' : status
  if (effectiveStatus !== 'TODOS') {
    query = query.eq('followup_status', effectiveStatus)
  }

  const term = sanitizeSearch(search)
  if (term.length > 0) {
    query = query.or(
      `customer_name.ilike.%${term}%,external_username.ilike.%${term}%,phone.ilike.%${term}%`,
    )
  }

  const { data, error, count } = await query
    .order('status_rank', { ascending: true })
    .order('expires_on', { ascending: true })
    .limit(INBOX_LIMIT)

  if (error) throw error

  const accounts = (data ?? []).map(toAccount)
  const followups = await loadFollowups(accounts.map((account) => account.id))

  const rows: FollowupInboxRow[] = accounts.map((account) => ({
    account,
    followup:
      followups.get(account.id) ?? {
        id: '',
        accountId: account.id,
        status: account.followupStatus ?? 'PENDIENTE',
        lastContactAt: null,
        nextFollowupAt: null,
        notes: null,
      },
  }))

  rows.sort(compareInboxRows)

  const total = count ?? rows.length
  return { rows, total, truncated: total > rows.length }
}

export async function getFollowup(accountId: string): Promise<FollowupRecord | null> {
  const { data, error } = await supabase
    .from('renewal_followups')
    .select(FOLLOWUP_COLUMNS)
    .eq('account_id', accountId)
    .maybeSingle()

  if (error) throw error
  return data ? toFollowupRecord(data) : null
}

/** Plan de la última renovación NO revertida; `null` si no hay ninguna. */
export async function getLastPlanName(accountId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('renewals')
    .select('plan_name')
    .eq('account_id', accountId)
    .is('reversed_at', null)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data?.plan_name ?? null
}

export interface CustomerNameParts {
  firstName: string
  lastName: string
}

/** Nombre y apellido reales del cliente (la vista solo trae el nombre completo). */
export async function getCustomerNameParts(
  customerId: string,
): Promise<CustomerNameParts | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('first_name,last_name')
    .eq('id', customerId)
    .maybeSingle()

  if (error) throw error
  return data ? { firstName: data.first_name, lastName: data.last_name } : null
}

export async function listContactLogs(accountId: string): Promise<ContactLog[]> {
  const { data, error } = await supabase
    .from('contact_logs')
    .select(CONTACT_COLUMNS)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(CONTACT_LIMIT)

  if (error) throw error
  return (data ?? []).map(toContactLog)
}

export async function listWhatsAppTemplates(): Promise<WhatsAppTemplate[]> {
  const { data, error } = await supabase
    .from('whatsapp_templates')
    .select(TEMPLATE_COLUMNS)
    .order('key', { ascending: true })

  if (error) throw error
  return (data ?? []).map(toWhatsAppTemplate)
}

export interface WhatsAppTemplatePatch {
  name: string
  body: string
  isActive: boolean
}

/**
 * Guardado directo de una plantilla (RLS permite UPDATE; no existe RPC).
 * El historial no se toca: `contact_logs.rendered_body` es un snapshot.
 */
export async function updateWhatsAppTemplate(
  id: string,
  patch: WhatsAppTemplatePatch,
): Promise<WhatsAppTemplate> {
  const { data, error } = await supabase
    .from('whatsapp_templates')
    .update({
      name: patch.name.trim(),
      body: patch.body,
      is_active: patch.isActive,
    })
    .eq('id', id)
    .select(TEMPLATE_COLUMNS)
    .single()

  if (error) throw error
  return toWhatsAppTemplate(data)
}
