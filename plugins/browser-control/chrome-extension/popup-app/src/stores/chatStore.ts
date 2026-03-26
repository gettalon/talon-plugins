import { create } from 'zustand'
import type { ContentBlock } from '@shared/types'

export interface DisplayMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  blocks: ContentBlock[]
  isStreaming?: boolean
  pending?: boolean
  timestamp: number
}

export interface PermissionRequest {
  requestId: string
  toolName: string
  args: string
}

export interface AgentTask {
  taskId: string
  description?: string
  status: 'running' | 'done' | 'error'
  message?: string
  elapsed?: number
  toolName?: string
}

export interface QueuedMessage {
  id: string
  text: string
  status: 'queued' | 'consumed' | 'done'
  timestamp: number
}

export interface SubagentProgressEntry {
  type: 'tool_start' | 'tool_result' | 'text' | 'status'
  toolName?: string
  text?: string
  isError?: boolean
  timestamp: number
}

export interface HookEvent {
  hookEventName: string
  data: Record<string, unknown>
  receivedAt: number
}

export type ClientMode = 'chat' | 'monitor' | 'full' | 'custom'

interface ChatState {
  messages: DisplayMessage[]
  permissions: PermissionRequest[]
  input: string
  isStreaming: boolean
  connected: boolean
  pageContext: any | null
  pageInfo: { url: string; title: string; favicon?: string } | null
  statusMsg: string | null
  suggestions: string[]
  costInfo: { cost: number; inTok: number; outTok: number } | null
  thinkingText: string
  isThinking: boolean
  conversationId: string | null
  agentTasks: AgentTask[]
  messageQueue: QueuedMessage[]
  expandedBlocks: Set<string>
  streamTick: number
  detailBlock: { title: string; toolName?: string; arguments?: string; output?: string; is_error?: boolean } | null
  permissionMode: string
  folder: string
  contextUsage: number
  selectedModel: string
  selectedProvider: string | null
  providers: Array<{ id: string; name: string; base_url?: string }>
  selectedCli: string
  cliAgents: Array<{ id: string; name: string; installed: boolean }>
  /** Live progress entries per subagent, keyed by call_id */
  subagentProgress: Record<string, SubagentProgressEntry[]>
  showConfigSheet: boolean
  /** Channel SDK hook events */
  hookEvents: HookEvent[]
  /** Channel SDK client mode */
  clientMode: ClientMode
  allowsChat: boolean
  allowsPermissions: boolean

  // Actions
  addMessage: (msg: DisplayMessage) => void
  setMessages: (msgs: DisplayMessage[]) => void
  clearMessages: () => void
  deleteMessage: (id: string) => void
  addPermission: (perm: PermissionRequest) => void
  removePermission: (requestId: string) => void
  clearPermissions: () => void
  setInput: (input: string) => void
  setIsStreaming: (v: boolean) => void
  setConnected: (v: boolean) => void
  setPageContext: (ctx: any | null) => void
  setPageInfo: (info: { url: string; title: string; favicon?: string } | null) => void
  setStatusMsg: (msg: string | null) => void
  addSuggestion: (s: string) => void
  clearSuggestions: () => void
  setCostInfo: (info: { cost: number; inTok: number; outTok: number } | null) => void
  setThinkingText: (t: string) => void
  setIsThinking: (v: boolean) => void
  setConversationId: (id: string | null) => void
  updateAgentTask: (task: AgentTask) => void
  clearAgentTasks: () => void
  enqueueMessage: (text: string) => void
  dequeueMessage: (id: string) => void
  markConsumed: (id: string) => void
  markDone: (id: string) => void
  consumeNext: () => QueuedMessage | null
  toggleExpandBlock: (id: string) => void
  incrementStreamTick: () => void
  setDetailBlock: (block: ChatState['detailBlock']) => void
  setPermissionMode: (mode: string) => void
  setFolder: (folder: string) => void
  setContextUsage: (pct: number) => void
  setSelectedModel: (model: string) => void
  setSelectedProvider: (provider: string | null) => void
  setProviders: (providers: Array<{ id: string; name: string; base_url?: string }>) => void
  setSelectedCli: (cli: string) => void
  setCliAgents: (agents: Array<{ id: string; name: string; installed: boolean }>) => void
  addSubagentProgress: (callId: string, entry: SubagentProgressEntry) => void
  clearSubagentProgress: (callId: string) => void
  setShowConfigSheet: (v: boolean) => void
  addHookEvent: (event: HookEvent) => void
  clearHookEvents: () => void
  setClientMode: (mode: ClientMode) => void
  setAllowsChat: (v: boolean) => void
  setAllowsPermissions: (v: boolean) => void
  reset: () => void
}

const initialState = {
  messages: [] as DisplayMessage[],
  permissions: [] as PermissionRequest[],
  input: '',
  isStreaming: false,
  connected: false,
  pageContext: null,
  pageInfo: null as { url: string; title: string; favicon?: string } | null,
  statusMsg: null as string | null,
  suggestions: [] as string[],
  costInfo: null as { cost: number; inTok: number; outTok: number } | null,
  thinkingText: '',
  isThinking: false,
  conversationId: null as string | null,
  agentTasks: [] as AgentTask[],
  messageQueue: [] as QueuedMessage[],
  expandedBlocks: new Set<string>(),
  streamTick: 0,
  detailBlock: null as ChatState['detailBlock'],
  permissionMode: 'ask',
  folder: '~/',
  contextUsage: 0,
  selectedModel: 'Claude Sonnet',
  selectedProvider: null as string | null,
  providers: [] as Array<{ id: string; name: string; base_url?: string }>,
  selectedCli: 'claude',
  cliAgents: [] as Array<{ id: string; name: string; installed: boolean }>,
  subagentProgress: {} as Record<string, SubagentProgressEntry[]>,
  showConfigSheet: false,
  hookEvents: [] as HookEvent[],
  clientMode: 'full' as ClientMode,
  allowsChat: true,
  allowsPermissions: true,
}

export const useChatStore = create<ChatState>((set) => ({
  ...initialState,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setMessages: (msgs) => set({ messages: msgs }),
  clearMessages: () => set({ messages: [], agentTasks: [], suggestions: [], costInfo: null }),
  deleteMessage: (id) => set((s) => ({ messages: s.messages.filter(m => m.id !== id) })),
  addPermission: (perm) => set((s) => ({ permissions: [...s.permissions, perm] })),
  removePermission: (requestId) => set((s) => ({ permissions: s.permissions.filter(p => p.requestId !== requestId) })),
  clearPermissions: () => set({ permissions: [] }),
  setInput: (input) => set({ input }),
  setIsStreaming: (v) => set({ isStreaming: v }),
  setConnected: (v) => set({ connected: v }),
  setPageContext: (ctx) => set({ pageContext: ctx }),
  setPageInfo: (info) => set({ pageInfo: info }),
  setStatusMsg: (msg) => set({ statusMsg: msg }),
  addSuggestion: (s) => set((state) => ({ suggestions: [...state.suggestions, s] })),
  clearSuggestions: () => set({ suggestions: [] }),
  setCostInfo: (info) => set({ costInfo: info }),
  setThinkingText: (t) => set({ thinkingText: t }),
  setIsThinking: (v) => set({ isThinking: v }),
  setConversationId: (id) => set({ conversationId: id }),
  updateAgentTask: (task) => set((s) => {
    const existing = s.agentTasks.findIndex(t => t.taskId === task.taskId)
    if (existing >= 0) {
      const updated = [...s.agentTasks]
      updated[existing] = { ...updated[existing], ...task }
      return { agentTasks: updated }
    }
    return { agentTasks: [...s.agentTasks, task] }
  }),
  clearAgentTasks: () => set({ agentTasks: [] }),
  enqueueMessage: (text) => set((s) => ({
    messageQueue: [...s.messageQueue, { id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, status: 'queued' as const, timestamp: Date.now() }],
  })),
  dequeueMessage: (id) => set((s) => ({
    messageQueue: s.messageQueue.filter(m => !(m.id === id && m.status === 'queued')),
  })),
  markConsumed: (id) => set((s) => ({
    messageQueue: s.messageQueue.map(m => m.id === id ? { ...m, status: 'consumed' as const } : m),
  })),
  markDone: (id) => set((s) => ({
    messageQueue: s.messageQueue.filter(m => m.id !== id),
  })),
  consumeNext: () => {
    const state = useChatStore.getState()
    const next = state.messageQueue.find(m => m.status === 'queued')
    if (next) {
      state.markConsumed(next.id)
      return next
    }
    return null
  },
  toggleExpandBlock: (id) => set((s) => {
    const next = new Set(s.expandedBlocks)
    if (next.has(id)) next.delete(id); else next.add(id)
    return { expandedBlocks: next }
  }),
  incrementStreamTick: () => set((s) => ({ streamTick: s.streamTick + 1 })),
  setDetailBlock: (block) => set({ detailBlock: block }),
  setPermissionMode: (mode) => set({ permissionMode: mode }),
  setFolder: (folder) => set({ folder }),
  setContextUsage: (pct) => set({ contextUsage: pct }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  setSelectedProvider: (provider) => set({ selectedProvider: provider }),
  setProviders: (providers) => set({ providers }),
  setSelectedCli: (cli) => set({ selectedCli: cli }),
  setCliAgents: (agents) => set({ cliAgents: agents }),
  addSubagentProgress: (callId, entry) => set((s) => ({
    subagentProgress: {
      ...s.subagentProgress,
      [callId]: [...(s.subagentProgress[callId] || []), entry],
    },
  })),
  clearSubagentProgress: (callId) => set((s) => {
    const next = { ...s.subagentProgress }
    delete next[callId]
    return { subagentProgress: next }
  }),
  setShowConfigSheet: (v) => set({ showConfigSheet: v }),
  addHookEvent: (event) => set((s) => ({
    hookEvents: [event, ...s.hookEvents].slice(0, 100),
  })),
  clearHookEvents: () => set({ hookEvents: [] }),
  setClientMode: (mode) => set({ clientMode: mode }),
  setAllowsChat: (v) => set({ allowsChat: v }),
  setAllowsPermissions: (v) => set({ allowsPermissions: v }),
  reset: () => set(initialState),
}))
