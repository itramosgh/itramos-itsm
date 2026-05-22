import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
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

  const role = (user.app_metadata?.role as string) ?? 'cliente'
  const redirect = getRedirectForRole(role, pathname)
  if (redirect) {
    return NextResponse.redirect(new URL(redirect, request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
