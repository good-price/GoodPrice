/**
 * scripts/build-catalog-v2-pool-expanded.ts
 *
 * CATALOG V2 — FASE 0.75: Candidate Expansion
 *
 * Loads the existing certified pool (data/catalog-v2-pool.json),
 * discovers new candidates from expanded sources (Best Sellers pages 3-10,
 * Movers & Shakers, Most Wished For, New Releases, and specific subcategories
 * for belleza / mascotas / herramientas), validates ALL new candidates through
 * the SAME 9-gate validator at IDENTICAL V2 thresholds, then merges and
 * writes data/catalog-v2-pool-expanded.json.
 *
 * CONSTRAINTS (identical to FASE 0):
 *   - Does NOT modify the existing catalog (.ts category files).
 *   - Does NOT promote any product.
 *   - Does NOT create commits.
 *   - Does NOT relax validation thresholds — same gate, same numbers.
 *
 * Usage:
 *   npx tsx scripts/build-catalog-v2-pool-expanded.ts
 *   npx tsx scripts/build-catalog-v2-pool-expanded.ts --dry-run
 */

import fs   from 'fs'
import path from 'path'

import { fetchBestSellersPage } from '@/lib/catalog/discovery/best-sellers-scraper'
import { validateCandidate }    from '@/lib/catalog/candidate/validator'
import type { BestSellerTile }  from '@/lib/catalog/discovery/types'

// ── V2 Thresholds — UNCHANGED from FASE 0 ─────────────────────────────────────

const V2 = {
  MIN_RATING:           4.4,
  MIN_REVIEWS:          5_000,
  MIN_PRICE:            20,
  MAX_PRICE:            300,
  MAX_PER_SUBFAMILY:    2,
  VALIDATION_DELAY_MS:  2_200,
  INTER_PAGE_DELAY_MS:  2_800,
  INTER_CAT_DELAY_MS:   4_000,
} as const

// ── Consumable max-1-per-brand ─────────────────────────────────────────────────

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

interface ExpandedPool {
  generatedAt: string
  basedOn:     string
  report: {
    expansion: {
      sourcesAttempted: number
      sourcesBlocked:   number
      tilesTotal:       number
      skippedKnown:     number
      passedPreFilter:  number
      uniqueNewAsins:   number
    }
    validation: {
      submitted:        number
      approved:         number
      rejected:         number
      rejectionReasons: Record<string, number>
    }
    deduplication: {
      variantsRemoved:           number
      consumableBrandDuplicates: number
      subfamilyCapExceeded:      number
      totalRemoved:              number
      removed:                   RemovedCandidate[]
    }
    pool: {
      size:       number
      baseSize:   number
      newItems:   number
      byCategory: Record<string, number>
      deficit:    Record<string, number>
    }
  }
  items: ValidatedCandidate[]
}

// ── Discovery source definition ───────────────────────────────────────────────

interface DiscoverySource {
  label:    string   // for logging
  category: string   // GOODPRICE category slug
  url:      string
}

// Best Sellers slug → GOODPRICE category
const BS_SLUG: Record<string, string> = {
  electronics:      'electronica',
  videogames:       'gaming',
  'home-garden':    'hogar',
  kitchen:          'cocina',
  'office-products':'oficina',
  'sporting-goods': 'deporte',
  'pet-supplies':   'mascotas',
  beauty:           'belleza',
  'baby-products':  'bebes',
  hi:               'herramientas',
}

function bsPages(slug: string, fromPage: number, toPage: number): DiscoverySource[] {
  const cat = BS_SLUG[slug] ?? slug
  return Array.from({ length: toPage - fromPage + 1 }, (_, i) => ({
    label:    `BS/${slug}/p${fromPage + i}`,
    category: cat,
    url:      `https://www.amazon.com/bestsellers/${slug}?pg=${fromPage + i}`,
  }))
}

function moversPages(slug: string, pages: number): DiscoverySource[] {
  const cat = BS_SLUG[slug] ?? slug
  return Array.from({ length: pages }, (_, i) => ({
    label:    `MoverShakers/${slug}/p${i + 1}`,
    category: cat,
    url:      i === 0
      ? `https://www.amazon.com/gp/movers-and-shakers/${slug}`
      : `https://www.amazon.com/gp/movers-and-shakers/${slug}?pg=${i + 1}`,
  }))
}

function wishedPages(slug: string, pages: number): DiscoverySource[] {
  const cat = BS_SLUG[slug] ?? slug
  return Array.from({ length: pages }, (_, i) => ({
    label:    `MostWished/${slug}/p${i + 1}`,
    category: cat,
    url:      i === 0
      ? `https://www.amazon.com/gp/most-wished-for/${slug}`
      : `https://www.amazon.com/gp/most-wished-for/${slug}?pg=${i + 1}`,
  }))
}

function newRelPages(slug: string, pages: number): DiscoverySource[] {
  const cat = BS_SLUG[slug] ?? slug
  return Array.from({ length: pages }, (_, i) => ({
    label:    `NewReleases/${slug}/p${i + 1}`,
    category: cat,
    url:      i === 0
      ? `https://www.amazon.com/gp/new-releases/${slug}`
      : `https://www.amazon.com/gp/new-releases/${slug}?pg=${i + 1}`,
  }))
}

function subcat(label: string, category: string, nodeId: string, pages: number): DiscoverySource[] {
  return Array.from({ length: pages }, (_, i) => ({
    label:    `${label}/p${i + 1}`,
    category,
    url:      i === 0
      ? `https://www.amazon.com/bestsellers/${category === 'belleza' ? 'beauty' : category === 'mascotas' ? 'pet-supplies' : 'hi'}/${nodeId}`
      : `https://www.amazon.com/bestsellers/${category === 'belleza' ? 'beauty' : category === 'mascotas' ? 'pet-supplies' : 'hi'}/${nodeId}?pg=${i + 1}`,
  }))
}

// ── Build expanded source list ────────────────────────────────────────────────

function buildSources(): DiscoverySource[] {
  const sources: DiscoverySource[] = []

  // ── Best Sellers pages 3-10 (all categories) ─────────────────────────────
  // Critical deficit categories get all 8 pages; borderline get 6; surplus get 4.
  const bsExtent: [string, number][] = [
    ['beauty',          10], // CRÍTICO: belleza solo tiene 1 item
    ['pet-supplies',    10], // CRÍTICO: mascotas solo tiene 2 items
    ['hi',              10], // CRÍTICO: herramientas solo tiene 1 item
    ['videogames',       8], // BAJO: gaming tiene 3 items
    ['baby-products',    8], // BAJO: bebes tiene 3 items
    ['electronics',      6], // OK: electronica tiene 5 (exacto)
    ['home-garden',      5], // SUPERÁVIT pero puede haber más
    ['kitchen',          5],
    ['office-products',  5],
    ['sporting-goods',   4], // SUPERÁVIT grande — basta con 2 extra
  ]
  for (const [slug, toPage] of bsExtent) {
    sources.push(...bsPages(slug, 3, toPage))
  }

  // ── Movers & Shakers (2 pages) — all categories ──────────────────────────
  const moversSlug = ['beauty', 'pet-supplies', 'hi', 'videogames', 'baby-products',
                      'electronics', 'home-garden', 'kitchen', 'office-products', 'sporting-goods']
  for (const slug of moversSlug) {
    sources.push(...moversPages(slug, 2))
  }

  // ── Most Wished For (2 pages) — all categories ───────────────────────────
  const wishedSlugs = ['beauty', 'pet-supplies', 'hi', 'videogames', 'baby-products',
                       'electronics', 'home-garden', 'kitchen', 'office-products', 'sporting-goods']
  for (const slug of wishedSlugs) {
    sources.push(...wishedPages(slug, 2))
  }

  // ── New Releases (2 pages) — deficit categories only ─────────────────────
  for (const slug of ['beauty', 'pet-supplies', 'hi', 'videogames', 'baby-products']) {
    sources.push(...newRelPages(slug, 2))
  }

  // ── Belleza subcategories (node IDs for US beauty) ───────────────────────
  // Each scraped 2 pages. If a node ID is stale → 0 tiles → no penalty.
  const bellezaSubs: [string, string][] = [
    ['belleza/skincare',    '11059031'],  // Skin Care
    ['belleza/moisturiz',   '11062371'],  // Moisturizers & Creams
    ['belleza/sunscreen',   '9778975011'],// Sun Care / Sunscreen
    ['belleza/serums',      '11063261'],  // Serums & Treatments
    ['belleza/acne',        '11062381'],  // Acne & Blemish Treatments
    ['belleza/eyecream',    '11062391'],  // Eye Creams & Treatments
    ['belleza/cleanser',    '11063241'],  // Face Cleansers
    ['belleza/toner',       '11063271'],  // Toners
  ]
  for (const [label, nodeId] of bellezaSubs) {
    sources.push(...subcat(label, 'belleza', nodeId, 2))
  }

  // ── Mascotas subcategories ────────────────────────────────────────────────
  const mascotasSubs: [string, string][] = [
    ['mascotas/dog-all',    '2975460011'],  // Dog Supplies top-level
    ['mascotas/dog-toys',   '2975473011'],  // Dog Toys
    ['mascotas/dog-beds',   '2975498011'],  // Dog Beds & Furniture
    ['mascotas/dog-groom',  '2975500011'],  // Dog Grooming
    ['mascotas/cat-all',    '2975515011'],  // Cat Supplies top-level
    ['mascotas/cat-toys',   '2975516011'],  // Cat Toys
    ['mascotas/cat-furn',   '2975519011'],  // Cat Furniture & Scratching
    ['mascotas/cat-health', '2975521011'],  // Cat Health & Wellness
  ]
  for (const [label, nodeId] of mascotasSubs) {
    sources.push(...subcat(label, 'mascotas', nodeId, 2))
  }

  // ── Herramientas subcategories ────────────────────────────────────────────
  const herramientasSubs: [string, string][] = [
    ['herr/power-tools',  '552096'],     // Power & Hand Tools → Power Tools
    ['herr/hand-tools',   '468240'],     // Hand Tools
    ['herr/electrical',   '468228'],     // Electrical
    ['herr/safety',       '3011441'],    // Safety & Security
    ['herr/tape-adhes',   '256345011'],  // Tape, Adhesives & Sealants
    ['herr/measuring',    '468244'],     // Measuring & Layout Tools
    ['herr/storage',      '2230664011'], // Tool Organizers & Storage
  ]
  for (const [label, nodeId] of herramientasSubs) {
    sources.push(...subcat(label, 'herramientas', nodeId, 2))
  }

  return sources
}

// ── Utility ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString().substring(11, 19)}] ${msg}`)
}

function scoreCalc(rating: number, reviewCount: number): number {
  return Math.round((rating * 15 + Math.log10(Math.max(reviewCount, 1)) * 10) * 10) / 10
}

function passesPreFilter(tile: BestSellerTile): boolean {
  if (tile.rating      === null || tile.rating      < V2.MIN_RATING)  return false
  if (tile.reviewCount === null || tile.reviewCount < V2.MIN_REVIEWS)  return false
  if (tile.tilePrice   === null || tile.tilePrice   < V2.MIN_PRICE)   return false
  if (tile.tilePrice   > V2.MAX_PRICE)                                 return false
  return true
}

// ── Subfamily classifier (identical to FASE 0) ───────────────────────────────

function classifySubfamily(title: string): string {
  const t = title.toLowerCase()

  if (t.includes('earbud') || (t.includes('wireless') && (t.includes('earphone') || t.includes('in-ear')))) return 'wireless-earbuds'
  if (t.includes('headphone') || (!t.includes('gaming') && t.includes('headset') && !t.includes('mic only')) || (t.includes('noise cancel') && !t.includes('gaming'))) return 'headphones'
  if (t.includes('ssd') && (t.includes('portable') || t.includes('external') || t.includes('usb'))) return 'external-ssd'
  if ((t.includes('hard drive') || t.includes(' hdd')) && (t.includes('portable') || t.includes('external') || t.includes('usb'))) return 'external-hdd'
  if (t.includes('cam link') || t.includes('capture card') || t.includes('video capture')) return 'video-capture'
  if (t.includes('webcam') && !t.includes('gaming')) return 'webcam'
  if (t.includes('fire tv') || t.includes('fire stick') || (t.includes('streaming') && t.includes('stick')) || t.includes('roku')) return 'streaming-device'
  if (t.includes('router') && (t.includes('wi-fi') || t.includes('wifi'))) return 'wifi-router'
  if (t.includes('kindle') || t.includes('e-reader') || t.includes('paperwhite')) return 'e-reader'
  if (t.includes('airtag') || (t.includes('item') && t.includes('tracker'))) return 'item-tracker'

  if (t.includes('gaming') && t.includes('mouse')) return 'gaming-mouse'
  if (t.includes('gaming') && t.includes('headset')) return 'gaming-headset'
  if ((t.includes('controller') || t.includes('gamepad')) && (t.includes('playstation') || t.includes('xbox') || t.includes('nintendo') || t.includes('ps5') || t.includes('ps4') || t.includes('dualsense'))) return 'game-controller'
  if (t.includes('stream deck') || (t.includes('macro') && t.includes('keypad'))) return 'stream-controller'
  if (t.includes('gaming') && t.includes('keyboard')) return 'gaming-keyboard'
  if (t.includes('joy-con') || t.includes('joycon') || t.includes('nintendo switch') && t.includes('controller')) return 'game-controller'

  if (t.includes('instant pot') || t.includes('pressure cooker') || (t.includes('air fryer') && t.includes('pressure'))) return 'pressure-cooker'
  if (t.includes('blender') || t.includes('nutribullet') || t.includes('vitamix')) return 'blender'
  if (t.includes('coffee') || t.includes('aeropress') || t.includes('pour-over') || (t.includes('espresso') && t.includes('maker'))) return 'coffee-brewer'
  if ((t.includes('air fryer') || (t.includes('toaster') && t.includes('oven')) || t.includes('convection oven')) && !t.includes('pressure')) return 'air-fryer-oven'
  if (t.includes('skillet') || (t.includes('cast iron') && t.includes('pan')) || t.includes('nonstick') || t.includes('non-stick') || t.includes('non stick')) return 'cast-iron'
  if (t.includes('rambler') || t.includes('travel mug') || (t.includes('tumbler') && t.includes('stainless')) || t.includes('iceflow') || t.includes('ice flow')) return 'insulated-mug'
  if (t.includes('thermometer') && (t.includes('meat') || t.includes('food') || t.includes('cooking') || t.includes('grill') || t.includes('bbq'))) return 'cooking-thermometer'
  if (t.includes('knife') && t.includes('set')) return 'knife-set'
  if (t.includes('cutting board')) return 'cutting-board'

  if (t.includes('foam roller')) return 'foam-roller'
  if (t.includes('yoga mat')) return 'yoga-mat'
  if (t.includes('resistance band') || t.includes('exercise band') || t.includes('loop exercise') || t.includes('loop band')) return 'resistance-bands'
  if (t.includes('waist trimmer') || t.includes('waist trainer') || (t.includes('sweat') && t.includes('band') && t.includes('waist'))) return 'waist-trimmer'
  if ((t.includes('water bottle') || t.includes('hydro flask') || t.includes('owala')) && t.includes('stainless')) return 'water-bottle'
  if ((t.includes('smartwatch') || t.includes('forerunner') || t.includes('fenix')) && (t.includes('running') || t.includes('gps') || t.includes('garmin'))) return 'running-watch'
  if (t.includes('massage gun') || t.includes('percussive') || t.includes('theragun')) return 'massage-gun'
  if (t.includes('jump rope') || t.includes('skipping rope')) return 'jump-rope'
  if (t.includes('pull-up bar') || t.includes('pullup bar') || t.includes('chin-up bar')) return 'pullup-bar'
  if (t.includes('dumbbell') || (t.includes('weight') && t.includes('set') && t.includes('lb'))) return 'free-weights'
  if (t.includes('kettlebell')) return 'kettlebell'
  if (t.includes('treadmill')) return 'treadmill'
  if (t.includes('stationary bike') || t.includes('exercise bike') || t.includes('spin bike')) return 'exercise-bike'

  if (t.includes('monitor arm') || t.includes('monitor mount') || (t.includes('monitor stand') && t.includes('arm'))) return 'monitor-arm'
  if (t.includes('keyboard') && !t.includes('gaming')) return 'keyboard'
  if (t.includes('mouse') && !t.includes('gaming')) return 'mouse'
  if (t.includes('microphone') && t.includes('usb') && !t.includes('xlr')) return 'usb-microphone'
  if ((t.includes('condenser') && t.includes('microphone')) || (t.includes('xlr') && (t.includes('mic') || t.includes('microphone')))) return 'studio-microphone'
  if (t.includes('seat cushion') || t.includes('chair cushion') || (t.includes('memory foam') && t.includes('cushion'))) return 'seat-cushion'
  if (t.includes('standing desk') || (t.includes('height adjustable') && t.includes('desk'))) return 'standing-desk'
  if (t.includes('usb hub') || (t.includes('hub') && t.includes('usb') && t.includes('port'))) return 'usb-hub'

  if (t.includes('air purifier') || (t.includes('purifier') && t.includes('hepa'))) return 'air-purifier'
  if (t.includes('robot vacuum') || t.includes('roomba') || (t.includes('robotic') && t.includes('vacuum'))) return 'robot-vacuum'
  if (t.includes('smart plug') || t.includes('smart outlet') || t.includes('wifi plug')) return 'smart-plug'
  if (t.includes('philips hue') || (t.includes('smart') && t.includes('bulb')) || (t.includes('color') && t.includes('bulb') && t.includes('led'))) return 'smart-light'
  if (t.includes('thermostat') && (t.includes('smart') || t.includes('nest') || t.includes('learning') || t.includes('programmable'))) return 'smart-thermostat'
  if ((t.includes('security camera') || t.includes('outdoor camera') || t.includes('indoor camera') || t.includes('wyze cam')) && !t.includes('webcam')) return 'security-camera'
  if ((t.includes('echo') && (t.includes('dot') || t.includes('show') || t.includes('studio'))) || t.includes('amazon echo')) return 'smart-speaker'
  if (t.includes('vacuum') && !t.includes('robot') && !t.includes('robotic') && !t.includes('wet')) return 'vacuum'
  if (t.includes('humidifier')) return 'humidifier'
  if (t.includes('dehumidifier')) return 'dehumidifier'

  if (t.includes('cat litter') || t.includes('clumping litter') || t.includes('tidy cats') || t.includes('arm & hammer') || t.includes('clump & seal')) return 'cat-litter'
  if (t.includes('dog toy') || t.includes('chew toy') || (t.includes('kong') && (t.includes('toy') || t.includes('chew') || t.includes('fetch')))) return 'dog-toy'
  if (t.includes('dog leash') || (t.includes('retractable') && t.includes('leash'))) return 'dog-leash'
  if ((t.includes('door mat') || t.includes('entry mat')) && (t.includes('pet') || t.includes('muddy') || t.includes('paw') || t.includes('absorbent'))) return 'pet-mat'
  if (t.includes('furminator') || t.includes('deshedding')) return 'deshedding-tool'
  if (t.includes('dog bed') || t.includes('cat bed') || t.includes('pet bed') || t.includes('orthopedic bed')) return 'pet-bed'
  if (t.includes('cat tree') || t.includes('scratching post') || t.includes('cat tower')) return 'cat-tree'
  if (t.includes('pet carrier') || t.includes('dog carrier') || t.includes('cat carrier')) return 'pet-carrier'
  if (t.includes('pet grooming') || t.includes('dog brush') || t.includes('slicker brush') || t.includes('grooming glove')) return 'grooming'
  if (t.includes('dog collar') || t.includes('pet collar')) return 'dog-collar'
  if (t.includes('dog harness') || t.includes('pet harness')) return 'dog-harness'
  if (t.includes('cat toy') || t.includes('feather wand') || t.includes('laser toy') || (t.includes('interactive') && t.includes('cat'))) return 'cat-toy'
  if (t.includes('pet fountain') || t.includes('water fountain') && t.includes('pet')) return 'pet-fountain'

  if (t.includes('sunscreen') || (t.includes('spf') && (t.includes('face') || t.includes('uv') || t.includes('elta') || t.includes('sun')))) return 'sunscreen'
  if (t.includes('moisturizer') || t.includes('face cream') || t.includes('toleriane') || t.includes('double repair') || (t.includes('moisturiz') && !t.includes('body'))) return 'moisturizer'
  if (t.includes('bha') || t.includes('salicylic') || t.includes('exfoliant') || t.includes('exfoliating')) return 'bha-exfoliant'
  if ((t.includes('vitamin c') || t.includes('vitamin-c') || t.includes('retinol') || t.includes('hyaluronic') || t.includes('niacinamide')) && t.includes('serum')) return 'face-serum'
  if (t.includes('olaplex') || (t.includes('hair') && (t.includes('perfector') || t.includes('bond')))) return 'hair-treatment'
  if (t.includes('shampoo')) return 'shampoo'
  if (t.includes('conditioner') && !t.includes('air') && !t.includes('refrig')) return 'hair-conditioner'
  if (t.includes('hair dryer') || t.includes('blow dryer') || t.includes('hot air brush') || (t.includes('one-step') && t.includes('hair'))) return 'hair-dryer'
  if (t.includes('electric trimmer') || t.includes('oneblade') || t.includes('one blade') || (t.includes('shaver') && t.includes('electric'))) return 'electric-trimmer'
  if (t.includes('face wash') || t.includes('facial cleanser') || t.includes('face cleanser') || t.includes('face scrub')) return 'face-cleanser'
  if (t.includes('electric toothbrush') || t.includes('oral-b') || t.includes('sonicare')) return 'electric-toothbrush'
  if (t.includes('perfume') || t.includes('cologne') || t.includes('fragrance') || t.includes('eau de')) return 'fragrance'
  if (t.includes('eye cream') || t.includes('eye serum') || t.includes('under eye') || t.includes('dark circle')) return 'eye-cream'
  if (t.includes('toner') && (t.includes('face') || t.includes('skin') || !t.includes('printer'))) return 'face-toner'
  if (t.includes('retinol') && !t.includes('serum')) return 'retinol'
  if (t.includes('lip balm') || t.includes('chapstick') || t.includes('lip mask')) return 'lip-care'
  if (t.includes('body wash') || t.includes('shower gel')) return 'body-wash'
  if (t.includes('lotion') && (t.includes('body') || t.includes('skin'))) return 'body-lotion'

  if ((t.includes('diaper') || t.includes('swaddler') || t.includes('nappy')) && !t.includes('bag') && !t.includes('pail')) return 'diapers'
  if (t.includes('baby wipe') || t.includes('baby wipes') || (t.includes('wipe') && (t.includes('sensitive') || t.includes('pampers') || t.includes('huggies') || t.includes('unscented') || t.includes('fragrance free')))) return 'baby-wipes'
  if (t.includes('swaddle') || t.includes('swaddling') || t.includes('sleep sack')) return 'swaddle-sleep-sack'
  if (t.includes('nursing pillow') || t.includes('boppy') || t.includes('breastfeeding pillow')) return 'nursing-pillow'
  if (t.includes('sound machine') || t.includes('white noise') || t.includes('sleep trainer') || t.includes('hatch baby')) return 'sleep-machine'
  if (t.includes('baby monitor') || (t.includes('video monitor') && t.includes('baby'))) return 'baby-monitor'
  if (t.includes('stroller') || t.includes('pram')) return 'stroller'
  if (t.includes('car seat') || (t.includes('infant seat') && t.includes('car'))) return 'car-seat'
  if (t.includes('bouncer') || t.includes('jumperoo') || t.includes('baby bouncer')) return 'bouncer'
  if (t.includes('baby bottle') || (t.includes('bottle') && (t.includes('dr. brown') || t.includes('dr brown') || t.includes('comotomo')))) return 'baby-bottle'
  if (t.includes('pacifier') || t.includes('binky') || t.includes('soother')) return 'pacifier'
  if (t.includes('diaper bag') || t.includes('nappy bag')) return 'diaper-bag'

  if (t.includes('refrigerator filter') || t.includes('fridge filter') || (t.includes('whirlpool') && t.includes('filter')) || t.includes('everydrop') || (t.includes('edr') && t.includes('filter'))) return 'fridge-filter'
  if (t.includes('air filter') || t.includes('furnace filter') || t.includes('filtrete') || t.includes('merv') || (t.includes('hvac') && t.includes('filter'))) return 'air-filter'
  if (t.includes('back brace') || t.includes('lumbar support') || t.includes('lumbar brace')) return 'back-brace'
  if (t.includes('tool kit') || t.includes('tool set') || (t.includes('homeowner') && t.includes('kit'))) return 'tool-kit'
  if (t.includes('screwdriver') && (t.includes('set') || t.includes('phillips') || t.includes('slotted'))) return 'screwdrivers'
  if (t.includes('power drill') || t.includes('cordless drill') || (t.includes('drill') && t.includes('driver'))) return 'drill'
  if ((t.includes('super glue') || t.includes('gorilla')) && (t.includes('glue') || t.includes('adhesive'))) return 'adhesive'
  if (t.includes('extension cord') || t.includes('power strip') || t.includes('surge protector')) return 'power-strip'
  if (t.includes('flashlight') || t.includes('led flashlight') || (t.includes('torch') && !t.includes('olympic'))) return 'flashlight'
  if (t.includes('tape measure') || t.includes('measuring tape')) return 'tape-measure'
  if (t.includes('level') && (t.includes('spirit') || t.includes('laser') || t.includes('digital'))) return 'level'
  if (t.includes('socket') && t.includes('set')) return 'socket-set'
  if (t.includes('pliers') || (t.includes('wrench') && t.includes('set'))) return 'hand-tools'
  if (t.includes('stud finder') || t.includes('stud sensor')) return 'stud-finder'
  if (t.includes('safety glasses') || t.includes('safety goggles') || t.includes('work glove')) return 'safety-gear'

  return 'other'
}

// ── Title normalization ───────────────────────────────────────────────────────

const COLOR_WORDS = [
  'black', 'white', 'blue', 'red', 'silver', 'gold', 'gray', 'grey', 'pink',
  'green', 'purple', 'midnight', 'starlight', 'graphite', 'slate', 'charcoal',
  'tan', 'beige', 'navy', 'coral', 'teal', 'ivory', 'champagne', 'rose',
  'cream', 'yellow', 'orange', 'brown', 'space gray', 'space grey',
]

function normalizeTitle(title: string): string {
  let t = title.toLowerCase()
  for (const c of COLOR_WORDS) t = t.replace(new RegExp(`\\b${c}\\b`, 'g'), '')
  t = t
    .replace(/\b(small|medium|large|xl|xxl|xs)\b(?!\s+(screen|display|format))/g, '')
    .replace(/\b(size\s*\d+)\b/g, '')
    .replace(/\b\d+\s*(oz|lb|lbs|kg|g|ml|l|liter|gallon)\b/g, '')
    .replace(/\b\d+\s*-?\s*(pack|count|ct|pcs?|piece|pair|pairs)\b/g, '')
    .replace(/\b(pack\s+of\s+\d+|\d+\s*x\s*\d+)\b/g, '')
    .replace(/\b\d+["']\s*(x\s*\d+["'])?\b/g, '')
    .replace(/[-–,()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t.split(' ').filter(w => w.length > 1).slice(0, 6).join(' ')
}

// ── Functional dedup (identical to FASE 0) ───────────────────────────────────

function deduplicateFunctionally(candidates: ValidatedCandidate[]): {
  kept:    ValidatedCandidate[]
  removed: RemovedCandidate[]
} {
  const removed: RemovedCandidate[] = []

  // Pass 1: variant removal
  const variantBuckets = new Map<string, ValidatedCandidate[]>()
  for (const c of candidates) {
    const brandKey = (c.brand || c.title.split(' ')[0]).toLowerCase().replace(/\s+/g, '-')
    const baseKey  = normalizeTitle(c.title)
    const key      = `${c.suggestedCategory}|${c.subfamily}|${brandKey}|${baseKey}`
    if (!variantBuckets.has(key)) variantBuckets.set(key, [])
    variantBuckets.get(key)!.push(c)
  }

  const afterVariant: ValidatedCandidate[] = []
  for (const group of variantBuckets.values()) {
    if (group.length === 1) { afterVariant.push(group[0]); continue }
    group.sort((a, b) => b.reviewCount - a.reviewCount)
    afterVariant.push(group[0])
    for (const rem of group.slice(1)) {
      removed.push({ asin: rem.asin, title: rem.title, reason: `variant_of:${group[0].asin}` })
    }
  }

  // Pass 2: consumable brand dedup
  const consumableBuckets = new Map<string, ValidatedCandidate[]>()
  const nonConsumable: ValidatedCandidate[] = []
  for (const c of afterVariant) {
    if (CONSUMABLE_SUBFAMILIES.has(c.subfamily)) {
      const brandKey = (c.brand || c.title.split(' ')[0]).toLowerCase().replace(/\s+/g, '-')
      const key      = `${c.suggestedCategory}|${c.subfamily}|${brandKey}`
      if (!consumableBuckets.has(key)) consumableBuckets.set(key, [])
      consumableBuckets.get(key)!.push(c)
    } else {
      nonConsumable.push(c)
    }
  }

  const afterConsumable: ValidatedCandidate[] = [...nonConsumable]
  for (const group of consumableBuckets.values()) {
    group.sort((a, b) => b.reviewCount - a.reviewCount)
    afterConsumable.push(group[0])
    for (const rem of group.slice(1)) {
      removed.push({ asin: rem.asin, title: rem.title, reason: `consumable_brand_dup:${rem.subfamily} (kept ${group[0].asin})` })
    }
  }

  // Pass 3: subfamily cap
  afterConsumable.sort((a, b) => b.score - a.score)
  const subfamilyCounter = new Map<string, number>()
  const kept: ValidatedCandidate[] = []
  for (const c of afterConsumable) {
    if (c.subfamily === 'other') { kept.push(c); continue }
    const key   = `${c.suggestedCategory}|${c.subfamily}`
    const count = subfamilyCounter.get(key) ?? 0
    if (count < V2.MAX_PER_SUBFAMILY) {
      kept.push(c)
      subfamilyCounter.set(key, count + 1)
    } else {
      removed.push({ asin: c.asin, title: c.title, reason: `subfamily_cap:${c.subfamily}@${c.suggestedCategory} (limit ${V2.MAX_PER_SUBFAMILY})` })
    }
  }

  return { kept, removed }
}

// ── Paths ─────────────────────────────────────────────────────────────────────

const BASE_POOL_PATH     = path.join(process.cwd(), 'data', 'catalog-v2-pool.json')
const EXPANDED_POOL_PATH = path.join(process.cwd(), 'data', 'catalog-v2-pool-expanded.json')

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dryRun    = process.argv.includes('--dry-run')
  const startedAt = new Date().toISOString()

  log(`═══════════════════════════════════════════════════════`)
  log(`CATALOG V2 — FASE 0.75: Candidate Expansion  ${dryRun ? '[DRY RUN]' : ''}`)
  log(`═══════════════════════════════════════════════════════`)
  log(`Thresholds: rating≥${V2.MIN_RATING}, reviews≥${V2.MIN_REVIEWS.toLocaleString()}, $${V2.MIN_PRICE}–$${V2.MAX_PRICE}`)
  log(`Standards: IDENTICAL to FASE 0 — NO exceptions`)
  log(``)

  // ── Load existing pool ────────────────────────────────────────────────────

  if (!fs.existsSync(BASE_POOL_PATH)) {
    log(`ERROR: Base pool not found at ${BASE_POOL_PATH}`)
    log(`Run build-catalog-v2-pool.ts first.`)
    process.exit(1)
  }

  const basePool = JSON.parse(fs.readFileSync(BASE_POOL_PATH, 'utf-8')) as { items: ValidatedCandidate[] }
  const baseItems = basePool.items
  const knownAsins = new Set(baseItems.map(i => i.asin))

  log(`─── Base pool loaded ─────────────────────────────────`)
  log(`  ${baseItems.length} existing certified items`)
  log(`  ${knownAsins.size} known ASINs (will be skipped in expansion)`)
  const baseByCategory: Record<string, number> = {}
  for (const item of baseItems) baseByCategory[item.suggestedCategory] = (baseByCategory[item.suggestedCategory] ?? 0) + 1
  log(`  By category: ${Object.entries(baseByCategory).map(([k, v]) => `${k}:${v}`).join(' | ')}`)
  log(``)

  // ── Build source list ─────────────────────────────────────────────────────

  const sources = buildSources()
  log(`─── Expansion sources ────────────────────────────────`)
  log(`  Total sources: ${sources.length}`)
  const srcByCategory: Record<string, number> = {}
  for (const s of sources) srcByCategory[s.category] = (srcByCategory[s.category] ?? 0) + 1
  for (const [cat, n] of Object.entries(srcByCategory).sort()) log(`  ${cat.padEnd(14)}: ${n} sources`)
  log(``)

  // ── Phase 1: Discovery ────────────────────────────────────────────────────

  log(`─── PHASE 1: Discovery (${sources.length} sources) ─────────────────`)
  const allTiles:      BestSellerTile[] = []
  let   sourcesBlocked = 0
  let   lastCategory   = ''

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i]

    // Inter-category delay
    if (src.category !== lastCategory && lastCategory !== '') {
      await sleep(V2.INTER_CAT_DELAY_MS)
    } else if (i > 0) {
      await sleep(V2.INTER_PAGE_DELAY_MS)
    }
    lastCategory = src.category

    const result = await fetchBestSellersPage(src.category, src.url)
    const passed = result.tiles.filter(passesPreFilter)

    if (result.blocked) {
      sourcesBlocked++
      log(`  ⚠ [${i + 1}/${sources.length}] ${src.label}: BLOCKED`)
    } else if (result.extracted === 0) {
      log(`  ○ [${i + 1}/${sources.length}] ${src.label}: 0 tiles (empty page)`)
    } else {
      const newPassed = passed.filter(t => !knownAsins.has(t.asin))
      log(`  ✓ [${i + 1}/${sources.length}] ${src.label}: ${result.extracted} tiles → ${passed.length} passed pre-filter → ${newPassed.length} new`)
    }

    allTiles.push(...result.tiles)
  }

  // ── Phase 2: Pre-filter + dedup ───────────────────────────────────────────

  log(`\n─── PHASE 2: Filter + dedup ──────────────────────────`)
  const passedTiles = allTiles.filter(passesPreFilter)
  let   skippedKnown = 0
  const seenAsin     = new Set<string>(knownAsins)  // seed with existing ASINs
  const newUniqTiles: BestSellerTile[] = []

  for (const tile of passedTiles) {
    if (knownAsins.has(tile.asin)) { skippedKnown++; continue }
    if (!seenAsin.has(tile.asin)) {
      seenAsin.add(tile.asin)
      newUniqTiles.push(tile)
    }
  }

  log(`  All tiles collected:       ${allTiles.length}`)
  log(`  Passed pre-filter:         ${passedTiles.length}`)
  log(`  Skipped (already in pool): ${skippedKnown}`)
  log(`  New unique candidates:     ${newUniqTiles.length}`)

  const newByCategory: Record<string, number> = {}
  for (const t of newUniqTiles) newByCategory[t.category] = (newByCategory[t.category] ?? 0) + 1
  for (const [cat, n] of Object.entries(newByCategory).sort()) log(`    ${cat.padEnd(14)}: ${n} new candidates`)

  if (dryRun) {
    log(`\n[DRY RUN] Skipping validation.`)
    log(`Would validate: ${newUniqTiles.length} new ASINs`)
    return
  }

  // ── Phase 3: Validation (new ASINs only) ──────────────────────────────────

  const estMin = Math.ceil(newUniqTiles.length * (V2.VALIDATION_DELAY_MS / 1000) / 60)
  log(`\n─── PHASE 3: Validation (${newUniqTiles.length} new ASINs × ~${V2.VALIDATION_DELAY_MS / 1000}s ≈ ${estMin} min) ──`)

  const newApproved:  ValidatedCandidate[] = []
  const rejectionMap: Record<string, number> = {}
  let   approvedCount = 0
  let   rejectedCount = 0

  for (let i = 0; i < newUniqTiles.length; i++) {
    const tile = newUniqTiles[i]
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
    log(`  [${i + 1}/${newUniqTiles.length}] ${tile.asin} — ${result.decision}  ${suffix}`)

    if (result.decision === 'APPROVED') {
      approvedCount++
      newApproved.push({
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
        score:             scoreCalc(result.rating!, result.reviewCount!),
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

  const approvalRate = newUniqTiles.length > 0
    ? Math.round(approvedCount / newUniqTiles.length * 100) : 0
  log(`\n  Validation complete: ${approvedCount} APPROVED (${approvalRate}%), ${rejectedCount} REJECTED`)

  // ── Phase 4: Merge + dedup on full set ───────────────────────────────────

  log(`\n─── PHASE 4: Merge + functional dedup ───────────────`)
  const merged = [...baseItems, ...newApproved]
  log(`  Base: ${baseItems.length} | New: ${newApproved.length} | Merged total: ${merged.length}`)

  const { kept, removed } = deduplicateFunctionally(merged)
  log(`  After dedup: ${kept.length} kept, ${removed.length} removed`)

  // ── Phase 5: Sort + write ─────────────────────────────────────────────────

  kept.sort((a, b) => b.score - a.score)

  const finalByCategory: Record<string, number> = {}
  for (const c of kept) finalByCategory[c.suggestedCategory] = (finalByCategory[c.suggestedCategory] ?? 0) + 1

  const TARGET_PER_CAT = 5
  const deficit: Record<string, number> = {}
  for (const cat of Object.keys(baseByCategory)) {
    const have = finalByCategory[cat] ?? 0
    if (have < TARGET_PER_CAT) deficit[cat] = TARGET_PER_CAT - have
  }

  const expandedPool: ExpandedPool = {
    generatedAt: startedAt,
    basedOn:     BASE_POOL_PATH,
    report: {
      expansion: {
        sourcesAttempted: sources.length,
        sourcesBlocked,
        tilesTotal:       allTiles.length,
        skippedKnown,
        passedPreFilter:  passedTiles.length,
        uniqueNewAsins:   newUniqTiles.length,
      },
      validation: {
        submitted:        newUniqTiles.length,
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
      pool: {
        size:       kept.length,
        baseSize:   baseItems.length,
        newItems:   kept.length - baseItems.length,
        byCategory: finalByCategory,
        deficit,
      },
    },
    items: kept,
  }

  fs.mkdirSync(path.dirname(EXPANDED_POOL_PATH), { recursive: true })
  fs.writeFileSync(EXPANDED_POOL_PATH, JSON.stringify(expandedPool, null, 2), 'utf-8')

  // ── Final report ──────────────────────────────────────────────────────────

  log(`\n═══════════════════════════════════════════════════════`)
  log(`CATALOG V2 — FASE 0.75 REPORTE FINAL`)
  log(`═══════════════════════════════════════════════════════`)

  log(`\n  EXPANSION`)
  log(`  ┌─────────────────────────────────────────────────`)
  log(`  │  Sources attempted:       ${sources.length}`)
  log(`  │  Sources blocked:         ${sourcesBlocked}`)
  log(`  │  Tiles collected:         ${allTiles.length}`)
  log(`  │  Skipped (known ASINs):   ${skippedKnown}`)
  log(`  │  New pre-filter pass:     ${newUniqTiles.length}`)
  log(`  └─────────────────────────────────────────────────`)

  log(`\n  VALIDATION (new candidates only)`)
  log(`  ┌─────────────────────────────────────────────────`)
  log(`  │  Submitted:  ${newUniqTiles.length}`)
  log(`  │  APPROVED:   ${approvedCount}  (${approvalRate}%)`)
  log(`  │  REJECTED:   ${rejectedCount}`)
  if (Object.keys(rejectionMap).length > 0) {
    log(`  │`)
    log(`  │  Rejection breakdown:`)
    for (const [reason, count] of Object.entries(rejectionMap).sort((a, b) => b[1] - a[1])) {
      log(`  │    ${count.toString().padStart(3)}×  ${reason}`)
    }
  }
  log(`  └─────────────────────────────────────────────────`)

  log(`\n  POOL EXPANDIDO (base ${baseItems.length} + ${approvedCount} nuevos → ${kept.length} después de dedup)`)
  log(`  ┌─────────────────────────────────────────────────`)
  log(`  │  Por categoría:`)
  for (const [cat, n] of Object.entries(finalByCategory).sort()) {
    const bar  = '█'.repeat(n)
    const def  = deficit[cat] ? ` ⚠ DÉFICIT -${deficit[cat]}` : ''
    log(`  │    ${cat.padEnd(14)} ${n.toString().padStart(3)}  ${bar}${def}`)
  }
  log(`  └─────────────────────────────────────────────────`)

  log(`\n  TOP 20 POR SCORE (expanded pool):`)
  log(`  ${'Rank'.padEnd(5)} ${'ASIN'.padEnd(12)} ${'★'.padEnd(5)} ${'Reviews'.padEnd(10)} ${'Price'.padEnd(8)} ${'Score'.padEnd(6)} ${'Cat'.padEnd(14)} Título`)
  log(`  ${'─'.repeat(115)}`)
  for (const [idx, item] of kept.slice(0, 20).entries()) {
    log(`  ${(idx + 1).toString().padStart(4)} ` +
        `${item.asin.padEnd(12)} ` +
        `${item.rating.toFixed(1).padEnd(5)} ` +
        `${item.reviewCount.toLocaleString().padEnd(10)} ` +
        `$${item.price.toFixed(2).padEnd(7)} ` +
        `${item.score.toString().padEnd(6)} ` +
        `${item.suggestedCategory.padEnd(14)} ` +
        `${item.title.substring(0, 42)}`)
  }

  if (Object.keys(deficit).length === 0) {
    log(`\n  ✅ READY_FOR_CATALOG_V2`)
    log(`  Todas las categorías tienen ≥${TARGET_PER_CAT} candidatos certificados.`)
  } else {
    log(`\n  ⚠ NEEDS_REBALANCING`)
    log(`  Categorías con déficit persistente:`)
    for (const [cat, def] of Object.entries(deficit).sort((a, b) => b[1] - a[1])) {
      log(`    ${cat}: faltan ${def} candidatos`)
    }
  }

  log(`\n  Pool guardado en: ${EXPANDED_POOL_PATH}`)
  log(`  Generado el:      ${startedAt}`)
  log(`═══════════════════════════════════════════════════════\n`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
