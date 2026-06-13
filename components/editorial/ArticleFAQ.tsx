import { FAQAccordion } from '@/components/category/FAQAccordion'
import type { FAQItem } from '@/types'

interface ArticleFAQProps {
  faqs: FAQItem[]
}

/**
 * Thin wrapper over FAQAccordion for use in editorial (MDX) templates.
 * Returns null when the faqs array is empty — safe to render unconditionally.
 */
export function ArticleFAQ({ faqs }: ArticleFAQProps) {
  if (!faqs.length) return null
  return <FAQAccordion faqs={faqs} />
}
