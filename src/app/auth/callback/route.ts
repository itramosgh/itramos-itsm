import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase/server'
import { insertLog } from '@/lib/log'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/dashboard'

  const redirectTo = new URL(next, url.origin)
  const response = NextResponse.redirect(redirectTo)

  if (code) {
    // Bind Supabase client directly to the redirect response so session
    // cookies are included in the same response (not lost on redirect).
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { data } = await supabase.auth.exchangeCodeForSession(code)

    // Log SSO logins via Azure AD
    if (data?.session?.user?.app_metadata?.provider === 'azure') {
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

  return response
}
