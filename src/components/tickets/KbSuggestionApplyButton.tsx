'use client'
interface KbSuggestionApplyButtonProps {
  solution: string
}

export function KbSuggestionApplyButton({ solution }: KbSuggestionApplyButtonProps) {
  function applySolution() {
    const resolutionField = document.querySelector<HTMLTextAreaElement>('textarea[name="resolution"]')
    if (resolutionField) {
      resolutionField.value = solution
      resolutionField.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  return (
    <button
      type="button"
      onClick={applySolution}
      className="text-xs px-2 py-1 rounded border hover:bg-muted"
    >
      Aplicar solução no campo de resolução
    </button>
  )
}
