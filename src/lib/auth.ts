export const INTERNAL_ROLES = ['admin', 'gestor', 'analista'] as const
export type InternalRole = typeof INTERNAL_ROLES[number]

export function isInternalPath(pathname: string) {
  return /^\/(configuracoes|usuarios|clientes|chamados|relatorios|monitoramento|dashboard|comunicados|tarefas|reunioes|mudancas|conhecimento)/.test(pathname)
}

// Rotas do portal que não requerem autenticação
const PORTAL_PUBLIC_PATHS = ['/portal/login', '/portal/criar-conta', '/portal/esqueci-senha', '/portal/redefinir-senha']

export function isPortalPath(pathname: string) {
  if (PORTAL_PUBLIC_PATHS.some(p => pathname.startsWith(p))) return false
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
