import type { RenewalSummary } from '@/types/domain'

/** Datos mínimos para reconstruir el vencimiento restaurado. */
export type RenewalTimelineEntry = Pick<
  RenewalSummary,
  'id' | 'recordedAt' | 'newExpiration' | 'isReversed'
>

/* Regla de `rpc_reverse_renewal` (supabase/migrations/…_rpc.sql):

     select coalesce(
       (select r2.new_expiration from renewals r2
         where r2.account_id = <cuenta> and r2.reversed_at is null
         order by r2.recorded_at desc, r2.id desc limit 1),
       iptv_accounts.initial_expires_at)

   Es decir: la última renovación NO revertida que queda después de revertir
   esta, o el vencimiento inicial si no queda ninguna. El diálogo necesita
   anticipar ese valor; replicarlo aquí es cálculo de presentación, no una
   segunda fuente de verdad (el servidor lo vuelve a calcular al confirmar). */

export function restoredExpirationAfterReversal(
  renewals: readonly RenewalTimelineEntry[],
  renewalId: string,
  initialExpiresAt: string,
): string {
  let latest: RenewalTimelineEntry | null = null
  for (const renewal of renewals) {
    if (renewal.id === renewalId || renewal.isReversed) continue
    if (latest === null || compareRenewals(renewal, latest) > 0) {
      latest = renewal
    }
  }
  return latest?.newExpiration ?? initialExpiresAt
}

/** `recorded_at desc, id desc` del SQL: gana el mayor (fecha e id canónicos). */
function compareRenewals(
  a: RenewalTimelineEntry,
  b: RenewalTimelineEntry,
): number {
  const timeA = Date.parse(a.recordedAt)
  const timeB = Date.parse(b.recordedAt)
  if (Number.isNaN(timeA) || Number.isNaN(timeB)) {
    /* Sin fecha válida no se inventa un orden: se conserva el primero visto. */
    return 0
  }
  if (timeA !== timeB) return timeA - timeB
  if (a.id === b.id) return 0
  return a.id > b.id ? 1 : -1
}
