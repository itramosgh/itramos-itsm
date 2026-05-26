import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { updateSession } from '@/lib/supabase/session'
import { getRedirectForUnauthenticated, getRedirectForRole, isInternalPath, isPortalPath } from '@/lib/auth'

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request)
  const { pathname } = request.nextUrl

  const isProtected = isInternalPath(pathname) || isPortalPath(pathname)
  if (!isProtected) return response

  if (!user) {
    const redirectTo = getRedirectForUnauthenticated(pathname)
    return NextResponse.redirect(new URL(redirectTo, request.url))
  }

  // Read role from profiles table (role is not stored in app_metadata)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile?.role as string) ?? 'cliente'
  const redirect = getRedirectForRole(role, pathname)
  if (redirect) {
    return NextResponse.redirect(new URL(redirect, request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
