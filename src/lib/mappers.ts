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
  TokenStock,
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
