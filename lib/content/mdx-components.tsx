/**
 * Custom MDX components for GOODPRICE editorial content.
 *
 * Headings receive an `id` derived from slugifyHeading() so that
 * TableOfContents anchor links resolve correctly.
 *
 * Pass to MDXRemote: <MDXRemote source={content} components={mdxComponents} />
 */

import type { MDXComponents } from 'mdx/types'
import { slugifyHeading } from '@/lib/content'

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (node !== null && typeof node === 'object' && 'props' in node) {
    return extractText((node as React.ReactElement<{ children?: React.ReactNode }>).props.children)
  }
  return ''
}

function makeHeading(Tag: 'h2' | 'h3' | 'h4') {
  return function Heading({
    children,
    ...props
  }: React.HTMLAttributes<HTMLHeadingElement>) {
    const id = slugifyHeading(extractText(children))
    const cls =
      Tag === 'h2'
        ? 'text-xl font-bold text-gray-900 mt-8 mb-3 scroll-mt-24'
        : Tag === 'h3'
          ? 'text-base font-semibold text-gray-800 mt-6 mb-2 scroll-mt-24'
          : 'text-sm font-semibold text-gray-700 mt-4 mb-1 scroll-mt-24'
    return (
      <Tag id={id} className={cls} {...props}>
        {children}
      </Tag>
    )
  }
}

export const mdxComponents: MDXComponents = {
  h2: makeHeading('h2'),
  h3: makeHeading('h3'),
  h4: makeHeading('h4'),

  p: ({ children, ...props }) => (
    <p className="text-[15px] text-gray-700 leading-relaxed mb-4 last:mb-0" {...props}>
      {children}
    </p>
  ),

  ul: ({ children, ...props }) => (
    <ul className="list-disc list-outside pl-5 space-y-1.5 mb-4 text-[15px] text-gray-700" {...props}>
      {children}
    </ul>
  ),

  ol: ({ children, ...props }) => (
    <ol className="list-decimal list-outside pl-5 space-y-1.5 mb-4 text-[15px] text-gray-700" {...props}>
      {children}
    </ol>
  ),

  li: ({ children, ...props }) => (
    <li className="leading-relaxed" {...props}>
      {children}
    </li>
  ),

  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-gray-900" {...props}>
      {children}
    </strong>
  ),

  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-4 border-[#F7A823] bg-amber-50 rounded-r-xl px-4 py-3 my-4 text-sm text-amber-900 leading-relaxed"
      {...props}
    >
      {children}
    </blockquote>
  ),

  hr: () => <hr className="my-8 border-gray-100" />,

  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-4">
      <table className="w-full text-sm border-collapse" {...props}>
        {children}
      </table>
    </div>
  ),

  th: ({ children, ...props }) => (
    <th
      className="text-left px-3 py-2 bg-gray-50 border border-gray-200 font-semibold text-gray-700 text-xs uppercase tracking-wide"
      {...props}
    >
      {children}
    </th>
  ),

  td: ({ children, ...props }) => (
    <td className="px-3 py-2 border border-gray-200 text-gray-700" {...props}>
      {children}
    </td>
  ),

  code: ({ children, ...props }) => (
    <code
      className="bg-gray-100 text-gray-800 text-[13px] px-1.5 py-0.5 rounded font-mono"
      {...props}
    >
      {children}
    </code>
  ),
}
