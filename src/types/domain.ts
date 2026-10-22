import type { Database } from '@/types/database'

/* Tipos derivados del esquema generado. No se escriben columnas a mano:
   si cambia la base, se regenera `src/types/database.ts`. */

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
export type Views<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row']
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T]

/* --- Estados de vigencia (ADR-006) ----------------------------------------- */

export const ACCOUNT_STATUSES = [
  'ACTIVA',
  'PROXIMA',
  'URGENTE',
  'VENCIDA',
  'ARCHIVADA',
] as const

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]

export function isAccountStatus(value: unknown): value is AccountStatus {
  return (
    typeof value === 'string' &&
    (ACCOUNT_STATUSES as readonly string[]).includes(value)
  )
}

export type FollowupStatus = Enums<'followup_status'>

export const FOLLOWUP_STATUSES = [
  'PENDIENTE',
  'CONTACTADO',
  'EN_CONVERSACION',
  'CONFIRMADO',
  'RENOVADO',
  'NO_RENOVARA',
] as const satisfies readonly FollowupStatus[]

export type PaymentMethod = Enums<'payment_method'>
export type MovementType = Enums<'token_movement_type'>
export type RenewalOperationType = Enums<'renewal_operation_type'>
export type CashDirection = 'IN' | 'OUT'
export type CashKind = 'COBRO' | 'GASTO' | 'COMPRA_TOKENS'

export const PAYMENT_METHODS = [
  'YAPE',
  'PLIN',
  'TRANSFERENCIA',
  'EFECTIVO',
  'OTRO',
] as const satisfies readonly PaymentMethod[]

export const TOKEN_MOVEMENT_TYPES = [
  'COMPRA',
  'CONSUMO',
  'AJUSTE',
  'REVERSION',
] as const satisfies readonly MovementType[]

/* --- Entidades de dominio --------------------------------------------------
   Las vistas exponen columnas nullable por definición de PostgreSQL. El
   dominio exige los campos que la UI necesita; `toAccount` falla de forma
   explícita si la base devolviera una fila incompleta. */

export interface Account {
  id: string
  customerId: string
  customerName: string
  phone: string
  externalUsername: string
  reference: string | null
  purchasedAt: string
  expiresAt: string
  initialExpiresAt: string
  lastVerifiedAt: string | null
  notes: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  expiresOn: string
  daysLeft: number
  status: AccountStatus
  statusRank: number
  followupStatus: FollowupStatus | null
  isStaleVerification: boolean
}

export interface Customer {
  id: string
  firstName: string
  lastName: string
  phone: string
  notes: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Plan {
  id: string
  key: string
  name: string
  durationMonths: number
  devices: number
  suggestedPrice: number
  tokensRequired: number
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface TokenStock {
  quantity: number
  avgUnitCost: number
  updatedAt: string
}

export interface AppSettings {
  urgentDays: number
  warningDays: number
  minTokenBalance: number
  timezone: string
  updatedAt: string
}

export interface Profile {
  id: string
  displayName: string
}

export interface CashMovement {
  direction: CashDirection
  kind: CashKind
  amount: number
  occurredAt: string
  description: string | null
  reference: string | null
  sourceId: string | null
}

/* --- Renovaciones ----------------------------------------------------------
   Valores de `v_renewal_summary`: los agregados (pagado, pendiente, costo de
   tokens y margen) los calcula SQL. El cliente solo los muestra. */

export interface RenewalSummary {
  id: string
  accountId: string
  planId: string
  planName: string
  operationType: RenewalOperationType
  durationMonths: number
  devices: number
  priceSnapshot: number
  amountAgreed: number
  tokensUsed: number
  previousExpiration: string | null
  newExpiration: string
  expirationEdited: boolean
  effectiveAt: string
  recordedAt: string
  amountPaid: number
  amountPending: number
  tokenCost: number
  grossMargin: number
  isReversed: boolean
  reversalReason: string | null
  notes: string | null
}

export interface RenewalWithAccount {
  renewal: RenewalSummary
  account: Account | null
}

/* --- Tokens --------------------------------------------------------------- */

export interface TokenSummary {
  quantity: number
  avgUnitCost: number
  inventoryValue: number
  minBalance: number
  belowMinimum: boolean
}

export interface TokenPurchase {
  id: string
  quantity: number
  totalCost: number
  unitCost: number
  purchasedAt: string
  supplier: string | null
  reference: string | null
  notes: string | null
}

export interface TokenMovement {
  id: string
  type: MovementType
  quantityDelta: number
  unitCost: number
  costAmount: number
  renewalId: string | null
  purchaseId: string | null
  reason: string | null
  createdAt: string
}

export interface AccountListFilter {
  /** Ventana de vencimiento. `ALL` no filtra por estado (salvo archivadas). */
  scope?: 'TODAY' | 'URGENT' | 'WARNING' | 'OVERDUE' | 'ACTIVE' | 'ALL'
  status?: AccountStatus | 'TODOS'
  search?: string
  includeArchived?: boolean
  customerId?: string
  staleOnly?: boolean
  page?: number
  pageSize?: number
}
