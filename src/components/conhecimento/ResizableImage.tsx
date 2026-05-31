'use client'
import { useRef } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { Image } from '@tiptap/extension-image'
import { ReactNodeViewRenderer } from '@tiptap/react'

function ResizableImageComponent({ node, updateAttributes, selected }: NodeViewProps) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const width: string | null = node.attrs.width

  function onMouseDownResize(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const container = containerRef.current
    if (!container) return
    const startW = container.offsetWidth
    const parentW = container.parentElement?.offsetWidth ?? startW

    function onMove(me: MouseEvent) {
      const newW = Math.max(50, startW + (me.clientX - startX))
      const pct = Math.round(Math.min(100, (newW / parentW) * 100))
      updateAttributes({ width: `${pct}%` })
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <NodeViewWrapper
      ref={containerRef}
      style={{
        display: 'inline-block',
        position: 'relative',
        width: width ?? undefined,
        maxWidth: '100%',
        verticalAlign: 'bottom',
      }}
    >
      <img
        src={node.attrs.src}
        alt={node.attrs.alt ?? ''}
        title={node.attrs.title ?? undefined}
        draggable={false}
        style={{ display: 'block', width: width ? '100%' : 'auto', maxWidth: '100%' }}
        className={selected ? 'outline outline-2 outline-offset-1 outline-blue-600' : ''}
      />
      {selected && (
        <span
          onMouseDown={onMouseDownResize}
          style={{
            position: 'absolute',
            right: -5,
            bottom: -5,
            width: 14,
            height: 14,
            backgroundColor: '#1e40af',
            borderRadius: 3,
            cursor: 'se-resize',
            border: '2px solid white',
            zIndex: 10,
            display: 'block',
          }}
        />
      )}
    </NodeViewWrapper>
  )
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML(attrs) {
          if (!attrs.width) return {}
          return { style: `width: ${attrs.width}` }
        },
        parseHTML(el) {
          const style = (el as HTMLElement).getAttribute('style') ?? ''
          const match = style.match(/width:\s*([^;]+)/)
          return match ? match[1].trim() : null
        },
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent)
  },
})
