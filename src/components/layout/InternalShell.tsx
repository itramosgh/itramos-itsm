'use client'
import { useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { HeaderClient } from './HeaderClient'

interface InternalShellProps {
  appName: string | null
  logoUrl: string | null
  profileName: string | null
  children: ReactNode
}

export function InternalShell({ appName, logoUrl, profileName, children }: InternalShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])
  const openSidebar = useCallback(() => setSidebarOpen(true), [])

  return (
    <div className="flex h-screen">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={closeSidebar}
        />
      )}
      <Sidebar
        appName={appName}
        logoUrl={logoUrl}
        isOpen={sidebarOpen}
        onClose={closeSidebar}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <HeaderClient
          profileName={profileName}
          onMenuOpen={openSidebar}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
