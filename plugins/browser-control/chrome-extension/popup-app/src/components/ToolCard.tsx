import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { ChevronRight, ChevronDown, Loader2, FileText, Search, Terminal, Globe, Pencil, Eye, FolderSearch, Wrench, Bot, Send, Square } from 'lucide-react'
import { darkColors as c } from '@shared/themes'
import type { ContentBlock } from '@shared/types'
import { useChatStore } from '../stores/chatStore'

declare const chrome: any

// ── Tool action label + icon ──

const TOOL_ICONS: Record<string, React.ReactNode> = {
  read: <Eye size={11} />,
  write: <FileText size={11} />,
  edit: <Pencil size={11} />,
  grep: <Search size={11} />,
  glob: <FolderSearch size={11} />,
  bash: <Terminal size={11} />,
  webfetch: <Globe size={11} />,
  websearch: <Search size={11} />,
  agent: <Bot size={11} />,
}

function getToolIcon(toolName?: string): React.ReactNode {
  const n = (toolName || '').toLowerCase()
  for (const [key, icon] of Object.entries(TOOL_ICONS)) {
    if (n.includes(key)) return icon
  }
  return <Wrench size={11} />
}

export function getToolAction(toolName?: string, argsJson?: string): string {
  const n = (toolName || '').toLowerCase()
  let args: Record<string, any> = {}
  try { args = JSON.parse(argsJson || '{}') } catch {}
  const short = (s: string, max = 40) => s.length > max ? s.slice(0, max - 1) + '\u2026' : s
  const fmt = (name: string, arg?: string) => arg ? `${name}(${short(arg)})` : name

  if (n === 'read' || n === 'view' || n === 'readfile') return fmt('Read', args.file_path || args.path)
  if (n === 'write' || n === 'writefile' || n === 'create_file') return fmt('Write', args.file_path || args.path)
  if (n === 'edit' || n === 'editfile' || n === 'str_replace' || n === 'str_replace_editor') return fmt('Edit', args.file_path || args.path)
  if (n === 'grep' || n === 'ripgrep') return fmt('Grep', args.pattern || args.query)
  if (n === 'glob' || n === 'find' || n === 'list_directory') return fmt('Glob', args.pattern || args.path)
  if (n === 'bash' || n === 'shell' || n === 'sh' || n === 'exec' || n === 'run_command') return fmt('Bash', args.command || args.cmd)
  if (n === 'webfetch' || n === 'fetch') return fmt('WebFetch', args.url)
  if (n === 'websearch' || n === 'search_web') return fmt('WebSearch', args.query)
  if (n === 'agent') return fmt('Agent', args.description || args.prompt?.slice(0, 40))
  if (n === 'enterplanmode') return 'Enter plan mode'
  if (n === 'exitplanmode') return 'Exit plan mode'
  if (n === 'todowrite') return 'Update tasks'
  if (n === 'task_create') return fmt('TaskCreate', args.subject)
  if (n === 'task_update') return fmt('TaskUpdate', args.id ? `#${args.id}` : undefined)
  if (n === 'notebook_edit') return fmt('NotebookEdit', args.file_path)

  const displayName = (toolName || 'tool').split(/[_\-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
  const firstVal = Object.values(args).find(v => typeof v === 'string') as string | undefined
  return fmt(displayName, firstVal)
}

function isAgentTool(name?: string): boolean {
  const n = (name || '').toLowerCase()
  return n === 'agent' || n === 'sub_agent' || n === 'delegate_to_agent'
}

// ── Subagent card (renders Agent tool calls with live progress + message input) ──

export function SubagentCard({ use, result }: {
  use: ContentBlock & { type: 'tool_use' }
  result?: ContentBlock & { type: 'tool_result' }
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [msgInput, setMsgInput] = useState('')
  const [sending, setSending] = useState(false)
  const startedAt = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const isDone = !!result
  const isError = result?.is_error
  const callId = use.call_id

  // Live progress from store
  const progress = useChatStore(s => s.subagentProgress[callId] || [])

  // Parse agent description from arguments
  const { agentName, agentDescription } = useMemo(() => {
    let name = 'Agent'
    let desc = ''
    try {
      const args = JSON.parse(use.arguments || '{}')
      name = args.description || args.subagent_type || args.agent_name || args.name || 'Agent'
      desc = args.prompt ? (args.prompt.length > 120 ? args.prompt.slice(0, 120) + '\u2026' : args.prompt) : ''
      if (args.subagent_type && args.description && args.description.length > 30) {
        name = args.subagent_type
        desc = args.description
      }
    } catch {}
    return { agentName: name, agentDescription: desc }
  }, [use.arguments])

  // Elapsed timer
  useEffect(() => {
    if (isDone) return
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [isDone])

  // Auto-collapse when done
  useEffect(() => {
    if (isDone) setCollapsed(true)
  }, [isDone])

  // Parse nested tools from result output
  const nestedContent = useMemo(() => {
    if (!result?.output) return { tools: [], text: '' }
    const tools: Array<{ tool_name: string; arguments: string; output?: string; is_error?: boolean }> = []
    let text = ''
    try {
      const parsed = JSON.parse(result.output)
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.type === 'tool_use') {
            tools.push({ tool_name: item.name || item.tool_name || 'tool', arguments: typeof item.input === 'string' ? item.input : JSON.stringify(item.input ?? {}), output: undefined })
          } else if (item.type === 'tool_result') {
            const last = tools[tools.length - 1]
            if (last && !last.output) {
              last.output = typeof item.content === 'string' ? item.content : JSON.stringify(item.content ?? '')
              last.is_error = item.is_error
            }
          } else if (item.type === 'text' && item.text) {
            text += (text ? '\n' : '') + item.text
          }
        }
      } else if (typeof parsed === 'object' && parsed.result) {
        text = parsed.result
      } else if (typeof parsed === 'string') {
        text = parsed
      }
    } catch {
      text = result.output
    }
    return { tools, text }
  }, [result])

  const dotColor = isError ? c.accent.red : isDone ? c.accent.green : c.accent.coral
  const statusLabel = isDone
    ? isError ? `${agentName} failed` : `${agentName} completed`
    : `${agentName}\u2026`

  const sendToSubagent = useCallback(() => {
    const msg = msgInput.trim()
    if (!msg || !callId) return
    setSending(true)
    try {
      chrome.runtime.sendMessage({
        type: 'send_to_subagent',
        toolUseId: callId,
        message: msg,
      }, () => setSending(false))
    } catch { setSending(false) }
    setMsgInput('')
  }, [msgInput, callId])

  return (
    <div className="my-1 rounded-lg overflow-hidden" style={{ border: `1px solid ${c.border.primary}`, background: `${c.bg.secondary}80` }}>
      {/* Header row */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}>
        {/* Status indicator */}
        {!isDone ? (
          <span className="w-2 h-2 rounded-full shrink-0"
            style={{ background: dotColor, boxShadow: `0 0 4px ${dotColor}` }} />
        ) : (
          <span className="text-[10px] font-bold shrink-0" style={{ color: dotColor }}>
            {isError ? '\u2717' : '\u2713'}
          </span>
        )}

        <Bot size={12} className="shrink-0" style={{ color: c.accent.blue }} />

        <span className="text-xs font-medium flex-1 truncate" style={{ color: c.text.secondary }}>
          {statusLabel}
        </span>

        {!isDone && elapsed > 0 && (
          <span className="text-[10px] tabular-nums shrink-0" style={{ color: c.text.tertiary }}>{elapsed}s</span>
        )}

        {collapsed ? (
          <ChevronRight size={10} className="shrink-0" style={{ color: c.text.tertiary }} />
        ) : (
          <ChevronDown size={10} className="shrink-0" style={{ color: c.text.tertiary }} />
        )}
      </div>

      {/* Description (always visible if collapsed) */}
      {collapsed && agentDescription && (
        <div className="text-[11px] px-2.5 pb-1.5 truncate" style={{ color: c.text.tertiary }}>
          {agentDescription}
        </div>
      )}

      {/* Expanded content */}
      {!collapsed && (
        <div className="px-2.5 pb-2" style={{ borderTop: `1px solid ${c.border.primary}` }}>
          {/* Description */}
          {agentDescription && (
            <div className="text-[11px] py-1" style={{ color: c.text.tertiary }}>{agentDescription}</div>
          )}

          {/* Live progress (while running) */}
          {!isDone && progress.length > 0 && (
            <div className="mt-1 ml-2 pl-2 space-y-0.5" style={{ borderLeft: `1px solid ${c.border.primary}60` }}>
              {progress.slice(-8).map((p, i) => (
                <div key={i} className="flex items-center gap-1 text-[10px]" style={{ color: c.text.tertiary }}>
                  {p.type === 'tool_start' && (
                    <>
                      <span className="w-1 h-1 rounded-full shrink-0" style={{ background: c.accent.coral }} />
                      <span className="truncate">{p.toolName || 'Tool'}</span>
                    </>
                  )}
                  {p.type === 'status' && (
                    <>
                      <span className="w-1 h-1 rounded-full shrink-0" style={{ background: c.accent.blue }} />
                      <span className="truncate">{p.text}</span>
                    </>
                  )}
                  {p.type === 'text' && (
                    <span className="truncate">{p.text}</span>
                  )}
                </div>
              ))}
              {progress.length > 8 && (
                <div className="text-[9px]" style={{ color: c.text.tertiary }}>+{progress.length - 8} more</div>
              )}
            </div>
          )}

          {/* Completed: show nested tools and result text */}
          {isDone && nestedContent.tools.length > 0 && (
            <div className="mt-1 ml-2 pl-2 space-y-0.5" style={{ borderLeft: `1px solid ${c.border.primary}60` }}>
              {nestedContent.tools.map((tool, i) => {
                const tDone = tool.output !== undefined
                const tColor = tool.is_error ? c.accent.red : tDone ? c.accent.green : c.accent.coral
                const tAction = getToolAction(tool.tool_name, tool.arguments)
                return (
                  <div key={i} className="flex items-center gap-1 text-[10px]" style={{ color: c.text.tertiary }}>
                    <span className="w-1 h-1 rounded-full shrink-0" style={{ background: tColor }} />
                    <span className="truncate">{tAction}</span>
                  </div>
                )
              })}
            </div>
          )}

          {isDone && nestedContent.text && (
            <div className="text-[11px] mt-1 leading-relaxed" style={{ color: c.text.tertiary }}>
              {nestedContent.text.split('\n').slice(0, 3).map((line, i) => (
                <div key={i} className="truncate">{line}</div>
              ))}
            </div>
          )}

          {/* Message input (only while running) */}
          {!isDone && (
            <div className="flex items-center gap-1 mt-2 rounded-lg overflow-hidden"
              style={{ background: c.bg.tertiary, border: `1px solid ${c.border.primary}` }}>
              <input
                type="text"
                value={msgInput}
                onChange={e => setMsgInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendToSubagent() } }}
                placeholder="Message this subagent..."
                className="flex-1 text-[11px] px-2 py-1.5 outline-none"
                style={{ background: 'transparent', color: c.text.primary, border: 'none' }}
              />
              <button
                onClick={sendToSubagent}
                disabled={!msgInput.trim() || sending}
                className="w-7 h-7 flex items-center justify-center shrink-0 border-none cursor-pointer disabled:opacity-30"
                style={{ background: 'transparent', color: c.accent.blue }}>
                <Send size={12} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Single tool card ──

export function ToolCard({ use, result }: {
  use: ContentBlock & { type: 'tool_use' }
  result?: ContentBlock & { type: 'tool_result' }
}) {
  // Render Agent tools as SubagentCard
  if (isAgentTool(use.tool_name)) {
    return <SubagentCard use={use} result={result} />
  }

  const action = getToolAction(use.tool_name, use.arguments)
  const icon = getToolIcon(use.tool_name)
  const isDone = !!result
  const isError = result?.is_error

  const dotColor = isError ? c.accent.red : isDone ? c.accent.green : c.accent.coral

  // Parse first meaningful line of result for elbow preview
  const elbowLine = useMemo(() => {
    if (!result?.output) return null
    const line = result.output.split('\n').find(l => l.trim())?.trim()
    return line ? (line.length > 80 ? line.slice(0, 79) + '\u2026' : line) : null
  }, [result])

  const handleClick = () => {
    useChatStore.getState().setDetailBlock({
      title: action,
      toolName: use.tool_name,
      arguments: use.arguments,
      output: result?.output,
      is_error: result?.is_error,
    })
  }

  return (
    <div className="my-0.5">
      {/* Main row */}
      <div className="flex items-center gap-1.5 py-1 cursor-pointer select-none group"
        onClick={handleClick}>
        {/* Status dot */}
        <span className="w-2 h-2 rounded-full shrink-0 mt-px"
          style={{ background: dotColor, boxShadow: !isDone ? `0 0 4px ${dotColor}` : 'none' }} />

        {/* Tool icon */}
        <span className="shrink-0" style={{ color: c.text.tertiary }}>{icon}</span>

        {/* Action label */}
        <span className="text-xs font-medium flex-1 truncate" style={{ color: c.text.secondary }}>
          {action}
        </span>

        {/* Status */}
        {!isDone && (
          <Loader2 size={10} className="animate-spin shrink-0" style={{ color: c.accent.coral }} />
        )}

        {/* Chevron */}
        <ChevronRight size={10} className="shrink-0 opacity-0 group-hover:opacity-60"
          style={{ color: c.text.tertiary }} />
      </div>

      {/* Elbow line (collapsed preview) */}
      {elbowLine && (
        <div className="text-[11px] pl-[22px] truncate pb-0.5" style={{ color: c.text.tertiary }}>
          {elbowLine}
        </div>
      )}
    </div>
  )
}

// ── Tool batch (2+ tools grouped) ──

export function ToolBatch({ pairs }: {
  pairs: Array<{ use: ContentBlock & { type: 'tool_use' }; result?: ContentBlock & { type: 'tool_result' } }>
}) {
  if (pairs.length <= 1) {
    return pairs[0] ? <ToolCard use={pairs[0].use} result={pairs[0].result} /> : null
  }

  const [expanded, setExpanded] = useState(false)

  // Summary
  const toolCounts = new Map<string, number>()
  for (const p of pairs) {
    const action = getToolAction(p.use.tool_name, p.use.arguments).split('(')[0]
    toolCounts.set(action, (toolCounts.get(action) || 0) + 1)
  }
  const summary = Array.from(toolCounts.entries()).map(([n, count]) => count > 1 ? `${count}\u00d7 ${n}` : n).join(', ')
  const allDone = pairs.every(p => !!p.result)
  const anyError = pairs.some(p => p.result?.is_error)
  const doneCount = pairs.filter(p => !!p.result).length

  const dotColor = anyError ? c.accent.red : allDone ? c.accent.green : c.accent.coral

  return (
    <div className="my-0.5">
      {/* Summary row */}
      <div className="flex items-center gap-1.5 py-1 cursor-pointer select-none group"
        onClick={() => setExpanded(!expanded)}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
        <Wrench size={11} style={{ color: c.text.tertiary }} />
        <span className="text-xs font-medium flex-1 truncate" style={{ color: c.text.secondary }}>
          {summary}
        </span>
        {/* Progress counter */}
        <span className="text-[10px] px-1.5 py-px rounded-full" style={{
          background: allDone ? `${c.accent.green}15` : `${c.accent.coral}15`,
          color: allDone ? c.accent.green : c.accent.coral,
        }}>
          {doneCount}/{pairs.length}
        </span>
        <ChevronRight size={10} className="transition-transform shrink-0 opacity-0 group-hover:opacity-100"
          style={{ color: c.text.tertiary, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }} />
      </div>

      {/* Expanded: show individual cards */}
      {expanded && (
        <div className="pl-2 border-l-2 ml-1" style={{ borderColor: c.border.primary }}>
          {pairs.map((p, i) => <ToolCard key={i} use={p.use} result={p.result} />)}
        </div>
      )}

      {/* Collapsed: show elbow lines */}
      {!expanded && (
        <div className="pl-[22px]">
          {pairs.slice(0, 3).map((p, i) => {
            const act = getToolAction(p.use.tool_name, p.use.arguments)
            const isDone = !!p.result
            const isErr = p.result?.is_error
            return (
              <div key={i} className="flex items-center gap-1 text-[11px] py-px" style={{ color: c.text.tertiary }}>
                <span className="w-1 h-1 rounded-full shrink-0"
                  style={{ background: isErr ? c.accent.red : isDone ? c.accent.green : c.accent.coral }} />
                <span className="truncate">{act}</span>
              </div>
            )
          })}
          {pairs.length > 3 && (
            <div className="text-[10px] py-px" style={{ color: c.text.tertiary }}>
              +{pairs.length - 3} more
            </div>
          )}
        </div>
      )}
    </div>
  )
}
