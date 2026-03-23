import React from 'react'
import { Lightbulb, Globe, Camera, Terminal, Zap, X } from 'lucide-react'
import { darkColors as c } from '@shared/themes'

const TIPS = [
  { icon: <Globe size={16} />, title: 'Browse the web', desc: 'Ask about the current page or search the web' },
  { icon: <Camera size={16} />, title: 'Take a screenshot', desc: 'Capture the page and ask questions about it' },
  { icon: <Terminal size={16} />, title: 'Run commands', desc: 'Execute shell commands on your machine' },
  { icon: <Zap size={16} />, title: 'Browser automation', desc: 'Click, type, navigate — control the browser' },
]

export function TipCards({ onTipClick }: { onTipClick?: (text: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 px-4 py-2">
      {TIPS.map((tip, i) => (
        <button key={i}
          onClick={() => onTipClick?.(tip.title)}
          className="flex flex-col items-start gap-1.5 p-3 rounded-xl border-none cursor-pointer text-left transition-colors"
          style={{ background: c.bg.secondary, border: `1px solid ${c.border.primary}` }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = c.border.secondary)}
          onMouseLeave={e => (e.currentTarget.style.borderColor = c.border.primary)}>
          <span style={{ color: c.accent.coral }}>{tip.icon}</span>
          <span className="text-xs font-semibold" style={{ color: c.text.primary }}>{tip.title}</span>
          <span className="text-[10px] leading-tight" style={{ color: c.text.tertiary }}>{tip.desc}</span>
        </button>
      ))}
    </div>
  )
}
