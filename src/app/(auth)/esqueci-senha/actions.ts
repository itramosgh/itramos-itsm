'use server'
import { createClient } from '@/lib/supabase/server'
import { forgotPasswordSchema } from '@/lib/validations/auth'

export async function forgotPasswordAction(
  prevState: { error: string; success: boolean } | null,
  formData: FormData
) {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { error: parsed.error.issues[0].message, success: false }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/redefinir-senha`,
  })

  if (error) {
    console.error('[forgotPassword] Supabase error:', error.message, error)
    return { error: 'Erro ao enviar e-mail. Tente novamente.', success: false }
  }
  return { error: '', success: true }
}
