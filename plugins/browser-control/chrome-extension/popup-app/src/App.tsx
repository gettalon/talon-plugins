import React, { useEffect, useRef, useMemo, useState } from 'react'
import { darkColors as c } from '@shared/themes'
import { useChatStore } from './stores/chatStore'
import { useExtensionPort } from './hooks/useExtensionPort'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { InputBar } from './components/InputBar'
import { MessageBubble, BlockRenderer, StreamingIndicator, StreamingCursor, ThinkingIndicator } from './components/MessageBubble'
import { PermissionCard } from './components/PermissionCard'
import { AgentTaskBar } from './components/AgentTaskBar'
import { TipCards } from './components/TipCard'
import { MessageQueue } from './components/MessageQueue'
import { BlockDetailSheet } from './components/BlockDetailSheet'

export default function App() {
  const { streamTextRef, streamBlocksRef } = useExtensionPort()
  const messages = useChatStore(s => s.messages)
  const permissions = useChatStore(s => s.permissions)
  const isStreaming = useChatStore(s => s.isStreaming)
  const isThinking = useChatStore(s => s.isThinking)
  const thinkingText = useChatStore(s => s.thinkingText)
  const statusMsg = useChatStore(s => s.statusMsg)
  const suggestions = useChatStore(s => s.suggestions)
  const streamTick = useChatStore(s => s.streamTick)
  const detailBlock = useChatStore(s => s.detailBlock)
  const pageInfo = useChatStore(s => s.pageInfo)

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }))
  }

  useEffect(scrollToBottom, [messages, permissions, isStreaming])

  const streamingBlocks = useMemo(() => {
    if (!isStreaming) return []
    const blocks = [...streamBlocksRef.current]
    if (streamTextRef.current) {
      const lastTextIdx = blocks.findLastIndex(b => b.type === 'text')
      if (lastTextIdx >= 0) {
        blocks[lastTextIdx] = { type: 'text' as const, content: streamTextRef.current }
      } else {
        blocks.push({ type: 'text' as const, content: streamTextRef.current })
      }
    }
    return blocks
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, streamTick])

  const isEmpty = messages.length === 0
  const handleTipClick = (text: string) => useChatStore.getState().setInput(text)

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: c.bg.primary, color: c.text.primary }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <AgentTaskBar />

      {/* Page context bar */}
      {pageInfo && (
        <div className="flex items-center gap-2 px-3 py-1.5 shrink-0"
          style={{ borderBottom: `1px solid ${c.border.primary}`, background: `${c.bg.secondary}40` }}>
          {pageInfo.favicon && <img src={pageInfo.favicon} className="w-3.5 h-3.5 rounded-sm" />}
          <span className="text-[11px] truncate flex-1" style={{ color: c.text.secondary }}>{pageInfo.title}</span>
          <span className="text-[10px] truncate" style={{ color: c.text.tertiary }}>{(() => { try { return new URL(pageInfo.url).hostname } catch { return '' } })()}</span>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-4">
        {/* Empty state with tips */}
        {isEmpty && !isStreaming && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="text-5xl mb-4">🦅</div>
            <div className="text-sm text-center leading-relaxed mb-6 px-8" style={{ color: c.text.tertiary }}>
              Ask anything about the current page, or use browser tools to interact with it.
            </div>
            <TipCards onTipClick={handleTipClick} />
          </div>
        )}

        {/* Message list */}
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {/* Streaming assistant response */}
        {isStreaming && (streamingBlocks.length > 0 || isThinking) && (
          <div className="px-3 py-1 text-sm leading-[22px] select-text" style={{ color: c.text.primary }}>
            <StreamingIndicator />
            <BlockRenderer blocks={streamingBlocks} isStreaming />
            {isThinking && <ThinkingIndicator text={thinkingText} />}
            <StreamingCursor />
          </div>
        )}

        {/* Waiting indicator */}
        {isStreaming && streamingBlocks.length === 0 && !isThinking && (
          <div className="flex items-center gap-2 text-xs px-3 py-1" style={{ color: c.text.tertiary }}>
            <span className="animate-pulse text-sm" style={{ color: c.accent.coral }}>✦</span>
            {statusMsg || 'Thinking...'}
          </div>
        )}

        {/* Status during streaming */}
        {statusMsg && isStreaming && streamingBlocks.length > 0 && (
          <div className="text-[11px] px-3 flex items-center gap-1.5" style={{ color: c.text.tertiary }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: c.accent.coral }} />
            {statusMsg}
          </div>
        )}

        {/* Permission cards */}
        {permissions.map(perm => (
          <div key={perm.requestId} className="px-3">
            <PermissionCard perm={perm} />
          </div>
        ))}

        {/* Message queue */}
        <MessageQueue />

        {/* Suggestions */}
        {!isStreaming && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3">
            {suggestions.map((s, i) => (
              <button key={i}
                onClick={() => useChatStore.getState().setInput(s)}
                className="text-[11px] px-3 py-1.5 rounded-full border cursor-pointer transition-opacity hover:opacity-80"
                style={{ borderColor: c.border.secondary, color: c.accent.blue, background: c.bg.secondary }}>
                {s}
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <InputBar streamTextRef={streamTextRef} streamBlocksRef={streamBlocksRef} />

      <BlockDetailSheet
        block={detailBlock}
        onClose={() => useChatStore.getState().setDetailBlock(null)}
      />
    </div>
  )
}
