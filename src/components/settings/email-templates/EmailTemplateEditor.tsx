'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, RotateCcw, Save } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { TemplateEditor, type TemplateEditorHandle } from './TemplateEditor'
import { EmailTemplateVariablePanel } from './EmailTemplateVariablePanel'
import { EmailTemplatePreviewModal } from './EmailTemplatePreviewModal'
import { saveTemplateAction, restoreDefaultAction } from '@/app/(internal)/configuracoes/email-templates/actions'
import type { Database, EmailTemplateVariable } from '@/types/database'

type EmailTemplate = Database['public']['Tables']['email_templates']['Row']

interface EmailTemplateEditorProps {
  template: EmailTemplate
}

export function EmailTemplateEditor({ template }: EmailTemplateEditorProps) {
  const router = useRouter()
  const editorRef = useRef<TemplateEditorHandle>(null)
  const [subject, setSubject] = useState(template.subject)
  const [restoreCount, setRestoreCount] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [missingVarsWarning, setMissingVarsWarning] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()

  const requiredVars = (template.available_variables as EmailTemplateVariable[])
    .filter((v) => v.required)
    .map((v) => v.key)

  const checkMissingVars = (html: string) =>
    requiredVars.filter((key) => !html.includes(`{{${key}}}`))

  const handleSave = () => {
    startTransition(async () => {
      const bodyHtml = editorRef.current?.getHTML() ?? ''
      const bodyRichText = editorRef.current?.getJSON() ?? {}

      const missing = checkMissingVars(bodyHtml)
      setMissingVarsWarning(missing)

      const result = await saveTemplateAction(template.slug, {
        subject,
        body_html: bodyHtml,
        body_rich_text: bodyRichText,
      })

      if (result.error) {
        setSaveError(result.error)
        setSaveSuccess(false)
      } else {
        setSaveError(null)
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      }
    })
  }

  const handleRestore = () => {
    startTransition(async () => {
      await restoreDefaultAction(template.slug)
      setSubject(template.default_subject)
      setSaveError(null)
      setSaveSuccess(false)
      setMissingVarsWarning([])
      setRestoreCount((c) => c + 1)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{template.name}</h2>
          <p className="text-sm text-muted-foreground mt-1">{template.trigger_description}</p>
          {template.is_customized && (
            <Badge variant="secondary" className="mt-2">Personalizado</Badge>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <EmailTemplatePreviewModal
            subject={subject}
            bodyHtml={template.body_html}
            variables={template.available_variables as EmailTemplateVariable[]}
            getLatestHtml={() => editorRef.current?.getHTML() ?? template.body_html}
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <RotateCcw className="h-4 w-4 mr-2" />
                Restaurar padrão
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restaurar conteúdo padrão?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso substituirá o assunto e o corpo do e-mail pelo conteúdo original. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleRestore} disabled={isPending}>
                  Restaurar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject">Assunto</Label>
        <Input
          id="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Assunto do e-mail"
        />
      </div>

      <div className="space-y-2">
        <Label>Corpo do e-mail</Label>
        <TemplateEditor
          ref={editorRef}
          key={`${template.slug}-${restoreCount}`}
          initialContent={restoreCount === 0 ? template.body_rich_text : template.default_body_rich_text}
        />
      </div>

      <EmailTemplateVariablePanel
        variables={template.available_variables as EmailTemplateVariable[]}
        editorRef={editorRef}
      />

      {missingVarsWarning.length > 0 && (
        <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            Variáveis obrigatórias ausentes no corpo:{' '}
            <strong>{missingVarsWarning.map((k) => `{{${k}}}`).join(', ')}</strong>
          </p>
        </div>
      )}

      {saveError && (
        <p className="text-sm text-destructive">{saveError}</p>
      )}

      {saveSuccess && (
        <p className="text-sm text-green-600">Template salvo com sucesso.</p>
      )}

      <Button onClick={handleSave} disabled={isPending} className="w-full sm:w-auto">
        <Save className="h-4 w-4 mr-2" />
        {isPending ? 'Salvando...' : 'Salvar alterações'}
      </Button>
    </div>
  )
}
