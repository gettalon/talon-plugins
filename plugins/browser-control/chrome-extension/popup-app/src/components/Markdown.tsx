import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust'
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown'
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml'
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql'
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx'
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx'

SyntaxHighlighter.registerLanguage('typescript', typescript)
SyntaxHighlighter.registerLanguage('ts', typescript)
SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('js', javascript)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('py', python)
SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('sh', bash)
SyntaxHighlighter.registerLanguage('shell', bash)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('rust', rust)
SyntaxHighlighter.registerLanguage('rs', rust)
SyntaxHighlighter.registerLanguage('markdown', markdown)
SyntaxHighlighter.registerLanguage('md', markdown)
SyntaxHighlighter.registerLanguage('yaml', yaml)
SyntaxHighlighter.registerLanguage('yml', yaml)
SyntaxHighlighter.registerLanguage('sql', sql)
SyntaxHighlighter.registerLanguage('jsx', jsx)
SyntaxHighlighter.registerLanguage('tsx', tsx)
import { Copy, Check } from 'lucide-react'
import { darkColors as c } from '@shared/themes'

export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown text-[13px] leading-relaxed
      [&_p]:my-1 first:[&_p]:mt-0 last:[&_p]:mb-0
      [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:pl-5 [&_ol]:my-1
      [&_li]:my-0.5
      [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-3 [&_h1]:mb-1
      [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1
      [&_h3]:text-[13px] [&_h3]:font-bold [&_h3]:mt-2 [&_h3]:mb-1
      [&_hr]:border-t [&_hr]:my-2
      [&_img]:max-w-full [&_img]:rounded-lg
    ">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock as any,
          pre: ({ children }) => <>{children}</>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener"
              className="no-underline hover:underline" style={{ color: c.accent.blue }}>
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="pl-3 my-1" style={{ borderLeft: `3px solid ${c.border.secondary}`, color: c.text.secondary }}>
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-1.5">
              <table className="border-collapse text-xs w-full" style={{ border: `1px solid ${c.border.secondary}` }}>
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="px-2 py-1 text-left font-semibold" style={{ background: c.bg.tertiary, border: `1px solid ${c.border.secondary}` }}>
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-2 py-1" style={{ border: `1px solid ${c.border.secondary}` }}>
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function CodeBlock({ children, className, ...props }: any) {
  const match = /language-(\w+)/.exec(className || '')
  const lang = match?.[1]
  const code = String(children).replace(/\n$/, '')

  if (!lang) {
    // Inline code
    return (
      <code className="px-1 py-0.5 rounded text-xs font-mono" style={{ background: c.bg.primary }}>
        {children}
      </code>
    )
  }

  return <CodeBlockWithCopy code={code} language={lang} />
}

function CodeBlockWithCopy({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative my-1.5 rounded-lg overflow-hidden" style={{ border: `1px solid ${c.border.primary}` }}>
      <div className="flex items-center justify-between px-3 py-1" style={{ background: c.bg.tertiary }}>
        <span className="text-[10px] uppercase tracking-wider" style={{ color: c.text.tertiary }}>{language}</span>
        <button onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded cursor-pointer border-none transition-colors"
          style={{ background: 'transparent', color: c.text.secondary }}>
          {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{ margin: 0, padding: '10px 12px', fontSize: '12px', background: c.bg.primary, borderRadius: 0 }}
        codeTagProps={{ style: { fontFamily: "'SF Mono', Menlo, Consolas, monospace" } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
