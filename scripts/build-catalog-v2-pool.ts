/**
 * scripts/build-catalog-v2-pool.ts
 *
 * CATALOG V2 — FASE 0: Certified Pool Builder
 *
 * Scrapes 10 Amazon Best Sellers categories × 2 pages each, validates every
 * candidate through the 9-gate validator at V2 thresholds, applies functional
 * deduplication, and writes data/catalog-v2-pool.json.
 *
 * CONSTRAINTS (enforced):
 *   - Does NOT modify the existing catalog (.ts category files).
 *   - Does NOT promote any product.
 *   - Does NOT create commits.
 *
 * Usage:
 *   npx tsx scripts/build-catalog-v2-pool.ts              (full run)
 *   npx tsx scripts/build-catalog-v2-pool.ts --dry-run    (discovery only, skips validation)
 */

import fs   from 'fs'
import path from 'path'

import { fetchBestSellersPage }  from '@/lib/catalog/discovery/best-sellers-scraper'
import { validateCandidate }     from '@/lib/catalog/candidate/validator'
import type { BestSellerTile }   from '@/lib/catalog/discovery/types'

// ── V2 Thresholds ─────────────────────────────────────────────────────────────

const V2 = {
  MIN_RATING:           4.4,
  MIN_REVIEWS:          5_000,
  MIN_PRICE:            20,
  MAX_PRICE:            300,
  MAX_PER_SUBFAMILY:    2,
  VALIDATION_DELAY_MS:  2_200,
  INTER_PAGE_DELAY_MS:  2_800,
  INTER_CAT_DELAY_MS:   5_500,
} as const

// ── Category → Amazon URL map (V2 definition — 10 categories × 2 pages) ───────
// Note: uses /bestsellers/home for hogar (smart-home/home products) and
// /bestsellers/kitchen for cocina — fixing the historical scraper mapping.

const V2_CATEGORIES = [
  { category: 'electronica',  page1: 'https://www.amazon.com/bestsellers/electronics',     page2: 'https://www.amazon.com/bestsellers/electronics?pg=2'     },
  { category: 'gaming',       page1: 'https://www.amazon.com/bestsellers/videogames',       page2: 'https://www.amazon.com/bestsellers/videogames?pg=2'       },
  { category: 'hogar',        page1: 'https://www.amazon.com/bestsellers/home-garden',        page2: 'https://www.amazon.com/bestsellers/home-garden?pg=2'        },
  { category: 'cocina',       page1: 'https://www.amazon.com/bestsellers/kitchen',          page2: 'https://www.amazon.com/bestsellers/kitchen?pg=2'          },
  { category: 'oficina',      page1: 'https://www.amazon.com/bestsellers/office-products',  page2: 'https://www.amazon.com/bestsellers/office-products?pg=2'  },
  { category: 'deporte',      page1: 'https://www.amazon.com/bestsellers/sporting-goods',   page2: 'https://www.amazon.com/bestsellers/sporting-goods?pg=2'   },
  { category: 'mascotas',     page1: 'https://www.amazon.com/bestsellers/pet-supplies',     page2: 'https://www.amazon.com/bestsellers/pet-supplies?pg=2'     },
  { category: 'belleza',      page1: 'https://www.amazon.com/bestsellers/beauty',           page2: 'https://www.amazon.com/bestsellers/beauty?pg=2'           },
  { category: 'bebes',        page1: 'https://www.amazon.com/bestsellers/baby-products',    page2: 'https://www.amazon.com/bestsellers/baby-products?pg=2'    },
  { category: 'herramientas', page1: 'https://www.amazon.com/bestsellers/hi',               page2: 'https://www.amazon.com/bestsellers/hi?pg=2'               },
] as const

// ── Consumable subfamilies: max 1 per brand (not max 2 across brands) ─────────
const CONSUMABLE_SUBFAMILIES = new Set([
  'fridge-filter', 'air-filter', 'diapers', 'baby-wipes', 'cat-litter',
])

// ── Types ─────────────────────────────────────────────────────────────────────

interface ValidatedCandidate {
  asin:              string
  title:             string
  brand:             string
  suggestedCategory: string
  subfamily:         string
  price:             number
  rating:            number
  reviewCount:       number
  imageUrl:          string
  shipsToColombia:   boolean
  score:             number
  discoveryRank:     number
  discoveredAt:      string
  validatedAt:       string
}

interface RemovedCandidate {
  asin:   string
  title:  string
  reason: string
}

interface DiscoveryPageResult {
  category: string
  page:     1 | 2
  url:      string
  tiles:    number
  passed:   number
  blocked:  boolean
  error?:   string
}

interface V2Pool {
  generatedAt: string
  report: {
    discovery: {
      pagesAttempted:   number
      pagesBlocked:     number
      tilesTotal:       number
      passedPreFilter:  number
      uniqueAsinCount:  number
      blockedPages:     string[]
    }
    validation: {
      submitted:        number
      approved:         number
      rejected:         number
      rejectionReasons: Record<string, number>
    }
    deduplication: {
      variantsRemoved:          number
      consumableBrandDuplicates: number
      subfamilyCapExceeded:     number
      totalRemoved:             number
      removed:                  RemovedCandidate[]
    }
    pool: {
      size:       number
      byCategory: Record<string, number>
    }
  }
  items: ValidatedCandidate[]
}

// ── Utility ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString().substring(11, 19)}] ${msg}`)
}

function score(rating: number, reviewCount: number): number {
  return Math.round((rating * 15 + Math.log10(Math.max(reviewCount, 1)) * 10) * 10) / 10
}

// ── Pre-filter ────────────────────────────────────────────────────────────────

function passesPreFilter(tile: BestSellerTile): boolean {
  if (tile.rating      === null || tile.rating      < V2.MIN_RATING)  return false
  if (tile.reviewCount === null || tile.reviewCount < V2.MIN_REVIEWS)  return false
  if (tile.tilePrice   === null || tile.tilePrice   < V2.MIN_PRICE)   return false
  if (tile.tilePrice   > V2.MAX_PRICE)                                 return false
  return true
}

// ── Subfamily classifier ──────────────────────────────────────────────────────

function classifySubfamily(title: string): string {
  const t = title.toLowerCase()

  // ── Electronics ────────────────────────────────────────────────────────────
  if (t.includes('earbud') || (t.includes('wireless') && (t.includes('earphone') || t.includes('in-ear')))) return 'wireless-earbuds'
  if (t.includes('headphone') || (!t.includes('gaming') && t.includes('headset') && !t.includes('mic only')) || (t.includes('noise cancel') && !t.includes('gaming'))) return 'headphones'
  if (t.includes('ssd') && (t.includes('portable') || t.includes('external') || t.includes('usb'))) return 'external-ssd'
  if ((t.includes('hard drive') || t.includes(' hdd')) && (t.includes('portable') || t.includes('external') || t.includes('usb'))) return 'external-hdd'
  if (t.includes('cam link') || t.includes('capture card') || t.includes('video capture')) return 'video-capture'
  if (t.includes('webcam') && !t.includes('gaming')) return 'webcam'
  if (t.includes('fire tv') || t.includes('fire stick') || (t.includes('streaming') && t.includes('stick'))) return 'streaming-device'
  if (t.includes('router') && (t.includes('wi-fi') || t.includes('wifi'))) return 'wifi-router'
  if (t.includes('kindle') || t.includes('e-reader') || t.includes('paperwhite')) return 'e-reader'
  if (t.includes('airtag') || (t.includes('item') && t.includes('tracker'))) return 'item-tracker'

  // ── Gaming ─────────────────────────────────────────────────────────────────
  if (t.includes('gaming') && t.includes('mouse')) return 'gaming-mouse'
  if (t.includes('gaming') && t.includes('headset')) return 'gaming-headset'
  if ((t.includes('controller') || t.includes('gamepad')) && (t.includes('playstation') || t.includes('xbox') || t.includes('nintendo') || t.includes('ps5') || t.includes('ps4') || t.includes('dualsense'))) return 'game-controller'
  if (t.includes('stream deck') || (t.includes('macro') && t.includes('keypad'))) return 'stream-controller'
  if (t.includes('gaming') && t.includes('keyboard')) return 'gaming-keyboard'

  // ── Kitchen / Cocina ────────────────────────────────────────────────────────
  if (t.includes('instant pot') || t.includes('pressure cooker') || (t.includes('air fryer') && t.includes('pressure'))) return 'pressure-cooker'
  if (t.includes('blender') || t.includes('nutribullet') || t.includes('vitamix')) return 'blender'
  if (t.includes('coffee') || t.includes('aeropress') || t.includes('pour-over') || (t.includes('espresso') && t.includes('maker'))) return 'coffee-brewer'
  if ((t.includes('air fryer') || (t.includes('toaster') && t.includes('oven')) || t.includes('convection oven')) && !t.includes('pressure')) return 'air-fryer-oven'
  if (t.includes('skillet') || (t.includes('cast iron') && t.includes('pan'))) return 'cast-iron'
  if (t.includes('rambler') || t.includes('travel mug') || (t.includes('tumbler') && t.includes('stainless'))) return 'insulated-mug'
  if (t.includes('thermometer') && (t.includes('meat') || t.includes('food') || t.includes('cooking') || t.includes('grill') || t.includes('bbq'))) return 'cooking-thermometer'
  if (t.includes('knife') && t.includes('set')) return 'knife-set'
  if (t.includes('cutting board')) return 'cutting-board'

  // ── Sports / Deporte ────────────────────────────────────────────────────────
  if (t.includes('foam roller')) return 'foam-roller'
  if (t.includes('yoga mat')) return 'yoga-mat'
  if (t.includes('resistance band') || t.includes('exercise band') || t.includes('loop exercise') || t.includes('loop band')) return 'resistance-bands'
  if (t.includes('waist trimmer') || t.includes('waist trainer') || (t.includes('sweat') && t.includes('band') && t.includes('waist'))) return 'waist-trimmer'
  if ((t.includes('water bottle') || t.includes('hydro flask')) && t.includes('stainless')) return 'water-bottle'
  if ((t.includes('smartwatch') || t.includes('forerunner') || t.includes('fenix')) && (t.includes('running') || t.includes('gps') || t.includes('garmin'))) return 'running-watch'
  if (t.includes('suspension training') || (t.includes('trx') && t.includes('training'))) return 'suspension-trainer'
  if (t.includes('massage gun') || t.includes('percussive') || t.includes('theragun')) return 'massage-gun'
  if (t.includes('jump rope') || t.includes('skipping rope')) return 'jump-rope'
  if (t.includes('pull-up bar') || t.includes('pullup bar') || t.includes('chin-up bar')) return 'pullup-bar'
  if (t.includes('dumbbell') || (t.includes('weight') && t.includes('set') && t.includes('lb'))) return 'free-weights'
  if (t.includes('kettlebell')) return 'kettlebell'
  if (t.includes('treadmill')) return 'treadmill'
  if (t.includes('stationary bike') || t.includes('exercise bike') || t.includes('spin bike')) return 'exercise-bike'

  // ── Office / Oficina ────────────────────────────────────────────────────────
  if (t.includes('monitor arm') || t.includes('monitor mount') || (t.includes('monitor stand') && t.includes('arm'))) return 'monitor-arm'
  if (t.includes('keyboard') && !t.includes('gaming')) return 'keyboard'
  if (t.includes('mouse') && !t.includes('gaming')) return 'mouse'
  if (t.includes('microphone') && t.includes('usb') && !t.includes('xlr')) return 'usb-microphone'
  if ((t.includes('condenser') && t.includes('microphone')) || (t.includes('xlr') && (t.includes('mic') || t.includes('microphone')))) return 'studio-microphone'
  if (t.includes('seat cushion') || t.includes('chair cushion') || (t.includes('memory foam') && t.includes('cushion'))) return 'seat-cushion'
  if (t.includes('standing desk') || (t.includes('height adjustable') && t.includes('desk'))) return 'standing-desk'
  if (t.includes('usb hub') || (t.includes('hub') && t.includes('usb') && t.includes('port'))) return 'usb-hub'
  if (t.includes('webcam') && t.includes('microphone')) return 'webcam'

  // ── Home / Hogar ────────────────────────────────────────────────────────────
  if (t.includes('air purifier') || (t.includes('purifier') && t.includes('hepa'))) return 'air-purifier'
  if (t.includes('robot vacuum') || t.includes('roomba') || (t.includes('robotic') && t.includes('vacuum'))) return 'robot-vacuum'
  if (t.includes('smart plug') || t.includes('smart outlet') || t.includes('wifi plug')) return 'smart-plug'
  if (t.includes('philips hue') || (t.includes('smart') && t.includes('bulb')) || (t.includes('color') && t.includes('bulb') && t.includes('led'))) return 'smart-light'
  if (t.includes('thermostat') && (t.includes('smart') || t.includes('nest') || t.includes('learning') || t.includes('programmable'))) return 'smart-thermostat'
  if ((t.includes('security camera') || t.includes('outdoor camera') || t.includes('indoor camera') || t.includes('wyze cam')) && !t.includes('webcam')) return 'security-camera'
  if ((t.includes('echo') && (t.includes('dot') || t.includes('show') || t.includes('studio'))) || t.includes('amazon echo')) return 'smart-speaker'
  if (t.includes('vacuum') && !t.includes('robot') && !t.includes('robotic') && !t.includes('wet')) return 'vacuum'
  if (t.includes('air conditioner') || t.includes('window ac') || t.includes('portable ac')) return 'air-conditioner'
  if (t.includes('humidifier')) return 'humidifier'
  if (t.includes('dehumidifier')) return 'dehumidifier'

  // ── Pets / Mascotas ─────────────────────────────────────────────────────────
  if (t.includes('cat litter') || t.includes('clumping litter') || t.includes('tidy cats') || t.includes('arm & hammer') || t.includes('clump & seal')) return 'cat-litter'
  if (t.includes('dog toy') || t.includes('chew toy') || (t.includes('kong') && (t.includes('toy') || t.includes('chew') || t.includes('fetch')))) return 'dog-toy'
  if (t.includes('dog leash') || (t.includes('retractable') && t.includes('leash'))) return 'dog-leash'
  if ((t.includes('door mat') || t.includes('entry mat')) && (t.includes('pet') || t.includes('muddy') || t.includes('paw') || t.includes('absorbent'))) return 'pet-mat'
  if (t.includes('furminator') || t.includes('deshedding')) return 'deshedding-tool'
  if ((t.includes('dog food') || t.includes('cat food') || t.includes('dry dog') || t.includes('dry cat')) && !t.includes('treat')) return 'pet-food'
  if (t.includes('dog bed') || t.includes('cat bed') || t.includes('pet bed') || t.includes('orthopedic bed')) return 'pet-bed'
  if (t.includes('cat tree') || t.includes('scratching post') || t.includes('cat tower')) return 'cat-tree'
  if (t.includes('pet carrier') || t.includes('dog carrier') || t.includes('cat carrier')) return 'pet-carrier'
  if (t.includes('pet grooming') || t.includes('dog brush') || t.includes('slicker brush')) return 'grooming'

  // ── Beauty / Belleza ─────────────────────────────────────────────────────────
  if (t.includes('sunscreen') || (t.includes('spf') && (t.includes('face') || t.includes('uv') || t.includes('elta') || t.includes('clear') || t.includes('sun')))) return 'sunscreen'
  if (t.includes('moisturizer') || t.includes('face cream') || t.includes('toleriane') || t.includes('double repair') || (t.includes('moisturiz') && !t.includes('body'))) return 'moisturizer'
  if (t.includes('bha') || t.includes('salicylic') || t.includes('exfoliant') || t.includes('exfoliating')) return 'bha-exfoliant'
  if ((t.includes('vitamin c') || t.includes('vitamin-c') || t.includes('retinol') || t.includes('hyaluronic')) && t.includes('serum')) return 'face-serum'
  if (t.includes('olaplex') || (t.includes('hair') && (t.includes('perfector') || t.includes('bond')))) return 'hair-treatment'
  if (t.includes('shampoo')) return 'shampoo'
  if (t.includes('conditioner') && !t.includes('air') && !t.includes('refrig')) return 'conditioner'
  if (t.includes('hair dryer') || t.includes('blow dryer') || t.includes('hot air brush') || (t.includes('one-step') && t.includes('hair'))) return 'hair-dryer'
  if (t.includes('electric trimmer') || t.includes('oneblade') || t.includes('one blade') || (t.includes('shaver') && t.includes('electric'))) return 'electric-trimmer'
  if (t.includes('face wash') || t.includes('facial cleanser') || t.includes('face cleanser')) return 'face-cleanser'
  if (t.includes('electric toothbrush') || t.includes('oral-b') || t.includes('sonicare')) return 'electric-toothbrush'
  if (t.includes('makeup') || t.includes('foundation') || t.includes('mascara') || t.includes('eyeshadow')) return 'makeup'
  if (t.includes('perfume') || t.includes('cologne') || t.includes('fragrance') || t.includes('eau de')) return 'fragrance'

  // ── Babies / Bebés ───────────────────────────────────────────────────────────
  if ((t.includes('diaper') || t.includes('swaddler') || t.includes('nappy')) && !t.includes('bag') && !t.includes('pail')) return 'diapers'
  if (t.includes('baby wipe') || t.includes('baby wipes') || (t.includes('wipe') && (t.includes('sensitive') || t.includes('pampers') || t.includes('huggies') || t.includes('unscented') || t.includes('fragrance free')))) return 'baby-wipes'
  if (t.includes('swaddle') || t.includes('swaddling') || t.includes('sleep sack')) return 'swaddle-sleep-sack'
  if (t.includes('nursing pillow') || t.includes('boppy') || t.includes('breastfeeding pillow')) return 'nursing-pillow'
  if (t.includes('sound machine') || t.includes('white noise') || t.includes('sleep trainer') || t.includes('hatch baby')) return 'sleep-machine'
  if (t.includes('baby monitor') || t.includes('video monitor') && t.includes('baby')) return 'baby-monitor'
  if (t.includes('stroller') || t.includes('pram')) return 'stroller'
  if (t.includes('car seat') || (t.includes('infant seat') && t.includes('car'))) return 'car-seat'
  if (t.includes('bouncer') || t.includes('jumperoo') || t.includes('baby bouncer')) return 'bouncer'
  if (t.includes('baby bottle') || t.includes('feeding bottle') || (t.includes('bottle') && (t.includes('dr. brown') || t.includes('dr brown') || t.includes('comotomo')))) return 'baby-bottle'
  if (t.includes('pacifier') || t.includes('binky') || t.includes('soother')) return 'pacifier'
  if (t.includes('diaper bag') || t.includes('nappy bag')) return 'diaper-bag'
  if (t.includes('baby food') || t.includes('puree') && t.includes('baby')) return 'baby-food'

  // ── Tools / Herramientas ─────────────────────────────────────────────────────
  if (t.includes('refrigerator filter') || t.includes('fridge filter') || (t.includes('whirlpool') && t.includes('filter')) || t.includes('everydrop') || (t.includes('edr') && t.includes('filter'))) return 'fridge-filter'
  if (t.includes('air filter') || t.includes('furnace filter') || t.includes('filtrete') || t.includes('merv') || (t.includes('hvac') && t.includes('filter'))) return 'air-filter'
  if (t.includes('back brace') || t.includes('lumbar support') || t.includes('lumbar brace') || t.includes('lumbar pad')) return 'back-brace'
  if (t.includes('tool kit') || t.includes('tool set') || (t.includes('homeowner') && t.includes('kit'))) return 'tool-kit'
  if (t.includes('screwdriver') && (t.includes('set') || t.includes('phillips') || t.includes('slotted'))) return 'screwdrivers'
  if (t.includes('power drill') || t.includes('cordless drill') || (t.includes('drill') && t.includes('driver'))) return 'drill'
  if (t.includes('wd-40') || (t.includes('lubricant') && !t.includes('body') && !t.includes('skin'))) return 'lubricant'
  if ((t.includes('super glue') || t.includes('gorilla')) && (t.includes('glue') || t.includes('adhesive'))) return 'adhesive'
  if (t.includes('extension cord') || t.includes('power strip') || t.includes('surge protector')) return 'power-strip'
  if (t.includes('flashlight') || t.includes('led flashlight') || (t.includes('torch') && !t.includes('olympic'))) return 'flashlight'
  if (t.includes('tape measure') || t.includes('measuring tape')) return 'tape-measure'
  if (t.includes('level') && (t.includes('spirit') || t.includes('laser') || t.includes('digital'))) return 'level'
  if (t.includes('socket') && t.includes('set')) return 'socket-set'
  if (t.includes('pliers') || t.includes('wrench') && t.includes('set')) return 'hand-tools'

  return 'other'
}

// ── Title normalization (for variant detection) ───────────────────────────────

const COLOR_WORDS = [
  'black', 'white', 'blue', 'red', 'silver', 'gold', 'gray', 'grey', 'pink',
  'green', 'purple', 'midnight', 'starlight', 'graphite', 'slate', 'charcoal',
  'tan', 'beige', 'navy', 'coral', 'teal', 'ivory', 'champagne', 'rose',
  'cream', 'yellow', 'orange', 'brown', 'space gray', 'space grey',
]

function normalizeTitle(title: string): string {
  let t = title.toLowerCase()
  // Remove color words
  for (const c of COLOR_WORDS) t = t.replace(new RegExp(`\\b${c}\\b`, 'g'), '')
  // Remove size/count patterns
  t = t
    .replace(/\b(small|medium|large|xl|xxl|xs)\b(?!\s+(screen|display|format))/g, '')
    .replace(/\b(size\s*\d+)\b/g, '')
    .replace(/\b\d+\s*(oz|lb|lbs|kg|g|ml|l|liter|gallon)\b/g, '')
    .replace(/\b\d+\s*-?\s*(pack|count|ct|pcs?|piece|pair|pairs)\b/g, '')
    .replace(/\b(pack\s+of\s+\d+|\d+\s*x\s*\d+)\b/g, '')
    .replace(/\b\d+["']\s*(x\s*\d+["'])?\b/g, '')   // dimensions like 30" x 19"
    .replace(/[-–,()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Take first 6 meaningful words as the base name
  return t.split(' ').filter(w => w.length > 1).slice(0, 6).join(' ')
}

// ── Functional deduplication ──────────────────────────────────────────────────

function deduplicateFunctionally(candidates: ValidatedCandidate[]): {
  kept:    ValidatedCandidate[]
  removed: RemovedCandidate[]
} {
  const removed: RemovedCandidate[] = []

  // ── Pass 1: Variant removal (same brand + subfamily + normalized base title) ──
  // Groups identical products that differ only in color or size.
  const variantBuckets = new Map<string, ValidatedCandidate[]>()
  for (const c of candidates) {
    const brandKey = (c.brand || c.title.split(' ')[0]).toLowerCase().replace(/\s+/g, '-')
    const baseKey  = normalizeTitle(c.title)
    const key      = `${c.suggestedCategory}|${c.subfamily}|${brandKey}|${baseKey}`
    if (!variantBuckets.has(key)) variantBuckets.set(key, [])
    variantBuckets.get(key)!.push(c)
  }

  const afterVariant: ValidatedCandidate[] = []
  let variantsRemoved = 0
  for (const group of variantBuckets.values()) {
    if (group.length === 1) { afterVariant.push(group[0]); continue }
    group.sort((a, b) => b.reviewCount - a.reviewCount)
    afterVariant.push(group[0])
    for (const rem of group.slice(1)) {
      removed.push({ asin: rem.asin, title: rem.title, reason: `variant_of:${group[0].asin} (${group[0].title.substring(0, 50)})` })
      variantsRemoved++
    }
  }

  // ── Pass 2: Consumable max-1-per-brand (within same category + subfamily) ────
  // Prevents Whirlpool Filter 1 + Filter 2, Pampers Swaddlers Size 1 + Size 5, etc.
  const consumableBrandBuckets = new Map<string, ValidatedCandidate[]>()
  const nonConsumable: ValidatedCandidate[] = []
  for (const c of afterVariant) {
    if (CONSUMABLE_SUBFAMILIES.has(c.subfamily)) {
      const brandKey = (c.brand || c.title.split(' ')[0]).toLowerCase().replace(/\s+/g, '-')
      const key      = `${c.suggestedCategory}|${c.subfamily}|${brandKey}`
      if (!consumableBrandBuckets.has(key)) consumableBrandBuckets.set(key, [])
      consumableBrandBuckets.get(key)!.push(c)
    } else {
      nonConsumable.push(c)
    }
  }

  const afterConsumable: ValidatedCandidate[] = [...nonConsumable]
  let consumableBrandDups = 0
  for (const group of consumableBrandBuckets.values()) {
    group.sort((a, b) => b.reviewCount - a.reviewCount)
    afterConsumable.push(group[0])
    for (const rem of group.slice(1)) {
      removed.push({ asin: rem.asin, title: rem.title, reason: `consumable_brand_dup:${rem.subfamily} (kept ${group[0].asin})` })
      consumableBrandDups++
    }
  }

  // ── Pass 3: Subfamily cap — max V2.MAX_PER_SUBFAMILY per (category, subfamily) ─
  // Sort by score desc so we keep the highest-quality products.
  afterConsumable.sort((a, b) => b.score - a.score)
  const subfamilyCounter = new Map<string, number>()
  const kept: ValidatedCandidate[] = []
  let subfamilyCapped = 0

  for (const c of afterConsumable) {
    if (c.subfamily === 'other') { kept.push(c); continue }  // no cap for unclassified
    const key   = `${c.suggestedCategory}|${c.subfamily}`
    const count = subfamilyCounter.get(key) ?? 0
    if (count < V2.MAX_PER_SUBFAMILY) {
      kept.push(c)
      subfamilyCounter.set(key, count + 1)
    } else {
      removed.push({ asin: c.asin, title: c.title, reason: `subfamily_cap:${c.subfamily}@${c.suggestedCategory} (limit ${V2.MAX_PER_SUBFAMILY})` })
      subfamilyCapped++
    }
  }

  log(`  Dedup summary: ${variantsRemoved} variants, ${consumableBrandDups} consumable brand dups, ${subfamilyCapped} subfamily cap → ${kept.length} kept`)
  return { kept, removed }
}

// ── Output path ───────────────────────────────────────────────────────────────

const POOL_PATH = path.join(process.cwd(), 'data', 'catalog-v2-pool.json')

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dryRun      = process.argv.includes('--dry-run')
  const startedAt   = new Date().toISOString()

  log(`═══════════════════════════════════════════════════════`)
  log(`CATALOG V2 — FASE 0: Pool Builder  ${dryRun ? '[DRY RUN]' : ''}`)
  log(`═══════════════════════════════════════════════════════`)
  log(`Thresholds: rating≥${V2.MIN_RATING}, reviews≥${V2.MIN_REVIEWS.toLocaleString()}, $${V2.MIN_PRICE}–$${V2.MAX_PRICE}`)
  log(`Categories: ${V2_CATEGORIES.length} × 2 pages = ${V2_CATEGORIES.length * 2} requests`)

  // ── Phase 1: Discovery ────────────────────────────────────────────────────

  log(`\n─── PHASE 1: Discovery ───────────────────────────────`)
  const allTiles:      BestSellerTile[] = []
  const pageResults:   DiscoveryPageResult[] = []
  const blockedPages:  string[] = []

  for (let i = 0; i < V2_CATEGORIES.length; i++) {
    const { category, page1, page2 } = V2_CATEGORIES[i]
    if (i > 0) await sleep(V2.INTER_CAT_DELAY_MS)

    for (const [pageNum, url] of [[1, page1], [2, page2]] as const) {
      if (pageNum === 2) await sleep(V2.INTER_PAGE_DELAY_MS)
      log(`  Scraping [${category}] p${pageNum} ...`)

      const result = await fetchBestSellersPage(category, url)
      const passed = result.tiles.filter(passesPreFilter)
      allTiles.push(...result.tiles)

      const pageResult: DiscoveryPageResult = {
        category, page: pageNum as 1 | 2, url,
        tiles:   result.extracted,
        passed:  passed.length,
        blocked: result.blocked,
        error:   result.error,
      }
      pageResults.push(pageResult)

      if (result.blocked) {
        blockedPages.push(`${category}/p${pageNum}`)
        log(`  ⚠ BLOCKED: ${category} p${pageNum} (${result.error ?? 'robot_check'})`)
      } else {
        log(`  ✓ ${category} p${pageNum}: ${result.extracted} tiles → ${passed.length} passed pre-filter`)
      }
    }
  }

  // ── Phase 2: Pre-filter + ASIN dedup ────────────────────────────────────

  log(`\n─── PHASE 2: Pre-filter + ASIN dedup ────────────────`)
  const passedTiles = allTiles.filter(passesPreFilter)
  const seenAsin    = new Set<string>()
  const uniqueTiles: BestSellerTile[] = []
  for (const tile of passedTiles) {
    if (!seenAsin.has(tile.asin)) {
      seenAsin.add(tile.asin)
      uniqueTiles.push(tile)
    }
  }
  log(`  Total tiles: ${allTiles.length} → ${passedTiles.length} passed pre-filter → ${uniqueTiles.length} unique ASINs`)

  if (dryRun) {
    log(`\n[DRY RUN] Skipping validation. Discovered ${uniqueTiles.length} candidates.`)
    log(`Categories by pre-filter pass:`)
    const bycat = new Map<string, number>()
    for (const t of uniqueTiles) bycat.set(t.category, (bycat.get(t.category) ?? 0) + 1)
    for (const [cat, n] of [...bycat.entries()].sort()) log(`  ${cat}: ${n}`)
    return
  }

  // ── Phase 3: Validation ───────────────────────────────────────────────────

  log(`\n─── PHASE 3: Validation (${uniqueTiles.length} ASINs × ~3s each ≈ ${Math.ceil(uniqueTiles.length * 3 / 60)} min) ──`)
  const approved:     ValidatedCandidate[] = []
  const rejectionMap: Record<string, number> = {}
  let approvedCount = 0
  let rejectedCount = 0

  for (let i = 0; i < uniqueTiles.length; i++) {
    const tile = uniqueTiles[i]
    if (i > 0) await sleep(V2.VALIDATION_DELAY_MS)

    const result = await validateCandidate(tile.asin, {
      minRating:  V2.MIN_RATING,
      minReviews: V2.MIN_REVIEWS,
      minPrice:   V2.MIN_PRICE,
      maxPrice:   V2.MAX_PRICE,
    })

    const suffix = result.decision === 'APPROVED'
      ? `✓ $${result.price} ★${result.rating} (${(result.reviewCount ?? 0).toLocaleString()} reviews)`
      : `✗ ${result.reason}`

    log(`  [${i + 1}/${uniqueTiles.length}] ${tile.asin} — ${result.decision}  ${suffix}`)

    if (result.decision === 'APPROVED') {
      approvedCount++
      approved.push({
        asin:              tile.asin,
        title:             result.title  ?? tile.tileTitle ?? '',
        brand:             result.brand  ?? '',
        suggestedCategory: tile.category,
        subfamily:         classifySubfamily(result.title ?? tile.tileTitle ?? ''),
        price:             result.price!,
        rating:            result.rating!,
        reviewCount:       result.reviewCount!,
        imageUrl:          result.imageUrl ?? tile.imageUrl ?? '',
        shipsToColombia:   result.shipsToColombia,
        score:             score(result.rating!, result.reviewCount!),
        discoveryRank:     tile.rank,
        discoveredAt:      new Date().toISOString(),
        validatedAt:       result.checkedAt,
      })
    } else {
      rejectedCount++
      const reason = result.reason ?? 'unknown'
      rejectionMap[reason] = (rejectionMap[reason] ?? 0) + 1
    }
  }

  log(`\n  Validation complete: ${approvedCount} APPROVED, ${rejectedCount} REJECTED`)

  // ── Phase 4: Functional deduplication ────────────────────────────────────

  log(`\n─── PHASE 4: Functional deduplication ───────────────`)
  const { kept, removed } = deduplicateFunctionally(approved)

  // ── Phase 5: Score, sort, write ───────────────────────────────────────────

  kept.sort((a, b) => b.score - a.score)

  const byCategory: Record<string, number> = {}
  for (const c of kept) byCategory[c.suggestedCategory] = (byCategory[c.suggestedCategory] ?? 0) + 1

  const pool: V2Pool = {
    generatedAt: startedAt,
    report: {
      discovery: {
        pagesAttempted:  pageResults.length,
        pagesBlocked:    blockedPages.length,
        tilesTotal:      allTiles.length,
        passedPreFilter: passedTiles.length,
        uniqueAsinCount: uniqueTiles.length,
        blockedPages,
      },
      validation: {
        submitted:        uniqueTiles.length,
        approved:         approvedCount,
        rejected:         rejectedCount,
        rejectionReasons: rejectionMap,
      },
      deduplication: {
        variantsRemoved:           removed.filter(r => r.reason.startsWith('variant_of')).length,
        consumableBrandDuplicates: removed.filter(r => r.reason.startsWith('consumable_brand_dup')).length,
        subfamilyCapExceeded:      removed.filter(r => r.reason.startsWith('subfamily_cap')).length,
        totalRemoved:              removed.length,
        removed,
      },
      pool: { size: kept.length, byCategory },
    },
    items: kept,
  }

  fs.mkdirSync(path.dirname(POOL_PATH), { recursive: true })
  fs.writeFileSync(POOL_PATH, JSON.stringify(pool, null, 2), 'utf-8')

  // ── Report ────────────────────────────────────────────────────────────────

  log(`\n═══════════════════════════════════════════════════════`)
  log(`CATALOG V2 POOL — REPORTE FINAL`)
  log(`═══════════════════════════════════════════════════════`)
  log(`\n  DISCOVERY`)
  log(`  ┌─────────────────────────────────────────────────`)
  for (const r of pageResults) {
    const status = r.blocked ? '⚠ BLOCKED' : `${r.tiles} tiles → ${r.passed} passed`
    log(`  │  [${r.category.padEnd(12)}] p${r.page}: ${status}`)
  }
  log(`  └─────────────────────────────────────────────────`)
  log(`  Total tiles scraped:   ${allTiles.length}`)
  log(`  Passed pre-filter:     ${passedTiles.length}`)
  log(`  Unique ASINs:          ${uniqueTiles.length}`)
  if (blockedPages.length > 0) log(`  ⚠ Blocked pages: ${blockedPages.join(', ')}`)

  log(`\n  VALIDATION`)
  log(`  ┌─────────────────────────────────────────────────`)
  log(`  │  Submitted:  ${uniqueTiles.length}`)
  log(`  │  APPROVED:   ${approvedCount}  (${Math.round(approvedCount / uniqueTiles.length * 100)}%)`)
  log(`  │  REJECTED:   ${rejectedCount}`)
  if (Object.keys(rejectionMap).length > 0) {
    log(`  │`)
    log(`  │  Rejection breakdown:`)
    for (const [reason, count] of Object.entries(rejectionMap).sort((a, b) => b[1] - a[1])) {
      log(`  │    ${count.toString().padStart(3)}×  ${reason}`)
    }
  }
  log(`  └─────────────────────────────────────────────────`)

  log(`\n  DEDUPLICATION`)
  log(`  ┌─────────────────────────────────────────────────`)
  log(`  │  Color/size variants removed:     ${pool.report.deduplication.variantsRemoved}`)
  log(`  │  Consumable brand dups removed:   ${pool.report.deduplication.consumableBrandDuplicates}`)
  log(`  │  Subfamily cap exceeded:          ${pool.report.deduplication.subfamilyCapExceeded}`)
  log(`  │  Total removed:                   ${removed.length}`)
  log(`  └─────────────────────────────────────────────────`)

  log(`\n  POOL CERTIFICADO`)
  log(`  ┌─────────────────────────────────────────────────`)
  log(`  │  Size: ${kept.length} productos`)
  log(`  │`)
  log(`  │  Por categoría:`)
  for (const [cat, n] of Object.entries(byCategory).sort()) {
    const bar = '█'.repeat(n)
    log(`  │    ${cat.padEnd(14)} ${n.toString().padStart(2)}  ${bar}`)
  }
  log(`  └─────────────────────────────────────────────────`)

  log(`\n  TOP 20 POR SCORE:`)
  log(`  ${'Rank'.padEnd(5)} ${'ASIN'.padEnd(12)} ${'★'.padEnd(5)} ${'Reviews'.padEnd(10)} ${'Price'.padEnd(8)} ${'Score'.padEnd(6)} ${'Category'.padEnd(14)} Título`)
  log(`  ${'─'.repeat(120)}`)
  for (const [idx, item] of kept.slice(0, 20).entries()) {
    const title = item.title.substring(0, 45).padEnd(45)
    log(`  ${(idx + 1).toString().padStart(4)} ` +
        `${item.asin.padEnd(12)} ` +
        `${item.rating.toFixed(1).padEnd(5)} ` +
        `${item.reviewCount.toLocaleString().padEnd(10)} ` +
        `$${item.price.toFixed(2).padEnd(7)} ` +
        `${item.score.toString().padEnd(6)} ` +
        `${item.suggestedCategory.padEnd(14)} ` +
        `${title}`)
  }

  log(`\n  Pool guardado en: ${POOL_PATH}`)
  log(`  Generado el:      ${startedAt}`)
  log(`═══════════════════════════════════════════════════════\n`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
