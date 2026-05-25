'use client'
import { loginWithMicrosoftAction } from '@/app/(auth)/login/actions'
import { Button } from '@/components/ui/button'
import { useFormStatus } from 'react-dom'

function MicrosoftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="1" y="1" width="8.5" height="8.5" fill="#F25022"/>
      <rect x="10.5" y="1" width="8.5" height="8.5" fill="#7FBA00"/>
      <rect x="1" y="10.5" width="8.5" height="8.5" fill="#00A4EF"/>
      <rect x="10.5" y="10.5" width="8.5" height="8.5" fill="#FFB900"/>
    </svg>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="outline" className="w-full gap-2" disabled={pending}>
      <MicrosoftIcon />
      {pending ? 'Redirecionando...' : 'Entrar com Microsoft'}
    </Button>
  )
}

export function MicrosoftLoginButton() {
  async function handleAction(_formData: FormData) {
    await loginWithMicrosoftAction()
  }

  return (
    <form action={handleAction}>
      <SubmitButton />
    </form>
  )
}
