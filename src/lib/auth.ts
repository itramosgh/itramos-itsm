export const INTERNAL_ROLES = ['admin', 'gestor', 'analista'] as const
export type InternalRole = typeof INTERNAL_ROLES[number]

export function isInternalPath(pathname: string) {
  return /^\/(configuracoes|usuarios|clientes|chamados|relatorios|monitoramento|dashboard|comunicados)/.test(pathname)
}

export function isPortalPath(pathname: string) {
  return pathname.startsWith('/portal')
}

export function getRedirectForUnauthenticated(pathname: string): string {
  return isPortalPath(pathname) ? '/portal/login' : '/login'
}

export function getRedirectForRole(role: string, pathname: string): string | null {
  if (isInternalPath(pathname) && !INTERNAL_ROLES.includes(role as InternalRole)) {
    return '/portal/chamados'
  }
  if (isPortalPath(pathname) && INTERNAL_ROLES.includes(role as InternalRole)) {
    return '/dashboard'
  }
  return null
}
