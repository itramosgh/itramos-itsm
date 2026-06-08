'use client'
import { useActionState, useEffect, useState } from 'react'
import { portalResetPasswordAction } from './actions'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type Status = 'loading' | 'ready' | 'invalid'

export default function PortalRedefinirSenhaPage() {
  const [status, setStatus] = useState<Status>('loading')
  const [state, action, pending] = useActionState(portalResetPasswordAction, null)

  useEffect(() => {
    const supabase = createClient()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        if (session) {
          setStatus('ready')
        } else {
          // No session from cookies — may arrive via hash-based OTP token
          const timer = setTimeout(() => setStatus(prev => prev === 'loading' ? 'invalid' : prev), 1500)
          return () => clearTimeout(timer)
        }
      } else if (session) {
        setStatus('ready')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 p-8 border rounded-lg text-center">
          <p className="text-sm text-muted-foreground">Verificando link...</p>
        </div>
      </div>
    )
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 p-8 border rounded-lg text-center">
          <h1 className="text-xl font-semibold">Link inválido ou expirado</h1>
          <p className="text-sm text-muted-foreground">
            Este link de redefinição não é mais válido. Solicite um novo.
          </p>
          <Link href="/portal/esqueci-senha" className="text-sm text-primary hover:underline">
            Solicitar novo link
          </Link>
        </div>
      </div>
    )
  }

  if ((state as any)?.success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 p-8 border rounded-lg text-center">
          <h1 className="text-xl font-semibold">Senha definida!</h1>
          <p className="text-sm text-muted-foreground">
            Sua senha foi definida com sucesso. Você já pode acessar o portal.
          </p>
          <Link href="/portal/chamados" className="text-sm text-primary hover:underline">
            Ir para o portal
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 p-8 border rounded-lg">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Defina sua senha</h1>
          <p className="text-sm text-muted-foreground">Crie uma senha para acessar o portal.</p>
        </div>
        <form action={action} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="password" className="block text-sm font-medium">Nova senha</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
              className="mt-1 block w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="confirmPassword" className="block text-sm font-medium">Confirmar senha</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              className="mt-1 block w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
          >
            {pending ? 'Salvando...' : 'Definir senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
