import { ChevronDown } from 'lucide-react'
import type { FAQItem } from '@/types'

interface FAQAccordionProps {
  faqs: FAQItem[]
}

function Paragraph({ text }: { text: string }) {
  const paragraphs = text.split(/\n\n+/).filter(Boolean)
  return (
    <div className="space-y-3">
      {paragraphs.map((para, i) => (
        <p key={i} className="text-gray-300 text-sm leading-relaxed">
          {para}
        </p>
      ))}
    </div>
  )
}

/**
 * FAQ accordion using native <details>/<summary> — zero JavaScript, accessible,
 * works without hydration. The `group` Tailwind modifier animates the chevron
 * icon via CSS `group-open:rotate-180`.
 *
 * Multiple items can be open simultaneously (native details behaviour).
 * To make it mutually exclusive, a JS-controlled approach would be needed.
 */
export function FAQAccordion({ faqs }: FAQAccordionProps) {
  if (faqs.length === 0) return null

  return (
    <section
      aria-label="Preguntas frecuentes"
      className="rounded-2xl overflow-hidden border border-white/10 bg-[#1a1f2e]"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/10">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span aria-hidden="true">❓</span>
          Preguntas frecuentes
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Clic en cada pregunta para ver la respuesta
        </p>
      </div>

      {/* FAQ items */}
      <div className="divide-y divide-white/8">
        {faqs.map((faq, i) => (
          <details key={i} className="group">
            <summary
              className={[
                'flex items-center justify-between gap-4',
                'px-6 py-4 cursor-pointer select-none list-none',
                'hover:bg-white/4 transition-colors duration-150',
                // Remove default browser marker
                '[&::-webkit-details-marker]:hidden',
              ].join(' ')}
            >
              <span className="text-sm font-medium text-gray-200 leading-snug">
                {faq.question}
              </span>
              <ChevronDown
                className="h-4 w-4 text-gray-500 flex-shrink-0 transition-transform duration-200 group-open:rotate-180 group-open:text-amber-400"
                aria-hidden="true"
              />
            </summary>

            {/* Answer */}
            <div className="px-6 pb-5">
              <Paragraph text={faq.answer} />
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}
