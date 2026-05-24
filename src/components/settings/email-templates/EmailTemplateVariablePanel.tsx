'use client'
import type { EmailTemplateVariable } from '@/types/database'
import type { TemplateEditorHandle } from './TemplateEditor'

interface EmailTemplateVariablePanelProps {
  variables: EmailTemplateVariable[]
  editorRef: React.RefObject<TemplateEditorHandle | null>
}

export function EmailTemplateVariablePanel({ variables, editorRef }: EmailTemplateVariablePanelProps) {
  if (variables.length === 0) return null

  const handleInsert = (key: string) => {
    editorRef.current?.insertVariable(key)
  }

  return (
    <div className="border rounded-md p-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Variáveis disponíveis — clique para inserir
      </p>
      <div className="flex flex-wrap gap-2">
        {variables.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => handleInsert(v.key)}
            title={v.description}
            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-mono hover:bg-blue-100 transition-colors"
          >
            {`{{${v.key}}}`}
            {v.required && <span className="text-red-500 font-bold">*</span>}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">* variável obrigatória</p>
    </div>
  )
}
