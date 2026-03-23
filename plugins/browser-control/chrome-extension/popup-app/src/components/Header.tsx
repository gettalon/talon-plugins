import React, { useState, useEffect } from 'react'
import { Plus, Square, Menu, X, Check, Lock } from 'lucide-react'
import { darkColors as c } from '@shared/themes'
import { useChatStore } from '../stores/chatStore'

declare const chrome: any

const FALLBACK_MODELS = [
  { name: 'Claude Sonnet', provider: 'Anthropic', id: 'claude-sonnet' },
]

const PERM_MODES = [
  { mode: 'ask', color: '#4A9EF5', label: 'Ask' },
  { mode: 'allow', color: '#34C759', label: 'Allow' },
  { mode: 'plan', color: '#F5A623', label: 'Plan' },
  { mode: 'bypass', color: '#E8654A', label: 'Bypass' },
] as const

export function Header({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const connected = useChatStore(s => s.connected)
  const isStreaming = useChatStore(s => s.isStreaming)
  const costInfo = useChatStore(s => s.costInfo)
  const messages = useChatStore(s => s.messages)
  const selectedModel = useChatStore(s => s.selectedModel)
  const setSelectedModel = useChatStore(s => s.setSelectedModel)
  const selectedProvider = useChatStore(s => s.selectedProvider)
  const setSelectedProvider = useChatStore(s => s.setSelectedProvider)
  const providers = useChatStore(s => s.providers)
  const setProviders = useChatStore(s => s.setProviders)
  const selectedCli = useChatStore(s => s.selectedCli)
  const setSelectedCli = useChatStore(s => s.setSelectedCli)
  const cliAgents = useChatStore(s => s.cliAgents)
  const setCliAgents = useChatStore(s => s.setCliAgents)
  const permissionMode = useChatStore(s => s.permissionMode)
  const setPermissionMode = useChatStore(s => s.setPermissionMode)
  const showConfigSheet = useChatStore(s => s.showConfigSheet)
  const setShowConfigSheet = useChatStore(s => s.setShowConfigSheet)
  const [models, setModels] = useState(FALLBACK_MODELS)

  const hasMessages = messages.length > 0
  const runtimeLocked = hasMessages

  useEffect(() => {
    // Load real models from backend
    try {
      chrome.runtime.sendMessage({ type: 'list_models' }, (resp: any) => {
        if (resp?.models && Array.isArray(resp.models)) {
          const real = resp.models.map((m: any) => ({
            name: m.name || m.id || m.model || 'Unknown',
            provider: m.provider || m.owned_by || 'Unknown',
            id: m.id || m.name,
          }))
          if (real.length > 0) setModels(real)
        }
      })
    } catch {}
    // Load providers from backend
    try {
      chrome.runtime.sendMessage({ type: 'list_providers' }, (resp: any) => {
        if (resp?.providers && Array.isArray(resp.providers)) {
          setProviders(resp.providers)
        }
      })
    } catch {}
    // Load CLI agents from backend
    try {
      chrome.runtime.sendMessage({ type: 'detect_cli_agents' }, (resp: any) => {
        if (Array.isArray(resp) && resp.length > 0) {
          setCliAgents(resp)
        }
      })
    } catch {}
    // Restore last used provider and CLI runtime from storage
    try {
      chrome.storage?.local?.get(['last_provider', 'last_cli_runtime'], (stored: any) => {
        if (stored?.last_provider !== undefined) {
          setSelectedProvider(stored.last_provider)
        }
        if (stored?.last_cli_runtime) {
          setSelectedCli(stored.last_cli_runtime)
        }
      })
    } catch {}
  }, [connected])

  const newChat = () => {
    chrome.runtime.sendMessage({ type: 'chat_new' }, () => {
      const s = useChatStore.getState()
      s.clearMessages(); s.clearPermissions(); s.clearSuggestions()
      s.setCostInfo(null); s.setStatusMsg(null); s.setIsStreaming(false)
      s.setConversationId(null); s.clearAgentTasks()
    })
  }

  const stopAgent = () => {
    chrome.runtime.sendMessage({ type: 'chat_stop' })
  }

  const selectModel = (model: { name: string; provider: string; id: string }) => {
    setSelectedModel(model.name)
    try { chrome.runtime.sendMessage({ type: 'set_model', model: model.id || model.name }) } catch {}
  }

  const selectProvider = (providerId: string | null) => {
    setSelectedProvider(providerId)
    try { chrome.runtime.sendMessage({ type: 'set_provider', provider: providerId }) } catch {}
  }

  const selectCli = (cliId: string) => {
    if (runtimeLocked) return
    setSelectedCli(cliId)
    try { chrome.runtime.sendMessage({ type: 'set_cli_runtime', runtime: cliId }) } catch {}
  }

  // Short model name for the pill
  const modelShort = selectedModel.split(' ').pop() || selectedModel

  // Build config pill label
  const cliLabel = selectedCli || 'claude'
  const costLabel = costInfo && costInfo.cost > 0 ? ` · $${costInfo.cost.toFixed(2)}` : ''
  const configPillText = `${cliLabel} · ${modelShort}${costLabel}`

  const installedAgents = cliAgents.filter(a => a.installed)

  return (
    <>
      <div className="flex items-center px-3 py-2 shrink-0"
        style={{ borderBottom: `1px solid ${c.border.primary}` }}>
        {/* Menu */}
        <button onClick={onToggleSidebar}
          className="w-10 h-10 flex items-center justify-center rounded-lg border-none cursor-pointer"
          style={{ background: 'transparent', color: c.text.primary }}>
          <Menu size={22} />
        </button>

        {/* Title */}
        <div className="px-2 min-w-0">
          <div className="text-base font-bold truncate" style={{ color: c.text.primary }}>
            Talon
          </div>
          {/* Transport indicator */}
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: connected ? c.accent.green : c.accent.red }} />
            <span className="text-[10px]" style={{ color: connected ? c.accent.green : c.accent.red }}>
              {connected ? 'Connected' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Unified config pill */}
        <button onClick={() => setShowConfigSheet(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full cursor-pointer shrink-0 border-none"
          style={{ background: c.bg.tertiary, border: `1px solid ${c.border.secondary}` }}>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.accent.green }} />
          <span className="text-[11px] font-semibold truncate" style={{ color: c.text.primary, maxWidth: 160 }}>
            {configPillText}
          </span>
        </button>

        {/* Stop */}
        {isStreaming && (
          <button onClick={stopAgent} title="Stop"
            className="w-10 h-10 flex items-center justify-center rounded-lg border-none cursor-pointer ml-1"
            style={{ background: `${c.accent.red}18`, color: c.accent.red }}>
            <Square size={14} fill="currentColor" />
          </button>
        )}

        {/* New chat */}
        <button onClick={newChat} title="New chat"
          className="w-10 h-10 flex items-center justify-center rounded-lg border-none cursor-pointer"
          style={{ background: 'transparent', color: c.text.primary }}>
          <Plus size={22} />
        </button>
      </div>

      {/* Unified config sheet */}
      {showConfigSheet && (
        <>
          <div className="fixed inset-0 z-[80]" style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setShowConfigSheet(false)} />
          <div className="fixed inset-x-0 bottom-0 z-[90] rounded-t-2xl overflow-hidden"
            style={{ background: c.bg.secondary, maxHeight: '75vh' }}>
            {/* Sheet header */}
            <div className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: `1px solid ${c.border.primary}` }}>
              <h3 className="text-sm font-bold" style={{ color: c.text.primary }}>Configuration</h3>
              <button onClick={() => setShowConfigSheet(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full border-none cursor-pointer"
                style={{ background: c.bg.tertiary, color: c.text.secondary }}>
                <X size={14} />
              </button>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: 'calc(75vh - 50px)' }}>
              {/* ── RUNTIME ── */}
              <div className="px-4 pt-3 pb-1.5">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: c.text.tertiary }}>
                    Runtime
                  </span>
                  {runtimeLocked && (
                    <Lock size={9} style={{ color: c.text.tertiary }} />
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5" style={{ opacity: runtimeLocked ? 0.5 : 1 }}>
                  {installedAgents.length > 0 ? installedAgents.map(agent => (
                    <button key={agent.id}
                      onClick={() => selectCli(agent.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-none cursor-pointer text-xs font-medium"
                      style={{
                        background: selectedCli === agent.id ? `${c.accent.coral}20` : c.bg.tertiary,
                        color: selectedCli === agent.id ? c.accent.coral : c.text.secondary,
                        border: `1px solid ${selectedCli === agent.id ? c.accent.coral : c.border.primary}`,
                        cursor: runtimeLocked ? 'default' : 'pointer',
                      }}>
                      {selectedCli === agent.id && <Check size={10} />}
                      {agent.name}
                    </button>
                  )) : (
                    <span className="text-[11px]" style={{ color: c.text.tertiary }}>
                      No CLI agents detected
                    </span>
                  )}
                </div>
                {runtimeLocked && (
                  <div className="text-[10px] mt-1.5" style={{ color: c.text.tertiary }}>
                    Locked — start a new chat to change runtime
                  </div>
                )}
              </div>

              {/* ── MODEL ── */}
              <div className="px-4 pt-3 pb-1.5" style={{ borderTop: `1px solid ${c.border.primary}` }}>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: c.text.tertiary }}>
                  Model
                </span>
              </div>
              <div className="pb-1">
                {models.map(m => (
                  <button key={m.id || m.name} onClick={() => selectModel(m)}
                    className="flex items-center w-full px-4 py-2.5 border-none cursor-pointer text-left"
                    style={{
                      background: selectedModel === m.name ? `${c.accent.coral}12` : 'transparent',
                    }}
                    onMouseEnter={e => { if (selectedModel !== m.name) e.currentTarget.style.background = c.bg.tertiary }}
                    onMouseLeave={e => { if (selectedModel !== m.name) e.currentTarget.style.background = 'transparent' }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium" style={{ color: c.text.primary }}>{m.name}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: c.text.tertiary }}>{m.provider}</div>
                    </div>
                    {selectedModel === m.name && (
                      <Check size={14} style={{ color: c.accent.coral, flexShrink: 0 }} />
                    )}
                  </button>
                ))}
              </div>

              {/* ── PROVIDER ── */}
              <div className="px-4 pt-3 pb-1.5" style={{ borderTop: `1px solid ${c.border.primary}` }}>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: c.text.tertiary }}>
                  Provider
                </span>
              </div>
              <div className="pb-1">
                {/* Default option */}
                <button onClick={() => selectProvider(null)}
                  className="flex items-center w-full px-4 py-2.5 border-none cursor-pointer text-left"
                  style={{
                    background: selectedProvider === null ? `${c.accent.amber}18` : 'transparent',
                  }}
                  onMouseEnter={e => { if (selectedProvider !== null) e.currentTarget.style.background = c.bg.tertiary }}
                  onMouseLeave={e => { if (selectedProvider !== null) e.currentTarget.style.background = 'transparent' }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium" style={{ color: c.text.primary }}>Default</div>
                    <div className="text-[10px] mt-0.5" style={{ color: c.text.tertiary }}>
                      Use CLI's built-in credentials
                    </div>
                  </div>
                  {selectedProvider === null && (
                    <Check size={14} style={{ color: c.accent.amber, flexShrink: 0 }} />
                  )}
                </button>
                {/* Configured providers */}
                {providers.map(p => (
                  <button key={p.id} onClick={() => selectProvider(p.id)}
                    className="flex items-center w-full px-4 py-2.5 border-none cursor-pointer text-left"
                    style={{
                      background: selectedProvider === p.id ? `${c.accent.amber}18` : 'transparent',
                    }}
                    onMouseEnter={e => { if (selectedProvider !== p.id) e.currentTarget.style.background = c.bg.tertiary }}
                    onMouseLeave={e => { if (selectedProvider !== p.id) e.currentTarget.style.background = 'transparent' }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium" style={{ color: c.text.primary }}>{p.name}</div>
                      {p.base_url && (
                        <div className="text-[10px] mt-0.5 truncate max-w-[200px]" style={{ color: c.text.tertiary }}>
                          {p.base_url}
                        </div>
                      )}
                    </div>
                    {selectedProvider === p.id && (
                      <Check size={14} style={{ color: c.accent.amber, flexShrink: 0 }} />
                    )}
                  </button>
                ))}
                {providers.length === 0 && (
                  <div className="px-4 py-3 text-center">
                    <div className="text-[11px]" style={{ color: c.text.tertiary }}>
                      No additional providers configured
                    </div>
                  </div>
                )}
              </div>

              {/* ── PERMISSIONS ── */}
              <div className="px-4 pt-3 pb-1.5" style={{ borderTop: `1px solid ${c.border.primary}` }}>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: c.text.tertiary }}>
                  Permissions
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 px-4 pb-4">
                {PERM_MODES.map(pm => (
                  <button key={pm.mode}
                    onClick={() => {
                      setPermissionMode(pm.mode)
                      try { chrome.runtime.sendMessage({ type: 'set_permission_mode', mode: pm.mode }) } catch {}
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-none cursor-pointer text-xs font-medium"
                    style={{
                      background: permissionMode === pm.mode ? `${pm.color}20` : c.bg.tertiary,
                      color: permissionMode === pm.mode ? pm.color : c.text.secondary,
                      border: `1px solid ${permissionMode === pm.mode ? pm.color : c.border.primary}`,
                    }}>
                    {permissionMode === pm.mode && <Check size={10} />}
                    {pm.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
