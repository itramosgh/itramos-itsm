'use client'
import { useActionState } from 'react'
import Link from 'next/link'
import { portalLoginAction } from './actions'
import Image from 'next/image'

interface Props {
  logoUrl: string | null
  companyName: string | null
}

export function PortalLoginForm({ logoUrl, companyName }: Props) {
  const [state, formAction, isPending] = useActionState(portalLoginAction, null)

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <div className="w-full max-w-sm bg-background border rounded-xl shadow-sm p-8 space-y-6">
        <div className="flex flex-col items-center gap-3">
          {logoUrl
            ? <img src={logoUrl} alt={companyName ?? 'Logo'} className="h-16 w-auto object-contain max-w-[200px]" />
            : <span className="text-xl font-bold">{companyName ?? 'Portal do Cliente'}</span>
          }
          <div className="text-center">
            <h1 className="text-lg font-semibold">Portal do Cliente</h1>
            <p className="text-sm text-muted-foreground">Acesse sua conta</p>
          </div>
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

        <div className="space-y-2 text-center">
          <p className="text-sm text-muted-foreground">
            Não tem conta?{' '}
            <Link href="/portal/criar-conta" className="underline hover:text-foreground">
              Criar conta
            </Link>
          </p>
          <p className="text-sm text-muted-foreground">
            <Link href="/portal/esqueci-senha" className="underline hover:text-foreground">
              Esqueci minha senha
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
