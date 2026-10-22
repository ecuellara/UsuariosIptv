import { describe, expect, it } from 'vitest'
import { restoredExpirationAfterReversal } from '@/lib/renewals'
import type { RenewalSummary } from '@/types/domain'

const INITIAL = '2026-10-26T17:00:00.000Z'

function renewal(
  id: string,
  recordedAt: string,
  newExpiration: string,
  isReversed = false,
): RenewalSummary {
  return {
    id,
    accountId: 'cuenta',
    planId: 'plan',
    planName: '1 mes',
    operationType: 'RENOVACION',
    durationMonths: 1,
    devices: 3,
    priceSnapshot: 0,
    amountAgreed: 0,
    tokensUsed: 0,
    previousExpiration: null,
    newExpiration,
    expirationEdited: false,
    effectiveAt: recordedAt,
    recordedAt,
    amountPaid: 0,
    amountPending: 0,
    tokenCost: 0,
    grossMargin: 0,
    isReversed,
    reversalReason: null,
    notes: null,
  }
}

describe('restoredExpirationAfterReversal', () => {
  it('sin renovaciones: vuelve al vencimiento inicial', () => {
    expect(restoredExpirationAfterReversal([], 'r1', INITIAL)).toBe(INITIAL)
  })

  it('con una renovación anterior: restaura la fecha de esa renovación', () => {
    const r0 = renewal('r0', '2026-10-01T10:00:00.000Z', '2026-11-01T17:00:00.000Z')
    const r1 = renewal('r1', '2026-10-02T10:00:00.000Z', '2026-12-01T17:00:00.000Z')
    expect(restoredExpirationAfterReversal([r0, r1], 'r1', INITIAL)).toBe(r0.newExpiration)
  })

  it('con una renovación posterior: restaura la fecha de la posterior', () => {
    const r1 = renewal('r1', '2026-10-02T10:00:00.000Z', '2026-11-02T17:00:00.000Z')
    const r2 = renewal('r2', '2026-10-03T10:00:00.000Z', '2026-12-02T17:00:00.000Z')
    expect(restoredExpirationAfterReversal([r1, r2], 'r1', INITIAL)).toBe(r2.newExpiration)
  })

  it('con todas revertidas: vuelve al vencimiento inicial', () => {
    const r1 = renewal('r1', '2026-10-02T10:00:00.000Z', '2026-11-02T17:00:00.000Z', true)
    const r2 = renewal('r2', '2026-10-03T10:00:00.000Z', '2026-12-02T17:00:00.000Z', true)
    expect(restoredExpirationAfterReversal([r1, r2], 'r1', INITIAL)).toBe(INITIAL)
  })

  it('desempata por id cuando recorded_at coincide (orden del SQL)', () => {
    const at = '2026-10-02T10:00:00.000Z'
    const a = renewal('aaaaaaaa-0000-0000-0000-000000000000', at, '2026-11-02T17:00:00.000Z')
    const b = renewal('bbbbbbbb-0000-0000-0000-000000000000', at, '2026-12-02T17:00:00.000Z')
    expect(restoredExpirationAfterReversal([a, b], 'objetivo', INITIAL)).toBe(b.newExpiration)
  })
})
