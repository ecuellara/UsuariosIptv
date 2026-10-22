import { supabase } from '@/lib/supabase'
import type { AccountStatus, PaymentMethod } from '@/types/domain'
import type { Enums } from '@/types/domain'

/* =============================================================================
   RPC: única vía de escritura para renewals, payments, token_*, audit_log y
   contact_logs (ADR-008). Reglas de uso:
   - `idempotencyKey` se genera UNA vez al abrir el formulario
     (`crypto.randomUUID()`) y se reutiliza en cada reintento.
   - Los errores llegan con prefijo estable; `toUserMessage` los traduce.
   ========================================================================== */

function newKey(): string {
  return crypto.randomUUID()
}

export const createIdempotencyKey = newKey

/* --- Funciones de cálculo (no mutan) --------------------------------------- */

/* El generador de tipos marca `p_archived_at` como `string` porque el
   argumento no tiene DEFAULT, pero la función SQL acepta NULL (cuenta viva).
   Este cast mínimo y documentado permite pasar NULL sin reimplementar el CASE
   del estado en TypeScript (ADR-006). */
const NOT_ARCHIVED = null as unknown as string

export async function accountStatus(
  expiresAt: string,
  archivedAt: string | null = null,
  at?: string,
): Promise<AccountStatus> {
  const { data, error } = await supabase.rpc('account_status', {
    p_expires_at: expiresAt,
    p_archived_at: archivedAt ?? NOT_ARCHIVED,
    ...(at ? { p_at: at } : {}),
  })
  if (error) throw error
  return data as AccountStatus
}

export async function addMonths(ts: string, months: number): Promise<string> {
  const { data, error } = await supabase.rpc('add_months', {
    p_ts: ts,
    p_months: months,
  })
  if (error) throw error
  return data
}

/* --- Mutaciones ------------------------------------------------------------
   Todas devuelven la fila resultante; la UI invalida queries al terminar. */

export interface RegisterRenewalInput {
  accountId: string
  planId: string
  operationType: Enums<'renewal_operation_type'>
  effectiveAt: string
  newExpiration: string
  expirationEdited: boolean
  amountAgreed: number
  tokensUsed: number
  notes: string | null
  idempotencyKey: string
}

export async function registerRenewal(input: RegisterRenewalInput) {
  const { data, error } = await supabase.rpc('rpc_register_renewal', {
    p_account_id: input.accountId,
    p_plan_id: input.planId,
    p_operation_type: input.operationType,
    p_effective_at: input.effectiveAt,
    p_new_expiration: input.newExpiration,
    p_amount_agreed: input.amountAgreed,
    p_tokens_used: input.tokensUsed,
    p_notes: input.notes ?? '',
    p_idempotency_key: input.idempotencyKey,
    p_expiration_edited: input.expirationEdited,
  })
  if (error) throw error
  return data
}

export interface RecordPaymentInput {
  renewalId: string
  amount: number
  method: PaymentMethod
  paidAt: string
  reference: string | null
  notes: string | null
  idempotencyKey: string
}

export async function recordPayment(input: RecordPaymentInput) {
  const { data, error } = await supabase.rpc('rpc_record_payment', {
    p_renewal_id: input.renewalId,
    p_amount: input.amount,
    p_method: input.method,
    p_paid_at: input.paidAt,
    p_reference: input.reference ?? '',
    p_notes: input.notes ?? '',
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) throw error
  return data
}

export interface PurchaseTokensInput {
  quantity: number
  totalCost: number
  purchasedAt: string
  supplier: string | null
  reference: string | null
  notes: string | null
  idempotencyKey: string
}

export async function purchaseTokens(input: PurchaseTokensInput) {
  const { data, error } = await supabase.rpc('rpc_purchase_tokens', {
    p_quantity: input.quantity,
    p_total_cost: input.totalCost,
    p_purchased_at: input.purchasedAt,
    p_supplier: input.supplier ?? '',
    p_reference: input.reference ?? '',
    p_notes: input.notes ?? '',
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) throw error
  return data
}

export async function adjustTokens(
  delta: number,
  reason: string,
  idempotencyKey: string = newKey(),
) {
  const { data, error } = await supabase.rpc('rpc_adjust_tokens', {
    p_delta: delta,
    p_reason: reason,
    p_idempotency_key: idempotencyKey,
  })
  if (error) throw error
  return data
}

export async function reverseRenewal(
  renewalId: string,
  reason: string,
  idempotencyKey: string = newKey(),
) {
  const { data, error } = await supabase.rpc('rpc_reverse_renewal', {
    p_renewal_id: renewalId,
    p_reason: reason,
    p_idempotency_key: idempotencyKey,
  })
  if (error) throw error
  return data
}

/** Corrección de vencimiento auditada. Usada también en el slice 1. */
export async function setAccountExpiration(
  accountId: string,
  expiresAt: string,
  reason: string,
  idempotencyKey: string = newKey(),
) {
  const { data, error } = await supabase.rpc('rpc_set_account_expiration', {
    p_account_id: accountId,
    p_expires_at: expiresAt,
    p_reason: reason,
    p_idempotency_key: idempotencyKey,
  })
  if (error) throw error
  return data
}

export interface UpdateFollowupInput {
  accountId: string
  status?: Enums<'followup_status'>
  notes?: string
  nextFollowupAt?: string | null
  templateKey?: string
  renderedBody?: string
  waUrl?: string
  eventType?: Enums<'contact_event_type'>
  idempotencyKey?: string
}

export async function updateFollowup(input: UpdateFollowupInput) {
  const { data, error } = await supabase.rpc('rpc_update_followup', {
    p_account_id: input.accountId,
    ...(input.status ? { p_status: input.status } : {}),
    ...(input.notes !== undefined ? { p_notes: input.notes } : {}),
    /* El generador tipa los argumentos nullable como `string`; solo se envía
       cuando hay valor (no se puede limpiar una fecha por esta vía). */
    ...(input.nextFollowupAt ? { p_next_followup_at: input.nextFollowupAt } : {}),
    ...(input.templateKey ? { p_template_key: input.templateKey } : {}),
    ...(input.renderedBody ? { p_rendered_body: input.renderedBody } : {}),
    ...(input.waUrl ? { p_wa_url: input.waUrl } : {}),
    ...(input.eventType ? { p_event_type: input.eventType } : {}),
    p_idempotency_key: input.idempotencyKey ?? newKey(),
  })
  if (error) throw error
  return data
}
