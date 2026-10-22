import { supabase } from '@/lib/supabase'
import { toProfile } from '@/lib/mappers'
import type { Profile } from '@/types/domain'

/** La ausencia de fila en `profiles` significa "sin acceso", no error. */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,display_name,created_at,updated_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data ? toProfile(data) : null
}

export async function updateDisplayName(
  userId: string,
  displayName: string,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', userId)
  if (error) throw error
}
