'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { saveBodyAction, sendAnnouncementAction } from '@/app/(internal)/comunicados/actions'
import { AnnouncementAttachments } from '@/components/comunicados/AnnouncementAttachments'

export function AnnouncementForm({ announcementId, initialBodyHtml = '', initialBodyRichText, readOnly = false }: {
  announcementId: string
  initialBodyHtml?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialBodyRichText?: object | null
  readOnly?: boolean
}) {
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const editor = useEditor({
    extensions: [StarterKit],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content: (initialBodyRichText as any) ?? initialBodyHtml,
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[200px] p-3 focus:outline-none',
      },
    },
  })

  async function handleSave() {
    if (!editor) return
    setSaving(true)
    setMsg(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (saveBodyAction as any)(announcementId, editor.getHTML(), editor.getJSON())
    setSaving(false)
    setMsg(result.error ? `Erro ao salvar: ${result.error}` : 'Conteúdo salvo.')
  }

  async function handleSend() {
    if (!editor) return
    setSending(true)
    setMsg(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const saveResult = await (saveBodyAction as any)(announcementId, editor.getHTML(), editor.getJSON())
    if (saveResult.error) { setMsg(`Erro ao salvar: ${saveResult.error}`); setSending(false); return }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sendResult = await (sendAnnouncementAction as any)(announcementId)
    setSending(false)
    if (sendResult.error) setMsg(`Erro: ${sendResult.error}`)
    else setMsg(`Comunicado enviado para ${sendResult.sent} destinatários!`)
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Conteúdo</Label>
        <div className="border rounded-md overflow-hidden">
          {!readOnly && (
            <div className="flex flex-wrap gap-1 p-2 border-b bg-muted/50">
              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleBold().run()}
                className={`px-2 py-1 text-sm rounded ${editor?.isActive('bold') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >B</button>
              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleItalic().run()}
                className={`px-2 py-1 text-sm rounded italic ${editor?.isActive('italic') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >I</button>
              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
                className={`px-2 py-1 text-sm rounded ${editor?.isActive('bulletList') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >• Lista</button>
              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                className={`px-2 py-1 text-sm rounded ${editor?.isActive('orderedList') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >1. Lista</button>
            </div>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Anexos</Label>
        <AnnouncementAttachments announcementId={announcementId} canEdit={!readOnly} />
      </div>
      {!readOnly && (
        <div className="flex gap-3 items-center">
          <Button variant="outline" onClick={handleSave} disabled={saving || sending}>
            {saving ? 'Salvando...' : 'Salvar rascunho'}
          </Button>
          <Button onClick={handleSend} disabled={saving || sending}>
            {sending ? 'Enviando...' : 'Enviar agora'}
          </Button>
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
        </div>
      )}
    </div>
  )
}
