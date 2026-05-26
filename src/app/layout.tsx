import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { createServiceClient } from '@/lib/supabase/server'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('platform_settings')
    .select('app_name')
    .single() as { data: { app_name: string | null } | null }

  const title = data?.app_name || 'ITRAMOS ITSM'
  return {
    title: { default: title, template: `%s — ${title}` },
    description: 'Sistema interno de gestão de chamados B2B',
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  )
}
