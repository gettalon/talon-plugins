import React, { useState, useRef, useEffect, useCallback } from 'react'
import { darkColors as c } from '@shared/themes'
import type { ContentBlock } from '@shared/types'
import { Markdown } from './Markdown'
import { ToolCard, ToolBatch } from './ToolCard'
import { ChevronRight, Copy, Reply, Trash2 } from 'lucide-react'
import { useChatStore, type DisplayMessage } from '../stores/chatStore'

export function MessageBubble({ msg }: { msg: DisplayMessage }) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ctxMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setCtxMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ctxMenu])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleCopy = () => { navigator.clipboard.writeText(msg.content); setCtxMenu(null) }
  const handleReply = () => { useChatStore.getState().setInput(`> ${msg.content.split('\n')[0]}\n\n`); setCtxMenu(null) }
  const handleDelete = () => { useChatStore.getState().deleteMessage(msg.id); setCtxMenu(null) }

  const contextMenuEl = ctxMenu && (
    <div ref={menuRef} className="fixed z-[100] rounded-lg shadow-xl overflow-hidden py-1"
      style={{ left: Math.min(ctxMenu.x, window.innerWidth - 160), top: Math.min(ctxMenu.y, window.innerHeight - 120),
        background: c.bg.secondary, border: `1px solid ${c.border.secondary}`, minWidth: 140 }}>
      <CtxMenuItem icon={<Copy size={12} />} label="Copy" onClick={handleCopy} />
      <CtxMenuItem icon={<Reply size={12} />} label="Reply" onClick={handleReply} />
      <CtxMenuItem icon={<Trash2 size={12} />} label="Delete" onClick={handleDelete} danger />
    </div>
  )

  // System message — centered, italic
  if (msg.role === 'system') {
    return (
      <div className="px-5 py-1" onContextMenu={handleContextMenu}>
        <div className="text-sm italic text-center px-5 py-3" style={{ color: c.text.tertiary }}>
          {msg.content}
        </div>
        {contextMenuEl}
      </div>
    )
  }

  // User message — coral bubble, right aligned
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end px-3 py-1" onContextMenu={handleContextMenu}>
        <div className={`max-w-[85%] px-3 py-2.5 text-sm leading-[22px] whitespace-pre-wrap select-text${msg.pending ? ' animate-send' : ''}`}
          style={{ background: c.accent.coral, color: '#ffffff', borderRadius: '12px 12px 6px 12px' }}>
          {msg.content}
        </div>
        {contextMenuEl}
      </div>
    )
  }

  // Assistant message — no bubble, full width, row has px-3 padding
  return (
    <div className="px-3 py-1 text-sm leading-[22px] select-text" style={{ color: c.text.primary }}
      onContextMenu={handleContextMenu}>
      <BlockRenderer blocks={msg.blocks} />
      {contextMenuEl}
    </div>
  )
}

function CtxMenuItem({ icon, label, onClick, danger }: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left border-none cursor-pointer"
      style={{ background: 'transparent', color: danger ? c.accent.red : c.text.primary }}
      onMouseEnter={e => (e.currentTarget.style.background = c.bg.tertiary)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <span style={{ color: danger ? c.accent.red : c.text.secondary }}>{icon}</span>
      {label}
    </button>
  )
}

/** Renders ordered content blocks */
export function BlockRenderer({ blocks, isStreaming }: { blocks: ContentBlock[]; isStreaming?: boolean }) {
  if (!blocks.length) return null

  type ToolPair = { use: ContentBlock & { type: 'tool_use' }; result?: ContentBlock & { type: 'tool_result' } }
  const toolResults = new Map<string, ContentBlock & { type: 'tool_result' }>()
  for (const b of blocks) { if (b.type === 'tool_result') toolResults.set(b.call_id, b) }

  const rendered: React.ReactNode[] = []
  let pendingTools: ToolPair[] = []
  let key = 0

  const flushTools = () => {
    if (pendingTools.length === 0) return
    if (pendingTools.length === 1) {
      rendered.push(<ToolCard key={key++} use={pendingTools[0].use} result={pendingTools[0].result} />)
    } else {
      rendered.push(<ToolBatch key={key++} pairs={[...pendingTools]} />)
    }
    pendingTools = []
  }

  for (const b of blocks) {
    if (b.type === 'text') {
      flushTools()
      rendered.push(
        isStreaming
          ? <div key={key++} className="whitespace-pre-wrap">{b.content}</div>
          : <Markdown key={key++} content={b.content} />
      )
    } else if (b.type === 'thinking') {
      flushTools()
      rendered.push(<ThinkingBlock key={key++} content={b.content} />)
    } else if (b.type === 'tool_use') {
      pendingTools.push({ use: b, result: toolResults.get(b.call_id) })
    }
  }
  flushTools()

  return <div className="flex flex-col gap-1.5">{rendered}</div>
}

function ThinkingBlock({ content }: { content: string }) {
  const handleClick = () => {
    useChatStore.getState().setDetailBlock({
      title: 'Thinking',
      arguments: content,
    })
  }

  return (
    <div className="rounded-lg px-3 py-2 my-0.5 cursor-pointer" onClick={handleClick}
      style={{ background: `${c.accent.purple}15` }}>
      <div className="flex items-center gap-1.5 text-xs" style={{ color: c.accent.purple }}>
        <ChevronRight size={10} className="shrink-0" />
        <span className="font-semibold">Thinking</span>
        <span className="truncate flex-1 text-[11px]" style={{ color: c.text.tertiary }}>
          {content.split('\n')[0]?.slice(0, 50)}
        </span>
      </div>
    </div>
  )
}

export function StreamingIndicator() {
  return <span className="text-sm animate-pulse" style={{ color: c.accent.coral }}>✦ </span>
}

export function StreamingCursor() {
  return <span className="text-sm font-bold" style={{ color: c.accent.blue, animation: 'blink 0.8s infinite' }}>✻</span>
}

export function ThinkingIndicator({ text }: { text: string }) {
  return (
    <div className="rounded-lg px-3 py-2 my-0.5" style={{ background: `${c.accent.purple}15` }}>
      <div className="flex items-center gap-1.5 text-xs" style={{ color: c.accent.purple }}>
        <span className="animate-pulse">●</span>
        <span className="font-semibold">Thinking</span>
      </div>
      {text && (
        <div className="text-[11px] mt-1 truncate" style={{ color: c.text.tertiary }}>
          {text.split('\n').pop()?.slice(0, 60)}
        </div>
      )}
    </div>
  )
}
