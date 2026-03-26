import { useEffect, useRef } from 'react'
import { useChatStore } from '../stores/chatStore'
import type { ContentBlock } from '@shared/types'

declare const chrome: any

/** Manages chrome.runtime port for streaming events from background.js */
export function useExtensionPort() {
  const portRef = useRef<any>(null)
  const streamTextRef = useRef('')
  const streamBlocksRef = useRef<ContentBlock[]>([])
  const thinkingAccRef = useRef('')

  const store = useChatStore

  useEffect(() => {
    function connect() {
      try {
        const port = chrome.runtime.connect({ name: 'popup' })
        portRef.current = port

        port.onMessage.addListener((msg: any) => {
          const s = store.getState()

          switch (msg.type) {
            case 'stream_delta':
              streamTextRef.current += msg.text
              s.setIsStreaming(true)
              s.incrementStreamTick()
              break

            case 'stream_end': {
              const text = streamTextRef.current
              const blocks = [...streamBlocksRef.current]
              if (text || blocks.length) {
                const hasText = blocks.some(b => b.type === 'text')
                if (text && !hasText) blocks.unshift({ type: 'text', content: text })
                else if (text && hasText) {
                  for (let i = blocks.length - 1; i >= 0; i--) {
                    if (blocks[i].type === 'text') { blocks[i] = { type: 'text', content: text }; break }
                  }
                }
                s.addMessage({
                  id: `a-${Date.now()}`, role: 'assistant', content: text,
                  blocks, timestamp: Date.now(),
                })
              }
              streamTextRef.current = ''
              streamBlocksRef.current = []
              s.setIsThinking(false)
              s.setThinkingText('')
              s.setStatusMsg(null)
              s.setIsStreaming(false)
              break
            }

            case 'turn_started':
              s.setIsStreaming(true)
              break

            case 'tool_use':
              streamBlocksRef.current = [...streamBlocksRef.current, {
                type: 'tool_use', call_id: msg.callId || `t-${Date.now()}`,
                tool_name: msg.toolName,
                arguments: typeof msg.arguments === 'string' ? msg.arguments : JSON.stringify(msg.arguments || {}),
              } as ContentBlock]
              break

            case 'tool_result':
              streamBlocksRef.current = [...streamBlocksRef.current, {
                type: 'tool_result', call_id: msg.callId || '',
                tool_name: msg.toolName || '', output: msg.output || '', is_error: !!msg.isError,
              } as ContentBlock]
              break

            case 'tool_progress':
              s.setStatusMsg(`${msg.toolName || 'Tool'} running (${Math.round(msg.elapsed || 0)}s)`)
              break

            case 'thinking_start':
              s.setIsThinking(true)
              thinkingAccRef.current = ''
              break
            case 'thinking_delta':
              thinkingAccRef.current += (msg.content || '')
              s.setThinkingText(thinkingAccRef.current)
              break
            case 'thinking_end':
              if (thinkingAccRef.current) {
                streamBlocksRef.current = [...streamBlocksRef.current, { type: 'thinking', content: thinkingAccRef.current } as ContentBlock]
              }
              s.setIsThinking(false)
              s.setThinkingText('')
              thinkingAccRef.current = ''
              break

            case 'permission_request':
              s.addPermission({
                requestId: msg.requestId, toolName: msg.toolName,
                args: typeof msg.arguments === 'string' ? msg.arguments : JSON.stringify(msg.arguments || {}, null, 2),
              })
              break
            case 'permission_cancelled':
              s.clearPermissions()
              break

            case 'status':
              s.setStatusMsg(msg.message || null)
              break
            case 'cost_update':
              s.setCostInfo({ cost: msg.totalCost, inTok: msg.inputTokens, outTok: msg.outputTokens })
              break
            case 'prompt_suggestion':
              if (msg.suggestion) s.addSuggestion(msg.suggestion)
              break
            case 'rate_limit':
              s.setStatusMsg(`Rate limited: ${msg.message}`)
              break

            case 'task_started':
              s.updateAgentTask({ taskId: msg.task_id, description: msg.description, status: 'running' })
              break
            case 'task_progress':
              s.updateAgentTask({ taskId: msg.task_id, message: msg.message, status: 'running', toolName: msg.last_tool_name })
              // Track progress for subagent cards (keyed by tool_use_id)
              if (msg.tool_use_id && msg.last_tool_name) {
                s.addSubagentProgress(msg.tool_use_id, {
                  type: 'tool_start', toolName: msg.last_tool_name,
                  text: msg.message || undefined, timestamp: Date.now(),
                })
              }
              break
            case 'task_notification':
              s.updateAgentTask({ taskId: msg.task_id, message: msg.message, status: msg.status === 'completed' ? 'done' : 'running' })
              break

            case 'agent_progress':
              // Subagent progress: store by parent_uuid (which maps to call_id)
              if (msg.is_sidechain && msg.parent_uuid) {
                const progressMsg = typeof msg.message === 'string' ? msg.message
                  : msg.message?.content || msg.message?.text || JSON.stringify(msg.message || '')
                s.addSubagentProgress(msg.parent_uuid, {
                  type: 'status', text: progressMsg, timestamp: Date.now(),
                })
              }
              break

            case 'tab_changed':
              s.setPageInfo(msg.pageContext || null)
              s.clearMessages()
              // Reload history for new tab
              try {
                chrome.runtime.sendMessage({ type: 'chat_history' }, (history: any) => {
                  if (!history?.length) return
                  store.getState().setMessages(history.map((m: any, i: number) => ({
                    id: `h-${i}`, role: m.role, content: m.text,
                    blocks: [{ type: 'text' as const, content: m.text }],
                    timestamp: Date.now(),
                  })))
                })
              } catch {}
              break

            case 'element_picked':
              s.setPageContext({
                url: msg.url || 'element',
                title: msg.title || 'Picked Element',
                element: msg.element,
                selector: msg.selector,
                text: msg.text,
              })
              break

            case 'hook_event':
              s.addHookEvent({
                hookEventName: msg.hookEventName,
                data: msg.data || {},
                receivedAt: Date.now(),
              })
              break

            case 'channel_connected':
            case 'mode_changed':
              s.setClientMode(msg.mode || 'full')
              s.setAllowsChat(msg.allowsChat !== false)
              s.setAllowsPermissions(msg.allowsPermissions !== false)
              break

            case 'error':
              s.addMessage({
                id: `e-${Date.now()}`, role: 'system',
                content: 'Error: ' + (msg.message || 'Unknown'),
                blocks: [], timestamp: Date.now(),
              })
              s.setIsStreaming(false)
              break
          }
        })

        port.onDisconnect.addListener(() => {
          portRef.current = null
          setTimeout(connect, 1000)
        })
      } catch {
        setTimeout(connect, 2000)
      }
    }
    connect()
  }, [])

  // Status polling
  useEffect(() => {
    const check = () => {
      try {
        chrome.runtime.sendMessage({ type: 'get_status' }, (resp: any) => {
          if (chrome.runtime.lastError) return
          store.getState().setConnected(!!resp?.connected)
        })
      } catch {}
    }
    check()
    const iv = setInterval(check, 3000)
    return () => clearInterval(iv)
  }, [])

  // Load history
  useEffect(() => {
    try {
      chrome.runtime.sendMessage({ type: 'chat_history' }, (history: any) => {
        if (!history?.length) return
        store.getState().setMessages(history.map((m: any, i: number) => ({
          id: `h-${i}`, role: m.role, content: m.text,
          blocks: [{ type: 'text' as const, content: m.text }],
          timestamp: Date.now(),
        })))
      })
    } catch {}
  }, [])

  return { streamTextRef, streamBlocksRef }
}
