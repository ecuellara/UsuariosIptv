import type { Factor } from '@supabase/supabase-js'
import { AppError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { AalLevel } from '@/lib/mfa'

/** Resumen de un factor TOTP tal como lo necesita la UI. */
export interface TotpFactorSummary {
  id: string
  friendlyName: string
  createdAt: string
}

export interface TotpFactorList {
  verified: TotpFactorSummary[]
  unverified: TotpFactorSummary[]
}

export interface TotpEnrollment {
  factorId: string
  qrCode: string
  secret: string
}

function toAalLevel(value: string | null): AalLevel | null {
  return value === 'aal1' || value === 'aal2' ? value : null
}

function summarize(factor: Factor): TotpFactorSummary {
  return {
    id: factor.id,
    friendlyName: factor.friendly_name?.trim() || 'Aplicación de autenticación',
    createdAt: factor.created_at,
  }
}

/**
 * Nivel actual y siguiente de la sesión. `nextLevel` solo sube a `aal2`
 * cuando el usuario tiene al menos un factor **verificado**; un enrolamiento
 * a medias no bloquea el panel.
 */
export async function getAssuranceLevel(): Promise<{
  currentLevel: AalLevel | null
  nextLevel: AalLevel | null
}> {
  const { data, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) throw error
  return {
    currentLevel: toAalLevel(data.currentLevel),
    nextLevel: toAalLevel(data.nextLevel),
  }
}

export async function listTotpFactors(): Promise<TotpFactorList> {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error

  const all = data.all.filter((factor) => factor.factor_type === 'totp')
  return {
    verified: all
      .filter((factor) => factor.status === 'verified')
      .map(summarize),
    unverified: all
      .filter((factor) => factor.status === 'unverified')
      .map(summarize),
  }
}

/** IDs de factores TOTP verificados, de la fuente de verdad de Auth. */
export async function verifiedTotpFactorIds(): Promise<string[]> {
  const { verified } = await listTotpFactors()
  return verified.map((factor) => factor.id)
}

/**
 * Crea el factor y devuelve el QR + secreto. Antes elimina enrolamientos
 * abandonados (factores `unverified`): no autorizan nada y, si se acumulan,
 * el siguiente `enroll` choca con el nombre del factor.
 */
export async function prepareTotpEnrollment(): Promise<TotpEnrollment> {
  const { unverified } = await listTotpFactors()
  for (const factor of unverified) {
    const { error } = await supabase.auth.mfa.unenroll({
      factorId: factor.id,
    })
    if (error) throw error
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'IPTV Manager',
  })
  if (error) throw error
  if (data.type !== 'totp') {
    throw new AppError(
      'El servidor no devolvió un factor TOTP. Inténtalo de nuevo.',
      'AUTH',
    )
  }

  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  }
}

/** `challenge` + `verify`: deja la sesión en aal2 si el código es correcto. */
export async function verifyTotpCode(
  factorId: string,
  code: string,
): Promise<void> {
  const challenge = await supabase.auth.mfa.challenge({ factorId })
  if (challenge.error) throw challenge.error

  const verification = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  })
  if (verification.error) throw verification.error
}

export async function removeTotpFactor(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw error
}
