import React from 'react'
import { Shield, Check, X } from 'lucide-react'
import { darkColors as c } from '@shared/themes'
import { useChatStore, type PermissionRequest } from '../stores/chatStore'
import { getToolAction } from './ToolCard'

declare const chrome: any

export function PermissionCard({ perm }: { perm: PermissionRequest }) {
  const removePermission = useChatStore(s => s.removePermission)
  const action = getToolAction(perm.toolName, perm.args)

  const respond = (allowed: boolean) => {
    // Remove from UI immediately
    removePermission(perm.requestId)
    // Forward to background.js → RC server
    chrome.runtime.sendMessage(
      { type: 'permission_response', requestId: perm.requestId, allowed },
      (resp: any) => {
        if (chrome.runtime.lastError) {
          console.warn('[PermissionCard] Failed to send response:', chrome.runtime.lastError)
        }
      }
    )
  }

  return (
    <div className="rounded-xl p-3"
      style={{ background: c.bg.secondary, border: `1px solid ${c.accent.coral}` }}>
      <div className="flex items-center gap-1.5 font-semibold text-xs mb-2" style={{ color: c.accent.coral }}>
        <Shield size={12} />
        Permission Required
      </div>

      <div className="text-xs font-medium mb-1.5" style={{ color: c.text.primary }}>{action}</div>

      <div className="font-mono text-[11px] mb-3 whitespace-pre-wrap max-h-[120px] overflow-y-auto rounded-lg p-2"
        style={{ color: c.text.secondary, background: c.bg.primary, border: `1px solid ${c.border.primary}` }}>
        {perm.args}
      </div>

      <div className="flex gap-2">
        <button onClick={() => respond(true)}
          className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold cursor-pointer border-none transition-opacity hover:opacity-85"
          style={{ background: c.accent.green, color: c.bg.primary }}>
          <Check size={12} /> Allow
        </button>
        <button onClick={() => respond(false)}
          className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold cursor-pointer border-none transition-opacity hover:opacity-85"
          style={{ background: c.accent.red, color: '#fff' }}>
          <X size={12} /> Deny
        </button>
      </div>
    </div>
  )
}
