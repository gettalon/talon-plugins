import React, { useState } from 'react'
import { X, MessageSquare, Plus, Trash2, Clock, CalendarClock, ChevronRight, Filter } from 'lucide-react'
import { darkColors as c } from '@shared/themes'

declare const chrome: any

interface Conversation {
  id: string
  title: string
  updatedAt: number
}

interface TaskGroup {
  name: string
  convs: Conversation[]
  hasNew: boolean
}

function TaskGroupItem({ group, onSelect }: { group: TaskGroup; onSelect: (id: string) => void }) {
  const [expanded, setExpanded] = React.useState(false)
  return (
    <div>
      <div onClick={() => {
          const wasCollapsed = !expanded
          setExpanded(!expanded)
          // Auto-select first (most recent) conversation when expanding
          if (wasCollapsed && group.convs.length > 0) {
            onSelect(group.convs[0].id)
          }
        }}
        className="flex items-center gap-2 px-4 py-2.5 cursor-pointer"
        style={{ borderBottom: `1px solid ${c.border.primary}` }}>
        <CalendarClock size={14} style={{ color: c.accent.amber }} />
        <span className="text-sm font-medium flex-1 truncate" style={{ color: c.text.primary }}>
          {group.name}
        </span>
        <span className="text-[10px] px-1.5 rounded-full min-w-[18px] text-center"
          style={{
            background: group.hasNew ? c.accent.coral : c.bg.tertiary,
            color: group.hasNew ? '#fff' : c.text.tertiary,
            fontWeight: group.hasNew ? 700 : 400,
          }}>
          {group.convs.length}
        </span>
        <ChevronRight size={12}
          style={{
            color: c.text.tertiary,
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 150ms ease',
          }} />
      </div>
      {expanded && group.convs.map(conv => (
        <div key={conv.id} onClick={() => onSelect(conv.id)}
          className="flex items-center gap-2 pl-8 pr-4 py-2 cursor-pointer"
          style={{ borderBottom: `1px solid ${c.border.primary}` }}>
          <Clock size={9} style={{ color: c.text.tertiary }} />
          <span className="text-xs truncate" style={{ color: c.text.secondary }}>
            {formatTime(conv.updatedAt)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [conversations, setConversations] = React.useState<Conversation[]>([])
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  // Load conversation list from RC server
  React.useEffect(() => {
    if (!open) return
    chrome.runtime.sendMessage({ type: 'list_conversations' }, (resp: any) => {
      if (chrome.runtime.lastError) return
      // Handle both formats: { conversations: [...] } or direct [...]
      const convs = resp?.conversations || (Array.isArray(resp) ? resp : [])
      if (convs.length > 0) {
        setConversations(convs.map((c: any) => ({
          id: c.id,
          title: c.title || 'New conversation',
          updatedAt: new Date(c.updated_at || c.updatedAt || Date.now()).getTime(),
        })))
      }
    })
  }, [open])

  // Group task conversations by their task description
  const { taskGroups, regularConvs } = React.useMemo(() => {
    const groups = new Map<string, TaskGroup>()
    const regular: Conversation[] = []

    for (const conv of conversations) {
      const taskMatch = conv.title.match(/^\[Task:\w+\]\s*(.+)/)
      if (taskMatch) {
        const taskName = taskMatch[1].trim()
        if (!groups.has(taskName)) {
          groups.set(taskName, { name: taskName, convs: [], hasNew: false })
        }
        const group = groups.get(taskName)!
        group.convs.push(conv)
        // Mark as "new" if updated within last hour
        if (Date.now() - conv.updatedAt < 3600000) {
          group.hasNew = true
        }
      } else {
        regular.push(conv)
      }
    }

    return { taskGroups: Array.from(groups.values()), regularConvs: regular }
  }, [conversations])

  // Filter conversations — by default show only browser extension ones
  const displayConvs = showAll ? regularConvs : regularConvs.filter(c =>
    c.id?.startsWith('tab-') || c.title?.includes('[browser]') || showAll
  )

  const selectConversation = (id: string) => {
    setActiveId(id)
    chrome.runtime.sendMessage({ type: 'switch_conversation', conversationId: id })
    onClose()
  }

  const newChat = () => {
    chrome.runtime.sendMessage({ type: 'chat_new' })
    setActiveId(null)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={onClose} />
      )}

      {/* Panel */}
      <div className="fixed top-0 left-0 bottom-0 z-50 flex flex-col transition-transform duration-200"
        style={{
          width: '82%',
          maxWidth: 320,
          background: c.bg.secondary,
          borderRight: `1px solid ${c.border.secondary}`,
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
        }}>
        {/* Sidebar header */}
        <div className="flex items-center px-4 py-3" style={{ borderBottom: `1px solid ${c.border.primary}` }}>
          <h2 className="flex-1 text-base font-bold" style={{ color: c.text.primary }}>Conversations</h2>
          <button onClick={() => setShowAll(!showAll)}
            className="w-8 h-8 flex items-center justify-center rounded-lg border-none cursor-pointer mr-1"
            style={{ background: showAll ? `${c.accent.blue}18` : 'transparent', color: showAll ? c.accent.blue : c.text.tertiary }}
            title={showAll ? 'Show browser only' : 'Show all conversations'}>
            <Filter size={14} />
          </button>
          <button onClick={newChat}
            className="w-8 h-8 flex items-center justify-center rounded-lg border-none cursor-pointer mr-1"
            style={{ background: `${c.accent.coral}18`, color: c.accent.coral }}>
            <Plus size={16} />
          </button>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg border-none cursor-pointer"
            style={{ background: 'transparent', color: c.text.secondary }}>
            <X size={16} />
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2" style={{ color: c.text.tertiary }}>
              <MessageSquare size={24} />
              <span className="text-xs">No conversations yet</span>
            </div>
          ) : (
            <>
              {/* Task groups */}
              {taskGroups.map(group => (
                <TaskGroupItem key={group.name} group={group} onSelect={selectConversation} />
              ))}

              {/* Regular conversations */}
              {displayConvs.map(conv => (
                <div key={conv.id}
                  onClick={() => selectConversation(conv.id)}
                  className="flex items-start gap-2.5 px-4 py-3 cursor-pointer transition-colors"
                  style={{
                    background: activeId === conv.id ? c.bg.tertiary : 'transparent',
                    borderBottom: `1px solid ${c.border.primary}`,
                  }}>
                  <MessageSquare size={14} className="mt-0.5 shrink-0" style={{ color: c.text.tertiary }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: c.text.primary }}>
                      {conv.title}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock size={9} style={{ color: c.text.tertiary }} />
                      <span className="text-[10px]" style={{ color: c.text.tertiary }}>
                        {formatTime(conv.updatedAt)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
  return d.toLocaleDateString()
}
