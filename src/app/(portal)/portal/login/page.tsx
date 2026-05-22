'use client'
import { useActionState } from 'react'
import Link from 'next/link'
import { portalLoginAction } from './actions'

export default function PortalLoginPage() {
  const [state, formAction, isPending] = useActionState(portalLoginAction, null)

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Portal do Cliente</h1>
          <p className="text-sm text-muted-foreground mt-1">Acesse sua conta</p>
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <label className="text-sm font-medium">E-mail</label>
            <input name="email" type="email" required autoComplete="email"
              className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Senha</label>
            <input name="password" type="password" required autoComplete="current-password"
              className="mt-1 block w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <button type="submit" disabled={isPending}
            className="w-full bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50">
            {isPending ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Não tem conta?{' '}
          <Link href="/portal/criar-conta" className="underline hover:text-foreground">
            Criar conta
          </Link>
        </p>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/portal/esqueci-senha" className="underline hover:text-foreground">
            Esqueci minha senha
          </Link>
        </p>
      </div>
    </div>
  )
}
