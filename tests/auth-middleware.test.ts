import { describe, it, expect } from 'vitest'
import { getRedirectForUnauthenticated, getRedirectForRole } from '@/lib/auth'

describe('auth redirects', () => {
  it('redireciona para /login quando não autenticado em rota interna', () => {
    expect(getRedirectForUnauthenticated('/configuracoes')).toBe('/login')
  })

  it('redireciona para /portal/login quando não autenticado em rota do portal', () => {
    expect(getRedirectForUnauthenticated('/portal/chamados')).toBe('/portal/login')
  })

  it('permite acesso de admin a rotas internas', () => {
    expect(getRedirectForRole('admin', '/configuracoes')).toBeNull()
  })

  it('redireciona cliente que tenta acessar rota interna', () => {
    expect(getRedirectForRole('cliente', '/configuracoes')).toBe('/portal/chamados')
  })
})
