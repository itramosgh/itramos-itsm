'use client'
import { useActionState } from 'react'
import Link from 'next/link'
import { autoRegisterAction } from './actions'

export default function CriarContaPage() {
  const [state, formAction, isPending] = useActionState(autoRegisterAction, null)

  if (state?.success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-semibold">Conta criada!</h1>
          <p className="text-sm text-muted-foreground">
            Sua conta foi criada com sucesso.
          </p>
          <Link href="/portal/login"
            className="inline-block bg-primary text-primary-foreground px-6 py-2 rounded-md text-sm">
            Ir para login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Criar Conta</h1>
          <p className="text-sm text-muted-foreground mt-1">Use o e-mail da sua empresa</p>
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Nome completo</label>
            <input name="full_name" required
              className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">E-mail corporativo</label>
            <input name="email" type="email" required autoComplete="email"
              className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Senha</label>
            <input name="password" type="password" required autoComplete="new-password"
              className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          {state?.error && (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{state.error}</p>
              {state.showWhatsApp && (
                <p className="text-sm text-muted-foreground">
                  Entre em contato pelo WhatsApp para mais informações.
                </p>
              )}
            </div>
          )}
          <button type="submit" disabled={isPending}
            className="w-full bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50">
            {isPending ? 'Criando...' : 'Criar conta'}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Já tem conta?{' '}
          <Link href="/portal/login" className="underline hover:text-foreground">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}
