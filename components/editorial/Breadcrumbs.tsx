import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="breadcrumb"
      className="flex items-center gap-1 text-xs text-gray-400 mb-6 flex-wrap"
    >
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && (
            <ChevronRight className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          )}
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-[#F7A823] transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-600 font-medium truncate max-w-[220px]">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}
