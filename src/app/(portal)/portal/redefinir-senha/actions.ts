'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resetPasswordSchema } from '@/lib/validations/auth'

export async function portalResetPasswordAction(
  prevState: { error: string; success?: boolean } | null,
  formData: FormData
) {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { error: 'Link expirado ou inválido. Solicite uma nova redefinição.' }

  redirect('/portal/chamados')
}
