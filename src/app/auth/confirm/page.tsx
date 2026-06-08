'use client'
import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function ConfirmHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash')
    const type = searchParams.get('type') as 'recovery' | 'signup' | 'invite' | 'email' | 'email_change' | null
    const nextRaw = searchParams.get('next') ?? '/portal/chamados'
    // Supabase pode passar URL completa no next — extrai só o pathname
    const next = (() => { try { return new URL(nextRaw).pathname } catch { return nextRaw } })()

    if (!tokenHash || !type) {
      router.replace('/portal/esqueci-senha?error=link_invalido')
      return
    }

    const supabase = createClient()
    supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error }) => {
      if (error) {
        const isPortal = next.startsWith('/portal')
        router.replace(isPortal ? '/portal/esqueci-senha?error=link_expirado' : '/esqueci-senha?error=link_expirado')
      } else {
        router.replace(next)
      }
    })
  }, [router, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Verificando link...</p>
    </div>
  )
}

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Verificando link...</p>
      </div>
    }>
      <ConfirmHandler />
    </Suspense>
  )
}
