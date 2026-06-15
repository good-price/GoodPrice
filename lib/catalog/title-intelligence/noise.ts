const NOISE_PHRASES: string[] = [
  'pack of 1', 'pack of 2', 'pack of 3', 'pack of 4',
  'official product', 'official brand',
  'latest version', 'latest model', 'new version',
  "amazon's choice", 'amazon choice',
  'best seller', '#1 best seller',
  'for men and women', 'for men & women', 'for him and her',
  'for women and men', 'for women & men',
  'eligible for instant ink',
  'packaging may vary', 'package may vary',
  'and more', 'and much more',
  'and others', 'and other accessories',
  'buy more save more',
  'made in the usa', 'made in usa',
]

const NOISE_PATTERNS: RegExp[] = [
  // Trailing pipe segment that looks like SKU / short code
  /\s*\|\s*[A-Z0-9]{5,12}\s*$/,
  // Trailing parenthetical disclaimer
  /\s*\([^)]{0,60}(may vary|packaging|disclaimer|note)[^)]*\)\s*$/i,
  // "Works with Printer Series: ..." compatibility clauses after pipe
  /\s*\|\s*Works with[^|]*/gi,
]

export function removeNoise(title: string): string {
  let t = title

  // Strip literal phrases (case-insensitive, with surrounding punctuation)
  for (const phrase of NOISE_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    t = t.replace(new RegExp(`[,|]?\\s*${escaped}\\s*[,|]?`, 'gi'), ' ')
  }

  // Strip regex patterns
  for (const pattern of NOISE_PATTERNS) {
    t = t.replace(pattern, '')
  }

  // Collapse multiple spaces / trailing commas / pipes
  t = t.replace(/\s*[|,]\s*$/, '').replace(/\s{2,}/g, ' ').trim()

  return t
}
