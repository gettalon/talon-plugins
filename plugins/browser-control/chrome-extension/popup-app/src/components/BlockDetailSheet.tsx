import React, { useState, useMemo } from 'react'
import { X, Copy, Check, ChevronDown } from 'lucide-react'
import { darkColors as c } from '@shared/themes'

interface DetailBlock {
  title: string
  toolName?: string
  arguments?: string
  output?: string
  is_error?: boolean
}

export function BlockDetailSheet({ block, onClose }: { block: DetailBlock | null; onClose: () => void }) {
  const [copied, setCopied] = useState<'args' | 'output' | null>(null)

  if (!block) return null

  const handleCopy = (text: string, which: 'args' | 'output') => {
    navigator.clipboard.writeText(text)
    setCopied(which)
    setTimeout(() => setCopied(null), 1500)
  }

  const isEdit = block.toolName && /^(edit|editfile|str_replace|str_replace_editor)$/i.test(block.toolName)
  const isDiff = isEdit && block.output?.includes('@@')

  // Parse edit arguments for old/new display
  let editOld = '', editNew = ''
  if (isEdit && block.arguments) {
    try {
      const args = JSON.parse(block.arguments)
      editOld = args.old_str || args.old_string || args.search || ''
      editNew = args.new_str || args.new_string || args.replace || ''
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="rounded-t-2xl max-h-[70vh] flex flex-col overflow-hidden animate-slideUp"
        style={{ background: c.bg.secondary }}>

        {/* Handle bar */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-8 h-1 rounded-full" style={{ background: c.border.secondary }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 shrink-0"
          style={{ borderBottom: `1px solid ${c.border.primary}` }}>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm font-semibold truncate" style={{ color: c.text.primary }}>
              {block.title}
            </span>
            {block.is_error && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: `${c.accent.red}20`, color: c.accent.red }}>
                Error
              </span>
            )}
          </div>
          <button onClick={onClose}
            className="p-1 rounded-md border-none cursor-pointer shrink-0"
            style={{ background: c.bg.tertiary, color: c.text.secondary }}>
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Edit tool: show old/new diff */}
          {isEdit && (editOld || editNew) ? (
            <div className="p-3 flex flex-col gap-3">
              {editOld && (
                <DetailSection label="REMOVED" color={c.accent.red}
                  content={editOld} onCopy={() => handleCopy(editOld, 'args')} copied={copied === 'args'} />
              )}
              {editNew && (
                <DetailSection label="ADDED" color={c.accent.green}
                  content={editNew} onCopy={() => handleCopy(editNew, 'output')} copied={copied === 'output'} />
              )}
            </div>
          ) : (
            <div className="p-3 flex flex-col gap-3">
              {/* Arguments */}
              {block.arguments && (
                <DetailSection label="INPUT" color={c.accent.blue}
                  content={formatJson(block.arguments)}
                  onCopy={() => handleCopy(block.arguments!, 'args')} copied={copied === 'args'} />
              )}

              {/* Output */}
              {block.output && (
                <DetailSection label={block.is_error ? 'ERROR' : 'OUTPUT'}
                  color={block.is_error ? c.accent.red : c.accent.green}
                  content={isDiff ? undefined : block.output}
                  onCopy={() => handleCopy(block.output!, 'output')} copied={copied === 'output'}>
                  {isDiff ? <DiffView content={block.output} /> : undefined}
                </DetailSection>
              )}

              {/* Thinking content (no tool) */}
              {!block.toolName && block.title === 'Thinking' && (
                <div className="text-xs font-mono whitespace-pre-wrap leading-relaxed p-3 rounded-lg"
                  style={{ background: c.bg.primary, color: c.text.secondary }}>
                  {block.arguments || ''}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailSection({ label, color, content, onCopy, copied, children }: {
  label: string; color: string; content?: string; onCopy: () => void; copied: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${c.border.primary}` }}>
      <div className="flex items-center justify-between px-3 py-1.5"
        style={{ background: c.bg.tertiary, borderBottom: `1px solid ${c.border.primary}` }}>
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>{label}</span>
        <button onClick={onCopy}
          className="flex items-center gap-1 text-[10px] border-none cursor-pointer px-1.5 py-0.5 rounded"
          style={{ background: 'transparent', color: c.text.tertiary }}>
          {copied ? <><Check size={9} /> Copied</> : <><Copy size={9} /> Copy</>}
        </button>
      </div>
      <div className="text-[11px] font-mono whitespace-pre-wrap break-all max-h-[40vh] overflow-y-auto p-3 leading-relaxed"
        style={{ background: c.bg.primary, color: c.text.secondary }}>
        {children || content}
      </div>
    </div>
  )
}

function DiffView({ content }: { content: string }) {
  return (
    <>
      {content.split('\n').map((line, i) => {
        let color = c.text.secondary
        let bg = 'transparent'
        if (line.startsWith('+') && !line.startsWith('+++')) {
          color = c.accent.green; bg = `${c.accent.green}10`
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          color = c.accent.red; bg = `${c.accent.red}10`
        } else if (line.startsWith('@@')) {
          color = c.accent.blue; bg = `${c.accent.blue}08`
        }
        return (
          <div key={i} className="px-1 -mx-1" style={{ color, background: bg }}>
            {line}
          </div>
        )
      })}
    </>
  )
}

function formatJson(s: string): string {
  try {
    const parsed = JSON.parse(s)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return s
  }
}
