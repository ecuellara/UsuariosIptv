import { supabase } from '@/lib/supabase'
import { toPayment } from '@/lib/mappers'
import type { Payment } from '@/types/domain'

/* Cobros de una renovación. `payments` es de solo lectura directa: se
   registran por `rpc_record_payment` y nunca se borran. Una renovación
   revertida conserva sus pagos (el dinero sí entró). */

const PAYMENT_COLUMNS =
  'id,renewal_id,amount,method,paid_at,reference,notes'

export async function listPaymentsByRenewal(
  renewalId: string,
): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .eq('renewal_id', renewalId)
    .order('paid_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(toPayment)
}
