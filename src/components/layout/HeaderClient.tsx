'use client'
import { logoutAction } from '@/app/(auth)/login/actions'
import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'

interface HeaderClientProps {
  profileName: string | null
  onMenuOpen: () => void
}

export function HeaderClient({ profileName, onMenuOpen }: HeaderClientProps) {
  return (
    <header className="h-14 border-b flex items-center justify-between px-6 shrink-0">
      <button
        type="button"
        onClick={onMenuOpen}
        className="md:hidden p-1 rounded-md hover:bg-muted transition-colors"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="hidden md:block" />
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">{profileName}</span>
        <form action={logoutAction}>
          <Button variant="ghost" size="sm" type="submit">Sair</Button>
        </form>
      </div>
    </header>
  )
}
