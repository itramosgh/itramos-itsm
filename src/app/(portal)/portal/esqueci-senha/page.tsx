'use client'
import { useActionState } from 'react'
import { portalForgotPasswordAction } from './actions'
import Link from 'next/link'

export default function PortalEsqueciSenhaPage() {
  const [state, action, pending] = useActionState(portalForgotPasswordAction, null)

  if (state?.success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 p-8 border rounded-lg text-center">
          <h1 className="text-xl font-semibold">E-mail enviado</h1>
          <p className="text-sm text-muted-foreground">
            Verifique sua caixa de entrada e clique no link para redefinir sua senha.
          </p>
          <Link href="/portal/login" className="text-sm text-primary hover:underline">
            Voltar ao login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 p-8 border rounded-lg">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Esqueci minha senha</h1>
          <p className="text-sm text-muted-foreground">
            Informe seu e-mail para receber o link de redefinição.
          </p>
        </div>
        <form action={action} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium">E-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
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
            {pending ? 'Enviando...' : 'Enviar link'}
          </button>
        </form>
        <p className="text-center text-sm">
          <Link href="/portal/login" className="text-primary hover:underline">Voltar ao login</Link>
        </p>
      </div>
    </div>
  )
}
