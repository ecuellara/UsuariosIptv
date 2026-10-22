import { AppError, asErrorLike, toUserMessage } from '@/lib/errors'
import { createReauthClient, supabase } from '@/lib/supabase'

/**
 * Comprueba la contraseña actual con `signInWithPassword` en un cliente
 * efímero. La sesión principal (posiblemente aal2) no se toca: un login con
 * contraseña emitiría un JWT aal1 y obligaría a repetir el TOTP.
 */
export async function verifyCurrentPassword(
  email: string,
  password: string,
): Promise<void> {
  const probe = createReauthClient()
  try {
    const { error } = await probe.auth.signInWithPassword({ email, password })
    if (error) {
      const detail = asErrorLike(error)
      if (detail?.code === 'invalid_credentials') {
        throw new AppError('La contraseña actual no es correcta.', 'AUTH', error)
      }
      throw new AppError(
        toUserMessage(error, 'No pudimos comprobar tu contraseña actual.'),
        'AUTH',
        error,
      )
    }
  } finally {
    /* `local`: no revoca las demás sesiones (incluida la del panel). El
       cliente no persiste nada; el refresh token se descarta con la instancia. */
    try {
      await probe.auth.signOut({ scope: 'local' })
    } catch {
      /* La comprobación ya terminó; un fallo al limpiar no debe ocultar el resultado. */
    }
  }
}

/** Cambia la contraseña de la sesión actual. El error crudo se traduce en la UI. */
export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}
