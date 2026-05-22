import { LoginForm } from '@/components/auth/LoginForm'
import Link from 'next/link'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 border rounded-lg shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">ITRAMOS ITSM</h1>
          <p className="text-sm text-muted-foreground">Painel interno</p>
        </div>
        <LoginForm />
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/esqueci-senha" className="text-primary hover:underline">
            Esqueci minha senha
          </Link>
        </p>
      </div>
    </div>
  )
}
