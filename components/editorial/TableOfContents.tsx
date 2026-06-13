'use client'

import { useState, useEffect } from 'react'
import type { TocEntry } from '@/types/editorial'

interface TableOfContentsProps {
  entries: TocEntry[]
}

export function TableOfContents({ entries }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>('')

  useEffect(() => {
    if (!entries.length) return

    const observer = new IntersectionObserver(
      observed => {
        const first = observed.find(e => e.isIntersecting)
        if (first) setActiveId(first.target.id)
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    )

    entries.forEach(e => {
      const el = document.getElementById(e.id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [entries])

  if (!entries.length) return null

  return (
    <nav
      aria-label="Tabla de contenidos"
      className="sticky top-20 bg-white rounded-xl border border-gray-100 shadow-sm p-4"
    >
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Contenidos
      </p>
      <ol className="space-y-1">
        {entries.map(entry => (
          <li
            key={entry.id}
            style={{ paddingLeft: entry.level === 3 ? '0.75rem' : 0 }}
          >
            <a
              href={`#${entry.id}`}
              className={[
                'block text-sm leading-snug py-0.5 transition-colors',
                activeId === entry.id
                  ? 'text-[#F7A823] font-medium'
                  : 'text-gray-500 hover:text-gray-800',
              ].join(' ')}
            >
              {entry.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
