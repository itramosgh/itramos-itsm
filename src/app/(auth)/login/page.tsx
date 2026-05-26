import { LoginForm } from '@/components/auth/LoginForm'
import { MicrosoftLoginButton } from '@/components/auth/MicrosoftLoginButton'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function LoginPage() {
  const supabase = await createClient()
  const { data: settings } = await supabase
    .from('platform_settings')
    .select('app_name, logo_light_url')
    .single() as { data: { app_name: string | null; logo_light_url: string | null } | null }

  const appName = settings?.app_name || 'ITRAMOS ITSM'
  const logoUrl = settings?.logo_light_url ?? null

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 border rounded-lg shadow-sm">
        <div className="space-y-1 text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={appName} className="h-12 object-contain mx-auto" />
          ) : (
            <h1 className="text-2xl font-semibold">{appName}</h1>
          )}
          <p className="text-sm text-muted-foreground">Painel interno</p>
        </div>
        <LoginForm />
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">ou</span>
          </div>
        </div>
        <MicrosoftLoginButton />
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/esqueci-senha" className="text-primary hover:underline">
            Esqueci minha senha
          </Link>
        </p>
      </div>
    </div>
  )
}
