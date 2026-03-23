import React from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { darkColors as c } from '@shared/themes'
import { useChatStore } from '../stores/chatStore'

export function AgentTaskBar() {
  const tasks = useChatStore(s => s.agentTasks)
  const running = tasks.filter(t => t.status === 'running')

  if (running.length === 0) return null

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t shrink-0 overflow-x-auto"
      style={{ borderColor: c.border.primary, background: `${c.accent.blue}08` }}>
      {running.map(task => (
        <div key={task.taskId} className="flex items-center gap-1 text-[11px] whitespace-nowrap shrink-0 px-2 py-0.5 rounded-full"
          style={{ background: `${c.accent.blue}15`, color: c.accent.blue }}>
          <Loader2 size={10} className="animate-spin" />
          <span>{task.description || task.message || 'Agent task'}</span>
          {task.toolName && <span style={{ color: c.text.tertiary }}>({task.toolName})</span>}
        </div>
      ))}
    </div>
  )
}
