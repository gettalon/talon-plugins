import React from 'react'
import { Clock, X, Lock, Loader2 } from 'lucide-react'
import { darkColors as c } from '@shared/themes'
import { useChatStore } from '../stores/chatStore'

export function MessageQueue() {
  const queue = useChatStore(s => s.messageQueue)
  const dequeue = useChatStore(s => s.dequeueMessage)

  const pending = queue.filter(m => m.status !== 'done')
  if (pending.length === 0) return null

  return (
    <div className="px-3 py-1.5">
      <div className="rounded-xl overflow-hidden" style={{ background: c.bg.secondary, border: `1px solid ${c.border.primary}` }}>
        <div className="flex items-center gap-1.5 px-3 py-1.5"
          style={{ borderBottom: `1px solid ${c.border.primary}` }}>
          <Clock size={11} style={{ color: c.accent.amber }} />
          <span className="text-[11px] font-semibold" style={{ color: c.accent.amber }}>
            {pending.length} message{pending.length > 1 ? 's' : ''} queued
          </span>
        </div>
        {pending.map((msg, i) => (
          <div key={msg.id} className="flex items-center gap-2 px-3 py-1.5"
            style={{ borderBottom: i < pending.length - 1 ? `1px solid ${c.border.primary}` : 'none' }}>
            {msg.status === 'consumed' ? (
              <Lock size={10} style={{ color: c.accent.coral }} />
            ) : (
              <Clock size={10} style={{ color: c.accent.amber }} />
            )}
            <span className="text-xs flex-1 truncate" style={{ color: c.text.secondary }}>{msg.text}</span>
            {msg.status === 'queued' && (
              <button onClick={() => dequeue(msg.id)}
                className="border-none p-0.5 cursor-pointer rounded"
                style={{ background: 'transparent', color: c.text.tertiary }}>
                <X size={10} />
              </button>
            )}
            {msg.status === 'consumed' && (
              <Loader2 size={10} className="animate-spin" style={{ color: c.accent.coral }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
