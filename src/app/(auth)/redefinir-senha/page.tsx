'use client'
import { useActionState, useEffect, useState } from 'react'
import { resetPasswordAction } from './actions'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

type Status = 'loading' | 'ready' | 'invalid'

export default function RedefinirSenhaPage() {
  const [status, setStatus] = useState<Status>('loading')
  const [state, action, pending] = useActionState(resetPasswordAction, null)

  useEffect(() => {
    const supabase = createClient()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        if (session) {
          setStatus('ready')
        } else {
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-full max-w-sm space-y-4 p-8 border rounded-lg text-center">
          <p className="text-sm text-muted-foreground">Verificando link...</p>
        </div>
      </div>
    )
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-full max-w-sm space-y-4 p-8 border rounded-lg text-center">
          <h1 className="text-xl font-semibold">Link inválido ou expirado</h1>
          <p className="text-sm text-muted-foreground">
            Este link de redefinição não é mais válido. Solicite um novo.
          </p>
          <Link href="/esqueci-senha" className="text-sm text-primary hover:underline">
            Solicitar novo link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8 border rounded-lg">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Nova senha</h1>
          <p className="text-sm text-muted-foreground">Digite sua nova senha abaixo.</p>
        </div>
        <form action={action} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="password">Nova senha</Label>
            <Input id="password" name="password" type="password" required autoComplete="new-password" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirmPassword">Confirmar senha</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" />
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Salvando...' : 'Redefinir senha'}
          </Button>
        </form>
      </div>
    </div>
  )
}
