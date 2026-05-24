'use client'
import { useEditor, EditorContent, Extension } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { DecorationSet, Decoration } from '@tiptap/pm/view'
import { forwardRef, useImperativeHandle } from 'react'
import type { Json } from '@/types/database'

export interface TemplateEditorHandle {
  getHTML: () => string
  getJSON: () => Record<string, unknown>
  insertVariable: (key: string) => void
}

const variablePluginKey = new PluginKey('variableHighlight')

const VariableHighlight = Extension.create({
  name: 'variableHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: variablePluginKey,
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            const { doc } = state
            doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return
              const regex = /\{\{(\w+)\}\}/g
              let match
              while ((match = regex.exec(node.text)) !== null) {
                decorations.push(
                  Decoration.inline(pos + match.index, pos + match.index + match[0].length, {
                    class: 'template-variable-chip',
                  })
                )
              }
            })
            return DecorationSet.create(doc, decorations)
          },
        },
      }),
    ]
  },
})

interface TemplateEditorProps {
  initialContent: Json
  onChange?: () => void
}

export const TemplateEditor = forwardRef<TemplateEditorHandle, TemplateEditorProps>(
  function TemplateEditor({ initialContent, onChange }, ref) {
    const editor = useEditor({
      extensions: [
        StarterKit,
        Link.configure({ openOnClick: false }),
        Table.configure({ resizable: true }),
        TableRow,
        TableCell,
        TableHeader,
        VariableHighlight,
      ],
      content: initialContent as Record<string, unknown>,
      onUpdate: onChange,
      editorProps: {
        attributes: {
          class: 'prose prose-sm max-w-none min-h-[200px] p-3 focus:outline-none',
        },
      },
    })

    useImperativeHandle(ref, () => ({
      getHTML: () => editor?.getHTML() ?? '',
      getJSON: () => editor?.getJSON() ?? {},
      insertVariable: (key: string) => {
        editor?.chain().focus().insertContent(`{{${key}}}`).run()
      },
    }))

    if (!editor) return null

    return (
      <div className="border rounded-md overflow-hidden">
        <div className="flex flex-wrap gap-1 p-2 border-b bg-muted/50">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`px-2 py-1 text-sm rounded ${editor.isActive('bold') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >B</button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`px-2 py-1 text-sm rounded italic ${editor.isActive('italic') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >I</button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`px-2 py-1 text-sm rounded ${editor.isActive('bulletList') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >• Lista</button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`px-2 py-1 text-sm rounded ${editor.isActive('orderedList') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >1. Lista</button>
          <button
            type="button"
            onClick={() => {
              const url = window.prompt('URL do link:')
              if (url) editor.chain().focus().setLink({ href: url }).run()
            }}
            className={`px-2 py-1 text-sm rounded ${editor.isActive('link') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >Link</button>
          <button
            type="button"
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            className="px-2 py-1 text-sm rounded hover:bg-muted"
          >Tabela</button>
        </div>
        <EditorContent editor={editor} />
      </div>
    )
  }
)
