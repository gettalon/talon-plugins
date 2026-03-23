import React, { useRef, useCallback, useState, useEffect, useMemo } from 'react'
import { PlusCircle, ArrowUp, Square, Camera, Paperclip, Type, X, Crosshair, ListPlus } from 'lucide-react'
import { darkColors as c } from '@shared/themes'
import { useChatStore } from '../stores/chatStore'

declare const chrome: any

const FALLBACK_COMMANDS = [
  { name: '/help', desc: 'Show available commands and usage' },
  { name: '/model', desc: 'Switch the active AI model' },
  { name: '/permission', desc: 'Set tool permission mode' },
  { name: '/agent', desc: 'Start an autonomous agent task' },
  { name: '/clear', desc: 'Clear conversation history' },
  { name: '/stop', desc: 'Stop the current generation' },
  { name: '/compact', desc: 'Compact conversation context' },
]

export function InputBar({ streamTextRef, streamBlocksRef }: {
  streamTextRef: React.MutableRefObject<string>
  streamBlocksRef: React.MutableRefObject<any[]>
}) {
  const input = useChatStore(s => s.input)
  const setInput = useChatStore(s => s.setInput)
  const isStreaming = useChatStore(s => s.isStreaming)
  const connected = useChatStore(s => s.connected)
  const pageContext = useChatStore(s => s.pageContext)
  const setPageContext = useChatStore(s => s.setPageContext)
  const addMessage = useChatStore(s => s.addMessage)
  const setIsStreaming = useChatStore(s => s.setIsStreaming)
  const clearSuggestions = useChatStore(s => s.clearSuggestions)
  const enqueueMessage = useChatStore(s => s.enqueueMessage)
  const costInfo = useChatStore(s => s.costInfo)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [slashIdx, setSlashIdx] = useState(-1)
  const [showScreenshotPreview, setShowScreenshotPreview] = useState(false)
  const [slashCommands, setSlashCommands] = useState(FALLBACK_COMMANDS)

  // Load slash commands from backend
  useEffect(() => {
    try {
      chrome.runtime.sendMessage({ type: 'list_slash_commands' }, (resp: any) => {
        if (chrome.runtime.lastError) return
        const cmds = Array.isArray(resp) ? resp : resp?.commands || resp?.data || []
        if (cmds.length > 0) {
          setSlashCommands(cmds.map((c: any) => ({
            name: c.name?.startsWith('/') ? c.name : `/${c.name || ''}`,
            desc: c.description || c.desc || '',
          })))
        }
      })
    } catch {}
  }, [connected])

  // Slash command filtering
  const showSlash = input.startsWith('/')
  const filteredCommands = useMemo(() => {
    if (!showSlash) return []
    const q = input.toLowerCase()
    return slashCommands.filter(cmd => cmd.name.startsWith(q) || q === '/')
  }, [input, showSlash, slashCommands])

  // Reset slash index when commands change
  useEffect(() => { setSlashIdx(0) }, [filteredCommands.length])

  // Context usage from costInfo
  const contextUsage = useMemo(() => {
    if (!costInfo) return 0
    return Math.min(Math.round((costInfo.inTok / 200000) * 100), 100)
  }, [costInfo])

  const contextColor = contextUsage > 80 ? c.accent.red : contextUsage > 60 ? c.accent.amber : c.accent.green

  const sendMessage = useCallback((text?: string) => {
    const msg = (text || input).trim()
    if (!msg) return

    // Always send directly — no queuing. Each message goes to the channel immediately.
    addMessage({
      id: `u-${Date.now()}`, role: 'user', content: msg,
      blocks: [{ type: 'text', content: msg }],
      timestamp: Date.now(), pending: true,
    })
    setInput('')
    clearSuggestions()
    setIsStreaming(true)
    streamTextRef.current = ''
    streamBlocksRef.current = []

    const payload: any = { type: 'chat_send', text: msg }
    if (pageContext) {
      payload.context = pageContext
      setPageContext(null)
    }

    chrome.runtime.sendMessage(payload, (resp: any) => {
      if (chrome.runtime.lastError || resp?.error) {
        addMessage({
          id: `e-${Date.now()}`, role: 'system',
          content: 'Failed: ' + (resp?.error || chrome.runtime.lastError?.message),
          blocks: [], timestamp: Date.now(),
        })
        setIsStreaming(false)
      }
    })

    if (inputRef.current) inputRef.current.style.height = 'auto'
  }, [input, isStreaming, pageContext])

  const attachPageContext = useCallback(async () => {
    setShowAttachMenu(false)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab) return
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({
          url: window.location.href,
          title: document.title,
          selection: window.getSelection()?.toString()?.substring(0, 2000) || '',
          text: document.body?.innerText?.substring(0, 3000) || '',
        }),
      })
      if (results?.[0]?.result) setPageContext(results[0].result)
    } catch (err: any) {
      addMessage({ id: `e-${Date.now()}`, role: 'system', content: 'Cannot access page: ' + err.message, blocks: [], timestamp: Date.now() })
    }
  }, [])

  const captureScreenshot = useCallback(async () => {
    setShowAttachMenu(false)
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' })
      setPageContext({ url: 'screenshot', title: 'Page Screenshot', screenshot: dataUrl })
    } catch (err: any) {
      addMessage({ id: `e-${Date.now()}`, role: 'system', content: 'Screenshot failed: ' + err.message, blocks: [], timestamp: Date.now() })
    }
  }, [])

  const attachSelectedText = useCallback(async () => {
    setShowAttachMenu(false)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab) return
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection()?.toString() || '',
      })
      const sel = results?.[0]?.result
      if (sel) setPageContext({ url: 'selection', title: 'Selected Text', selection: sel })
    } catch {}
  }, [])

  const startElementPicker = useCallback(() => {
    setShowAttachMenu(false)
    try {
      chrome.runtime.sendMessage({ type: 'start_element_picker' })
    } catch {}
  }, [])

  const stopAgent = () => chrome.runtime.sendMessage({ type: 'chat_stop' })
  const canSend = input.trim() && connected

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Slash command navigation
    if (showSlash && filteredCommands.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIdx(i => (i - 1 + filteredCommands.length) % filteredCommands.length)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIdx(i => (i + 1) % filteredCommands.length)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const cmd = filteredCommands[slashIdx]
        if (cmd) {
          setInput(cmd.name + ' ')
          inputRef.current?.focus()
        }
        return
      }
      if (e.key === 'Escape') {
        setInput('')
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  return (
    <div className="shrink-0 relative" style={{ borderTop: `1px solid ${c.border.primary}` }}>
      {/* Slash command autocomplete dropdown */}
      {showSlash && filteredCommands.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-1 z-50 rounded-lg overflow-hidden shadow-lg"
          style={{ background: c.bg.secondary, border: `1px solid ${c.border.secondary}`, maxHeight: 200, overflowY: 'auto' }}>
          {filteredCommands.map((cmd, i) => (
            <button key={cmd.name}
              onClick={() => { setInput(cmd.name + ' '); inputRef.current?.focus() }}
              className="flex flex-col w-full px-3 py-2 text-left border-none cursor-pointer"
              style={{ background: i === slashIdx ? c.bg.tertiary : 'transparent' }}
              onMouseEnter={() => setSlashIdx(i)}>
              <span className="text-xs font-bold" style={{ color: c.accent.coral }}>{cmd.name}</span>
              <span className="text-[10px] mt-0.5" style={{ color: c.text.tertiary }}>{cmd.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* Attach menu dropdown */}
      {showAttachMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowAttachMenu(false)} />
          <div className="absolute bottom-full left-3 mb-1 z-50 rounded-lg overflow-hidden shadow-lg"
            style={{ background: c.bg.secondary, border: `1px solid ${c.border.primary}`, minWidth: 180 }}>
            <div className="px-3 py-1.5 uppercase text-[10px] font-bold tracking-wider"
              style={{ color: c.text.tertiary }}>Attach</div>
            <MenuItem icon={<Paperclip size={14} />} label="Page content" onClick={attachPageContext} />
            <MenuItem icon={<Camera size={14} />} label="Screenshot" onClick={captureScreenshot} />
            <MenuItem icon={<Type size={14} />} label="Selected text" onClick={attachSelectedText} />
            <MenuItem icon={<Crosshair size={14} />} label="Pick element" onClick={startElementPicker} />
          </div>
        </>
      )}

      {/* Screenshot preview modal */}
      {showScreenshotPreview && pageContext?.screenshot && (
        <>
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={() => setShowScreenshotPreview(false)}>
            <div className="relative max-w-full max-h-full" onClick={e => e.stopPropagation()}>
              <img src={pageContext.screenshot} alt="Screenshot preview"
                className="max-w-full max-h-[80vh] rounded-lg shadow-2xl" style={{ border: `2px solid ${c.border.secondary}` }} />
              <button onClick={() => setShowScreenshotPreview(false)}
                className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full border-none cursor-pointer"
                style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                <X size={16} />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Attachment chips */}
      {pageContext && (
        <div className="flex items-center gap-1.5 px-3 pt-2">
          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px]"
            style={{ background: c.bg.tertiary, border: `1px solid ${c.border.secondary}`, color: c.text.primary }}>
            {pageContext.screenshot ? (
              <img src={pageContext.screenshot} alt="thumb"
                className="rounded cursor-pointer"
                style={{ width: 32, height: 24, objectFit: 'cover', border: `1px solid ${c.border.secondary}` }}
                onClick={() => setShowScreenshotPreview(true)} />
            ) : (
              <Paperclip size={10} />
            )}
            <span className="max-w-[150px] truncate">{pageContext.title || pageContext.url}</span>
            <button onClick={() => setPageContext(null)}
              className="ml-0.5 border-none p-0 cursor-pointer text-xs font-bold leading-none"
              style={{ background: 'transparent', color: c.text.primary }}>✕</button>
          </div>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-1 px-3 py-2">
        {/* Add/attach button */}
        <button onClick={() => setShowAttachMenu(!showAttachMenu)}
          className="w-9 h-9 flex items-center justify-center shrink-0 border-none cursor-pointer"
          style={{ background: 'transparent', color: showAttachMenu ? c.accent.coral : c.text.secondary }}>
          <PlusCircle size={28} />
        </button>

        {/* Input container */}
        <div className="flex-1 rounded-2xl overflow-hidden"
          style={{ background: c.bg.secondary, border: `1px solid ${c.border.primary}` }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onKeyDown={handleKeyDown}
            placeholder="Message Talon..."
            rows={1}
            className="w-full px-3.5 py-2.5 text-sm resize-none outline-none max-h-[120px] min-h-[38px]"
            style={{ background: 'transparent', color: c.text.primary, border: 'none' }}
          />
        </div>

        {/* Send / Queue / Stop */}
        {isStreaming && !input.trim() ? (
          <button onClick={stopAgent}
            className="w-[38px] h-[38px] flex items-center justify-center shrink-0 border-none cursor-pointer"
            style={{ background: c.accent.coral, borderRadius: 19, color: '#fff' }}>
            <Square size={14} fill="white" />
          </button>
        ) : (
          <button onClick={() => sendMessage()} disabled={!canSend}
            className="w-[38px] h-[38px] flex items-center justify-center shrink-0 border-none cursor-pointer disabled:cursor-not-allowed"
            style={{ background: canSend ? (isStreaming ? c.accent.amber : c.accent.coral) : c.bg.tertiary, borderRadius: 19, color: canSend ? '#fff' : c.text.tertiary }}>
            {isStreaming ? <ListPlus size={18} strokeWidth={2} /> : <ArrowUp size={20} strokeWidth={2.5} />}
          </button>
        )}
      </div>

      {/* Status bar — minimal: cost + context usage */}
      {costInfo && (costInfo.cost > 0 || costInfo.inTok > 0) && (
        <div className="flex items-center justify-end px-4 pb-1.5 gap-2" style={{ color: c.text.tertiary }}>
          {costInfo.cost > 0 && (
            <span className="text-[10px] opacity-70">${costInfo.cost.toFixed(3)}</span>
          )}
          {costInfo.inTok > 0 && (
            <span className="text-[10px] opacity-70"
              title={`Context: ${costInfo.inTok.toLocaleString()} input tokens`}>
              <span style={{ color: contextColor, fontWeight: 600 }}>{contextUsage}%</span>
              <span className="ml-0.5">ctx</span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left border-none cursor-pointer transition-colors"
      style={{ background: 'transparent', color: c.text.primary }}
      onMouseEnter={e => (e.currentTarget.style.background = c.bg.tertiary)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <span style={{ color: c.text.secondary }}>{icon}</span>
      {label}
    </button>
  )
}

