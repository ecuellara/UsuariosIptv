import type {
  Account,
  AccountStatus,
  AppSettings,
  CashDirection,
  CashKind,
  CashMovement,
  Customer,
  FollowupStatus,
  Plan,
  Profile,
  RenewalSummary,
  TokenMovement,
  TokenPurchase,
  TokenStock,
  TokenSummary,
} from '@/types/domain'
import {
  isAccountStatus,
  type Views,
  type Tables,
} from '@/types/domain'
import { AppError } from '@/lib/errors'

/* Mapeo fila de Supabase → entidad de dominio.
   Las vistas devuelven columnas nullable; el dominio exige las que la UI usa.
   Si falta una, es un bug de datos: se falla con un mensaje explícito en vez
   de pintar `undefined`. */

type AccountViewRow = Views<'v_account_status'>

function required<T>(value: T | null, field: string): T {
  if (value === null) {
    throw new AppError(
      `La cuenta tiene un dato incompleto (${field}).`,
      'DATA',
    )
  }
  return value
}

export function toAccount(row: AccountViewRow): Account {
  const status = required(row.status, 'status')
  if (!isAccountStatus(status)) {
    throw new AppError('La cuenta tiene un estado desconocido.', 'DATA')
  }
  return {
    id: required(row.id, 'id'),
    customerId: required(row.customer_id, 'customer_id'),
    customerName: required(row.customer_name, 'customer_name'),
    phone: required(row.phone, 'phone'),
    externalUsername: required(row.external_username, 'external_username'),
    reference: row.reference,
    purchasedAt: required(row.purchased_at, 'purchased_at'),
    expiresAt: required(row.expires_at, 'expires_at'),
    initialExpiresAt: required(row.initial_expires_at, 'initial_expires_at'),
    lastVerifiedAt: row.last_verified_at,
    notes: row.notes,
    archivedAt: row.archived_at,
    createdAt: required(row.created_at, 'created_at'),
    updatedAt: required(row.updated_at, 'updated_at'),
    expiresOn: required(row.expires_on, 'expires_on'),
    daysLeft: required(row.days_left, 'days_left'),
    status: status as AccountStatus,
    statusRank: required(row.status_rank, 'status_rank'),
    followupStatus: required(row.followup_status, 'followup_status') as FollowupStatus,
    isStaleVerification: required(row.is_stale_verification, 'is_stale_verification'),
  }
}

export function toCustomer(row: Tables<'customers'>): Customer {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    notes: row.notes,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toPlan(row: Tables<'plans'>): Plan {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    durationMonths: row.duration_months,
    devices: row.devices,
    suggestedPrice: row.suggested_price,
    tokensRequired: row.tokens_required,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toTokenStock(
  row: Tables<'token_stock'>,
): TokenStock {
  return {
    quantity: row.quantity,
    avgUnitCost: row.avg_unit_cost,
    updatedAt: row.updated_at,
  }
}

export function toAppSettings(row: Tables<'app_settings'>): AppSettings {
  return {
    urgentDays: row.urgent_days,
    warningDays: row.warning_days,
    minTokenBalance: row.min_token_balance,
    timezone: row.timezone,
    updatedAt: row.updated_at,
  }
}

export function toProfile(row: Tables<'profiles'>): Profile {
  return { id: row.id, displayName: row.display_name }
}

export function toCashMovement(row: Views<'v_cash_movements'>): CashMovement {
  const direction = row.direction
  const kind = row.kind
  const amount = row.amount
  const occurredAt = row.occurred_at
  if (
    (direction !== 'IN' && direction !== 'OUT') ||
    (kind !== 'COBRO' && kind !== 'GASTO' && kind !== 'COMPRA_TOKENS') ||
    amount === null ||
    occurredAt === null
  ) {
    throw new AppError('Movimiento de caja incompleto.', 'DATA')
  }
  return {
    direction: direction as CashDirection,
    kind: kind as CashKind,
    amount,
    occurredAt,
    description: row.description,
    reference: row.reference,
    sourceId: row.source_id,
  }
}

/* --- Renovaciones y tokens ------------------------------------------------ */

function requiredNumber(value: number | null, field: string): number {
  if (value === null || !Number.isFinite(value)) {
    throw new AppError(`Falta un dato numérico (${field}).`, 'DATA')
  }
  return value
}

type RenewalSummaryRow = Pick<
  Views<'v_renewal_summary'>,
  | 'id'
  | 'account_id'
  | 'plan_id'
  | 'plan_name'
  | 'operation_type'
  | 'duration_months'
  | 'devices'
  | 'price_snapshot'
  | 'amount_agreed'
  | 'tokens_used'
  | 'previous_expiration'
  | 'new_expiration'
  | 'expiration_edited'
  | 'effective_at'
  | 'recorded_at'
  | 'amount_paid'
  | 'amount_pending'
  | 'token_cost'
  | 'gross_margin'
  | 'is_reversed'
  | 'reversal_reason'
  | 'notes'
>

export function toRenewalSummary(row: RenewalSummaryRow): RenewalSummary {
  const operationType = row.operation_type
  if (operationType !== 'ACTIVACION' && operationType !== 'RENOVACION') {
    throw new AppError('La renovación tiene un tipo desconocido.', 'DATA')
  }
  return {
    id: required(row.id, 'id'),
    accountId: required(row.account_id, 'account_id'),
    planId: required(row.plan_id, 'plan_id'),
    planName: required(row.plan_name, 'plan_name'),
    operationType,
    durationMonths: requiredNumber(row.duration_months, 'duration_months'),
    devices: requiredNumber(row.devices, 'devices'),
    priceSnapshot: requiredNumber(row.price_snapshot, 'price_snapshot'),
    amountAgreed: requiredNumber(row.amount_agreed, 'amount_agreed'),
    tokensUsed: requiredNumber(row.tokens_used, 'tokens_used'),
    previousExpiration: row.previous_expiration,
    newExpiration: required(row.new_expiration, 'new_expiration'),
    expirationEdited: required(row.expiration_edited, 'expiration_edited'),
    effectiveAt: required(row.effective_at, 'effective_at'),
    recordedAt: required(row.recorded_at, 'recorded_at'),
    amountPaid: requiredNumber(row.amount_paid, 'amount_paid'),
    amountPending: requiredNumber(row.amount_pending, 'amount_pending'),
    tokenCost: requiredNumber(row.token_cost, 'token_cost'),
    grossMargin: requiredNumber(row.gross_margin, 'gross_margin'),
    isReversed: required(row.is_reversed, 'is_reversed'),
    reversalReason: row.reversal_reason,
    notes: row.notes,
  }
}

export function toTokenSummary(row: Views<'v_token_summary'>): TokenSummary {
  return {
    quantity: requiredNumber(row.quantity, 'quantity'),
    avgUnitCost: requiredNumber(row.avg_unit_cost, 'avg_unit_cost'),
    inventoryValue: requiredNumber(row.inventory_value, 'inventory_value'),
    minBalance: requiredNumber(row.min_balance, 'min_balance'),
    belowMinimum: required(row.below_minimum, 'below_minimum'),
  }
}

export function toTokenPurchase(
  row: Pick<
    Tables<'token_purchases'>,
    | 'id'
    | 'quantity'
    | 'total_cost'
    | 'unit_cost'
    | 'purchased_at'
    | 'supplier'
    | 'reference'
    | 'notes'
  >,
): TokenPurchase {
  return {
    id: row.id,
    quantity: row.quantity,
    totalCost: row.total_cost,
    unitCost: requiredNumber(row.unit_cost, 'unit_cost'),
    purchasedAt: row.purchased_at,
    supplier: row.supplier,
    reference: row.reference,
    notes: row.notes,
  }
}

export function toTokenMovement(
  row: Pick<
    Tables<'token_movements'>,
    | 'id'
    | 'movement_type'
    | 'quantity_delta'
    | 'unit_cost'
    | 'cost_amount'
    | 'renewal_id'
    | 'purchase_id'
    | 'reason'
    | 'created_at'
  >,
): TokenMovement {
  return {
    id: row.id,
    type: row.movement_type,
    quantityDelta: row.quantity_delta,
    unitCost: row.unit_cost,
    costAmount: row.cost_amount,
    renewalId: row.renewal_id,
    purchaseId: row.purchase_id,
    reason: row.reason,
    createdAt: row.created_at,
  }
}
