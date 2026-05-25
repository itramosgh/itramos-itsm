import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { insertLog } from '@/lib/log'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data } = await supabase.auth.exchangeCodeForSession(code)

    // Log SSO logins (provider_token present means OAuth flow)
    if (data?.session?.provider_token) {
      try {
        const serviceClient = await createServiceClient()
        await insertLog(
          serviceClient,
          'auth',
          'success',
          `Login SSO Microsoft: ${data.session.user.email ?? 'usuário desconhecido'}`,
          { user_id: data.session.user.id, provider: 'azure' }
        )
      } catch {
        // log failure doesn't block login
      }
    }
  }

  return NextResponse.redirect(new URL(next, request.url))
}
