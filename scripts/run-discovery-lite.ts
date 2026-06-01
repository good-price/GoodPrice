/**
 * scripts/run-discovery-lite.ts
 *
 * Sprint 5A — Discovery Lite
 *
 * First functional Discovery Engine: consumes the Vacancy Queue, generates
 * mock candidates for each open vacancy, deduplicates against the existing
 * pool, inserts surviving candidates as status='pending', updates vacancy
 * states, and logs the DiscoveryJob.
 *
 * Purpose: validate the full pipeline
 *   Vacancy Queue → Discovery Engine → Deduplicator → Candidate Pool → Log
 * before connecting real external sources (Sprint 5B: PA-API).
 *
 * Source: 'mock'
 *   Candidates are hardcoded realistic product data, not from any real API.
 *   They will be rejected at Gate 7 (amazon_reachable) during evaluation
 *   because their ASINs (B0D*) do not exist on Amazon — this is expected.
 *   The goal is architecture validation, not catalog slot filling.
 *
 * Generation strategy:
 *   For each vacancy, generate (slotsNeeded + BUFFER) candidates.
 *   BUFFER = 2 — demonstrates dedup working on subsequent runs.
 *   On the first run: 0 duplicates (all new ASINs → all inserted).
 *   On repeat runs: all ASINs already in pool → 100% blocked.
 *
 * Usage (from goodprice/ directory):
 *   npx tsx scripts/run-discovery-lite.ts
 *   npx tsx scripts/run-discovery-lite.ts --dry-run
 *   npx tsx scripts/run-discovery-lite.ts --category=bebes
 *   npx tsx scripts/run-discovery-lite.ts --priority=critical,high
 */

import {
  getOpenVacancies,
  markDiscovering,
  markCompleted,
  filterDuplicates,
  buildCandidateBatch,
  appendJob,
} from '@/lib/tpe/discovery'
import { getCandidatePool, saveCandidatePool } from '@/lib/tpe/pool'
import type { DiscoveryCandidate, DiscoveryJob, DiscoveryCategoryResult, CandidateRecord, VacancyPriority } from '@/types'

// ── CLI args ──────────────────────────────────────────────────────────────────

const dryRun      = process.argv.includes('--dry-run')
const catFilter   = process.argv.find(a => a.startsWith('--category='))?.split('=')[1]
const priFilter   = process.argv.find(a => a.startsWith('--priority='))?.split('=')[1]?.split(',') as VacancyPriority[] | undefined

const DIVIDER = '─'.repeat(72)
const BUFFER  = 2   // extra candidates per vacancy beyond slotsNeeded

// ── Mock candidate catalog ────────────────────────────────────────────────────
//
// Realistic product data for the 6 under-represented categories.
// ASINs follow the pattern B0D{cat_code}{seq} (10 chars).
// Images use valid Amazon CDN format (m.media-amazon.com/images/I/) to pass
// Gate 8 (image_not_placeholder). They will fail Gate 9 (HTTP 404) → IMAGE_DEGRADED
// if Gate 7 passes, or REJECTED if Gate 7 fails (expected for mock ASINs).
//
// Gate compliance for local gates 1–6:
//   ✓ Gate 1  asin_format:           /^[A-Z0-9]{10}$/ — all ASINs 10 uppercase alnum
//   ✓ Gate 2  data_complete:         all required fields present and valid
//   ✓ Gate 3  price_valid:           0.01 ≤ price ≤ 50,000
//   ✓ Gate 4  colombia_unrestricted: no colombiaRestriction field
//   ✓ Gate 5  colombia_confirmed:    shipsToColombiaConfirmed = true
//   ✓ Gate 6  status_active:         productStatus = 'active' (set by candidate-builder)
//   ✗ Gate 7  amazon_reachable:      will FAIL — mock ASINs don't exist on Amazon

const MOCK_CATALOG: Record<string, DiscoveryCandidate[]> = {

  // ── bebes: CRITICAL — 6 slots needed, 8 generated ────────────────────────

  bebes: [
    {
      asin: 'B0D1BE0001', title: 'Motorola VM36XL — Monitor de bebé con video y audio bidireccional 2.4 GHz',
      category: 'bebes', brand: 'Motorola',
      image: 'https://m.media-amazon.com/images/I/71A2BE0001L._AC_SL1500_.jpg',
      price: 89.99, oldPrice: 119.99, rating: 4.5, reviews: 8240,
      badge: 'Más vendido', isTopSeller: true, isOffer: true,
      shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D1BE0002', title: 'Graco DuoGlider LX — Columpio y hamaca 2 en 1 para bebé con 6 velocidades',
      category: 'bebes', brand: 'Graco',
      image: 'https://m.media-amazon.com/images/I/71B2BE0002L._AC_SL1500_.jpg',
      price: 159.99, oldPrice: 199.99, rating: 4.6, reviews: 12500,
      badge: 'Oferta', isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D1BE0003', title: 'Frida Baby Quick-Read — Termómetro digital rectal y axilar para recién nacido',
      category: 'bebes', brand: 'Frida Baby',
      image: 'https://m.media-amazon.com/images/I/71C2BE0003L._AC_SL1500_.jpg',
      price: 29.99, rating: 4.7, reviews: 45300,
      badge: 'Mejor valorado', isTopSeller: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D1BE0004', title: 'Boppy Original Nursing Pillow — Cojín de lactancia y posicionador para bebé',
      category: 'bebes', brand: 'Boppy',
      image: 'https://m.media-amazon.com/images/I/71D2BE0004L._AC_SL1500_.jpg',
      price: 39.99, oldPrice: 54.99, rating: 4.6, reviews: 73200,
      badge: 'Oferta', isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D1BE0005', title: 'BEABA Babycook Neo — Robot procesador de alimentos para bebé 4 en 1 Glass Edition',
      category: 'bebes', brand: 'BEABA',
      image: 'https://m.media-amazon.com/images/I/71E2BE0005L._AC_SL1500_.jpg',
      price: 149.99, oldPrice: 179.99, rating: 4.4, reviews: 6800,
      badge: 'Premium', isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D1BE0006', title: 'Skip Hop Forma — Mochila bolso cambiador maternal con colchoneta y accesorios',
      category: 'bebes', brand: 'Skip Hop',
      image: 'https://m.media-amazon.com/images/I/71F2BE0006L._AC_SL1500_.jpg',
      price: 79.99, oldPrice: 99.99, rating: 4.5, reviews: 22100,
      badge: 'Oferta', isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D1BE0007', title: 'Baby Einstein Neptune Ocean Adventure Gym — Gimnasio de actividades para bebé',
      category: 'bebes', brand: 'Baby Einstein',
      image: 'https://m.media-amazon.com/images/I/71G2BE0007L._AC_SL1500_.jpg',
      price: 59.99, oldPrice: 79.99, rating: 4.6, reviews: 18700,
      badge: 'Oferta', isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D1BE0008', title: 'Ergobaby Omni 360 — Portabebés ergonómico 4 posiciones desde recién nacido',
      category: 'bebes', brand: 'Ergobaby',
      image: 'https://m.media-amazon.com/images/I/71H2BE0008L._AC_SL1500_.jpg',
      price: 179.99, oldPrice: 210.00, rating: 4.7, reviews: 15600,
      badge: 'Premium', isOffer: true, shipsToColombiaConfirmed: true,
    },
  ],

  // ── belleza: HIGH — 5 slots needed, 7 generated ───────────────────────────

  belleza: [
    {
      asin: 'B0D2BL0001', title: 'Dyson Supersonic HD08 — Secador de cabello iónico 1600W sin daño térmico',
      category: 'belleza', brand: 'Dyson',
      image: 'https://m.media-amazon.com/images/I/71A2BL0001L._AC_SL1500_.jpg',
      price: 429.99, oldPrice: 479.99, rating: 4.8, reviews: 34200,
      badge: 'Premium', isOffer: true, isTopSeller: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D2BL0002', title: 'Mount Lai Rose Quartz — Rodillo de cuarzo rosa para masaje facial y cuello',
      category: 'belleza', brand: 'Mount Lai',
      image: 'https://m.media-amazon.com/images/I/71B2BL0002L._AC_SL1500_.jpg',
      price: 24.99, oldPrice: 34.99, rating: 4.4, reviews: 28900,
      badge: 'Oferta', isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D2BL0003', title: 'FOREO Luna 4 — Limpiador facial eléctrico con 16 intensidades y masaje anti-edad',
      category: 'belleza', brand: 'FOREO',
      image: 'https://m.media-amazon.com/images/I/71C2BL0003L._AC_SL1500_.jpg',
      price: 199.99, oldPrice: 249.99, rating: 4.5, reviews: 19600,
      badge: 'Oferta', isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D2BL0004', title: 'NanoSteamer Large 3-in-1 — Vaporizador facial iónico nano con humectación profunda',
      category: 'belleza', brand: 'NanoSteamer',
      image: 'https://m.media-amazon.com/images/I/71D2BL0004L._AC_SL1500_.jpg',
      price: 59.99, oldPrice: 79.99, rating: 4.4, reviews: 45700,
      badge: 'Oferta', isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D2BL0005', title: 'Real Techniques Everyday Eye — Set 16 pinceles de maquillaje profesional vegano',
      category: 'belleza', brand: 'Real Techniques',
      image: 'https://m.media-amazon.com/images/I/71E2BL0005L._AC_SL1500_.jpg',
      price: 34.99, oldPrice: 44.99, rating: 4.6, reviews: 52300,
      badge: 'Más vendido', isTopSeller: true, isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D2BL0006', title: 'Conair Curl Collective — Rizador automático con 5 barriles intercambiables',
      category: 'belleza', brand: 'Conair',
      image: 'https://m.media-amazon.com/images/I/71F2BL0006L._AC_SL1500_.jpg',
      price: 79.99, oldPrice: 99.99, rating: 4.3, reviews: 12800,
      badge: 'Oferta', isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D2BL0007', title: 'TruSkin Vitamin C — Sérum facial con ácido hialurónico vitamina E y B5',
      category: 'belleza', brand: 'TruSkin',
      image: 'https://m.media-amazon.com/images/I/71G2BL0007L._AC_SL1500_.jpg',
      price: 19.99, oldPrice: 27.99, rating: 4.4, reviews: 96400,
      badge: 'Más vendido', isTopSeller: true, isOffer: true, shipsToColombiaConfirmed: true,
    },
  ],

  // ── mascotas: HIGH — 5 slots needed, 7 generated ─────────────────────────

  mascotas: [
    {
      asin: 'B0D3MA0001', title: 'PetSafe Smart Feed 2.0 — Dispensador automático de comida WiFi para perros y gatos',
      category: 'mascotas', brand: 'PetSafe',
      image: 'https://m.media-amazon.com/images/I/71A2MA0001L._AC_SL1500_.jpg',
      price: 149.99, oldPrice: 179.99, rating: 4.3, reviews: 22400,
      badge: 'Oferta', isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D3MA0002', title: 'Tractive GPS DOG 4 — Localizador GPS para perros con seguimiento de actividad',
      category: 'mascotas', brand: 'Tractive',
      image: 'https://m.media-amazon.com/images/I/71B2MA0002L._AC_SL1500_.jpg',
      price: 49.99, oldPrice: 69.99, rating: 4.2, reviews: 18700,
      badge: 'Oferta', isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D3MA0003', title: 'Go Pet Club 72" FWE — Árbol rascador para gatos con múltiples plataformas',
      category: 'mascotas', brand: 'Go Pet Club',
      image: 'https://m.media-amazon.com/images/I/71C2MA0003L._AC_SL1500_.jpg',
      price: 89.99, oldPrice: 119.99, rating: 4.4, reviews: 14300,
      badge: 'Oferta', isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D3MA0004', title: 'PetSafe Clik-R — Clicker de entrenamiento profesional para perros y gatos',
      category: 'mascotas', brand: 'PetSafe',
      image: 'https://m.media-amazon.com/images/I/71D2MA0004L._AC_SL1500_.jpg',
      price: 8.99, oldPrice: 12.99, rating: 4.6, reviews: 41200,
      badge: 'Más vendido', isTopSeller: true, isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D3MA0005', title: 'Tetra ColorFusion Starter — Acuario 20 galones kit completo con filtro y LED',
      category: 'mascotas', brand: 'Tetra',
      image: 'https://m.media-amazon.com/images/I/71E2MA0005L._AC_SL1500_.jpg',
      price: 129.99, oldPrice: 159.99, rating: 4.3, reviews: 8900,
      badge: 'Oferta', isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D3MA0006', title: 'Big Barker 7" Orthopedic — Cama ortopédica con espuma de memoria para perros grandes',
      category: 'mascotas', brand: 'Big Barker',
      image: 'https://m.media-amazon.com/images/I/71F2MA0006L._AC_SL1500_.jpg',
      price: 189.99, oldPrice: 229.99, rating: 4.7, reviews: 16800,
      badge: 'Premium', isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D3MA0007', title: 'PetSafe Drinkwell Platinum — Bebedero automático filtrante 168oz para gatos y perros',
      category: 'mascotas', brand: 'PetSafe',
      image: 'https://m.media-amazon.com/images/I/71G2MA0007L._AC_SL1500_.jpg',
      price: 44.99, oldPrice: 59.99, rating: 4.4, reviews: 31200,
      badge: 'Oferta', isOffer: true, shipsToColombiaConfirmed: true,
    },
  ],

  // ── herramientas: HIGH — 5 slots needed, 7 generated ─────────────────────

  herramientas: [
    {
      asin: 'B0D4HE0001', title: 'DEWALT DW1361 — Set 21 brocas titanio para madera metal y plástico paso a paso',
      category: 'herramientas', brand: 'DEWALT',
      image: 'https://m.media-amazon.com/images/I/71A2HE0001L._AC_SL1500_.jpg',
      price: 29.99, oldPrice: 39.99, rating: 4.7, reviews: 47800,
      badge: 'Más vendido', isTopSeller: true, isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D4HE0002', title: 'Fluke 117 True RMS — Multímetro digital para electricistas con detección VFD',
      category: 'herramientas', brand: 'Fluke',
      image: 'https://m.media-amazon.com/images/I/71B2HE0002L._AC_SL1500_.jpg',
      price: 179.99, oldPrice: 219.99, rating: 4.8, reviews: 22300,
      badge: 'Mejor valorado', isTopSeller: true, isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D4HE0003', title: 'Hakko FX888D-23BY — Estación de soldadura digital 70W temperatura ajustable 200-480°C',
      category: 'herramientas', brand: 'Hakko',
      image: 'https://m.media-amazon.com/images/I/71C2HE0003L._AC_SL1500_.jpg',
      price: 109.99, oldPrice: 139.99, rating: 4.7, reviews: 18600,
      badge: 'Oferta', isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D4HE0004', title: 'Bosch GLL30S — Nivel láser autonivelante 3 líneas de 30 pies con estuche',
      category: 'herramientas', brand: 'Bosch',
      image: 'https://m.media-amazon.com/images/I/71D2HE0004L._AC_SL1500_.jpg',
      price: 69.99, oldPrice: 89.99, rating: 4.5, reviews: 13400,
      badge: 'Oferta', isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D4HE0005', title: 'Milwaukee 48-22-1502 — Set 10 cuchillas de repuesto para cúter profesional',
      category: 'herramientas', brand: 'Milwaukee',
      image: 'https://m.media-amazon.com/images/I/71E2HE0005L._AC_SL1500_.jpg',
      price: 12.99, rating: 4.6, reviews: 28700,
      badge: 'Más vendido', isTopSeller: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D4HE0006', title: 'DEWALT DCF682N1 — Destornillador eléctrico Gyroscopic 8V con linterna y portabrocas',
      category: 'herramientas', brand: 'DEWALT',
      image: 'https://m.media-amazon.com/images/I/71F2HE0006L._AC_SL1500_.jpg',
      price: 79.99, oldPrice: 99.99, rating: 4.5, reviews: 16900,
      badge: 'Oferta', isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D4HE0007', title: 'Leatherman Wave Plus — Alicates multiherramienta 18 herramientas acero inoxidable',
      category: 'herramientas', brand: 'Leatherman',
      image: 'https://m.media-amazon.com/images/I/71G2HE0007L._AC_SL1500_.jpg',
      price: 109.99, oldPrice: 129.99, rating: 4.8, reviews: 34600,
      badge: 'Mejor valorado', isTopSeller: true, isOffer: true, shipsToColombiaConfirmed: true,
    },
  ],

  // ── deporte: LOW — 1 slot needed, 3 generated ────────────────────────────

  deporte: [
    {
      asin: 'B0D5DE0001', title: 'DEGOL Jump Rope — Cuerda para saltar de velocidad con contador digital y mangos ergonómicos',
      category: 'deporte', brand: 'DEGOL',
      image: 'https://m.media-amazon.com/images/I/71A2DE0001L._AC_SL1500_.jpg',
      price: 19.99, oldPrice: 29.99, rating: 4.5, reviews: 38200,
      badge: 'Oferta', isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D5DE0002', title: 'Fit Simplify Resistance Loop — Set 5 bandas de resistencia de látex con bolsa y guía',
      category: 'deporte', brand: 'Fit Simplify',
      image: 'https://m.media-amazon.com/images/I/71B2DE0002L._AC_SL1500_.jpg',
      price: 14.99, oldPrice: 24.99, rating: 4.6, reviews: 89400,
      badge: 'Más vendido', isTopSeller: true, isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D5DE0003', title: 'Manduka PRO Yoga Mat — Esterilla 6mm antideslizante densa para yoga y pilates',
      category: 'deporte', brand: 'Manduka',
      image: 'https://m.media-amazon.com/images/I/71C2DE0003L._AC_SL1500_.jpg',
      price: 149.99, oldPrice: 179.99, rating: 4.7, reviews: 21300,
      badge: 'Premium', isOffer: true, shipsToColombiaConfirmed: true,
    },
  ],

  // ── oficina: LOW — 1 slot needed, 3 generated ────────────────────────────

  oficina: [
    {
      asin: 'B0D6OF0001', title: 'SimpleHouseware Mesh — Organizador modular de escritorio con cajón y bandeja',
      category: 'oficina', brand: 'SimpleHouseware',
      image: 'https://m.media-amazon.com/images/I/71A2OF0001L._AC_SL1500_.jpg',
      price: 29.99, oldPrice: 39.99, rating: 4.4, reviews: 42700,
      badge: 'Oferta', isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D6OF0002', title: 'Nulaxy Laptop Stand C3 — Soporte ajustable 6 alturas con ventilación y ergonomía',
      category: 'oficina', brand: 'Nulaxy',
      image: 'https://m.media-amazon.com/images/I/71B2OF0002L._AC_SL1500_.jpg',
      price: 39.99, oldPrice: 49.99, rating: 4.5, reviews: 31800,
      badge: 'Oferta', isOffer: true, shipsToColombiaConfirmed: true,
    },
    {
      asin: 'B0D6OF0003', title: 'JOTO Cable Management — Gestión de cables de escritorio con 3 clips y pasacables',
      category: 'oficina', brand: 'JOTO',
      image: 'https://m.media-amazon.com/images/I/71C2OF0003L._AC_SL1500_.jpg',
      price: 17.99, oldPrice: 24.99, rating: 4.3, reviews: 19600,
      badge: 'Oferta', isOffer: true, shipsToColombiaConfirmed: true,
    },
  ],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function bar(value: number, total: number, width = 32): string {
  if (total === 0) return '░'.repeat(width)
  const filled = Math.round((value / total) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function pct(n: number, d: number, digits = 1): string {
  if (d === 0) return '0.0%'
  return ((n / d) * 100).toFixed(digits) + '%'
}

function makeJobId(): string {
  return `djob-${new Date().toISOString().replace(/[:.]/g, '-')}`
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const scriptStart = Date.now()

  // ── Load pool snapshot (read once, mutate in memory, write once) ──────────

  const store      = getCandidatePool()
  const poolBefore = store.candidates.length

  // ── Fetch open vacancies ──────────────────────────────────────────────────

  let vacancies = getOpenVacancies()

  // Apply CLI filters
  if (catFilter) {
    vacancies = vacancies.filter(v => v.category === catFilter)
  }
  if (priFilter && priFilter.length > 0) {
    vacancies = vacancies.filter(v => priFilter.includes(v.priority))
  }

  // ── Pre-flight report ─────────────────────────────────────────────────────

  const totalToGenerate = vacancies.reduce((s, v) => s + v.slotsNeeded + BUFFER, 0)

  console.log('\n' + DIVIDER)
  console.log('  GOODPRICE — Trusted Product Engine v1')
  console.log('  Sprint 5A: Discovery Lite  [source=mock]')
  console.log(DIVIDER)
  console.log(`  Dry run:         ${dryRun}`)
  console.log(`  Source:          mock (Sprint 5A — architecture validation)`)
  if (catFilter)         console.log(`  Category filter: ${catFilter}`)
  if (priFilter?.length) console.log(`  Priority filter: ${priFilter.join(', ')}`)
  console.log()
  console.log('  VACANCY QUEUE (open vacancies to process)')
  console.log(`  ${'Priority'.padEnd(10)} ${'Vacancy ID'.padEnd(22)} ${'slotsNeeded'.padStart(12)} ${'toGenerate'.padStart(11)}`)
  console.log('  ' + '─'.repeat(57))
  for (const v of vacancies) {
    const gen = v.slotsNeeded + BUFFER
    console.log(
      `  ${v.priority.padEnd(10)} ${v.id.padEnd(22)}${String(v.slotsNeeded).padStart(12)}${String(gen).padStart(11)}`,
    )
  }
  console.log('  ' + '─'.repeat(57))
  console.log(`  ${'TOTAL'.padEnd(10)} ${String(vacancies.length).padEnd(22)} vacancies${String(totalToGenerate).padStart(15)} candidates`)
  console.log()
  console.log(`  Pool before:     ${poolBefore} candidates`)
  if (dryRun) console.log('\n  [DRY RUN] Pool and logs will NOT be modified.')
  console.log()

  if (vacancies.length === 0) {
    console.log('  No open vacancies match the current filters. Nothing to do.')
    console.log(DIVIDER + '\n')
    return
  }

  // ── Discovery loop ────────────────────────────────────────────────────────

  const jobId     = makeJobId()
  const runAt     = new Date().toISOString()
  const allInserted: CandidateRecord[] = []
  const allDuplicates: Array<{ asin: string; reason: 'asin' | 'title'; detail: string }> = []
  const byCategory: DiscoveryCategoryResult[] = []

  // Work against a live pool snapshot (updated in memory between vacancies)
  let currentPool = [...store.candidates]

  for (const vacancy of vacancies) {
    const cat      = vacancy.category
    const mockData = MOCK_CATALOG[cat]

    if (!mockData || mockData.length === 0) {
      console.log(`  [SKIP] ${vacancy.id} — no mock data for category '${cat}'`)
      byCategory.push({
        category:    cat,
        vacancyId:   vacancy.id,
        slotsNeeded: vacancy.slotsNeeded,
        generated:   0,
        inserted:    0,
        duplicates:  0,
      })
      continue
    }

    // Take up to slotsNeeded + BUFFER from the mock catalog
    const target    = vacancy.slotsNeeded + BUFFER
    const rawSlice  = mockData.slice(0, target)

    // Dedup against the current pool snapshot (+ in-memory inserts from this run)
    const { passed, blocked } = filterDuplicates(rawSlice, currentPool)

    // Build CandidateRecords for the ones that passed dedup
    const passedSet   = new Set(passed)
    const now         = new Date().toISOString()
    const builtBatch  = buildCandidateBatch(rawSlice, passedSet, 1, now)

    // Accumulate
    allInserted.push(...builtBatch)
    allDuplicates.push(...blocked)

    // Update in-memory pool so subsequent vacancies see the new candidates
    currentPool = [...currentPool, ...builtBatch]

    // Mark vacancy as in_progress
    if (!dryRun) {
      markDiscovering(vacancy.id)
    }

    byCategory.push({
      category:    cat,
      vacancyId:   vacancy.id,
      slotsNeeded: vacancy.slotsNeeded,
      generated:   rawSlice.length,
      inserted:    builtBatch.length,
      duplicates:  blocked.length,
    })

    console.log(
      `  [${vacancy.priority.toUpperCase().padEnd(8)}] ${vacancy.id.padEnd(20)} ` +
      `generated=${rawSlice.length}  inserted=${builtBatch.length}  dupes=${blocked.length}`,
    )
  }

  // ── Persist pool (single write) ───────────────────────────────────────────

  if (!dryRun && allInserted.length > 0) {
    const updatedCandidates = [...store.candidates, ...allInserted]
    saveCandidatePool({ ...store, candidates: updatedCandidates })

    // Update vacancy statuses to in_progress with candidate counts
    for (const result of byCategory) {
      if (result.inserted > 0) {
        markCompleted(result.vacancyId, result.inserted)
      }
    }
  }

  // ── Build and log DiscoveryJob ────────────────────────────────────────────

  const durationMs = Date.now() - scriptStart
  const job: DiscoveryJob = {
    id:                  jobId,
    runAt,
    source:              'mock',
    targetVacancyIds:    vacancies.map(v => v.id),
    candidatesGenerated: byCategory.reduce((s, r) => s + r.generated, 0),
    candidatesInserted:  allInserted.length,
    duplicatesSkipped:   allDuplicates.length,
    byCategory,
    durationMs,
    status:              allInserted.length > 0 ? 'completed' : 'partial',
    notes:               'Sprint 5A mock run — validates pipeline architecture. Mock ASINs will fail Gate 7.',
  }

  if (!dryRun) {
    appendJob(job)
  }

  // ── Results ───────────────────────────────────────────────────────────────

  console.log()
  console.log(DIVIDER)
  console.log('  DISCOVERY RESULTS')
  console.log(DIVIDER)
  console.log()
  console.log(`  Job ID:                 ${job.id}`)
  console.log(`  Source:                 ${job.source}`)
  console.log(`  Status:                 ${job.status}`)
  console.log()
  console.log(`  Vacancies processed:    ${vacancies.length}`)
  console.log(`  Candidates generated:   ${job.candidatesGenerated}`)
  console.log(`  Candidates inserted:    ${job.candidatesInserted}`)
  console.log(`  Duplicates blocked:     ${job.duplicatesSkipped}`)
  console.log()

  if (job.candidatesGenerated > 0) {
    const insertRate = pct(job.candidatesInserted, job.candidatesGenerated)
    const dupeRate   = pct(job.duplicatesSkipped, job.candidatesGenerated)
    console.log(`  Insert rate:   ${bar(job.candidatesInserted, job.candidatesGenerated)}  ${insertRate}`)
    console.log(`  Dedup block:   ${bar(job.duplicatesSkipped, job.candidatesGenerated)}  ${dupeRate}`)
  }

  // ── Per-category breakdown ────────────────────────────────────────────────

  console.log()
  console.log(DIVIDER)
  console.log('  BREAKDOWN BY CATEGORY')
  console.log(DIVIDER)
  console.log(`  ${'Category'.padEnd(16)} ${'Priority'.padEnd(10)} ${'Need'.padStart(5)} ${'Gen'.padStart(5)} ${'Ins'.padStart(5)} ${'Dupe'.padStart(6)}`)
  console.log('  ' + '─'.repeat(50))
  for (const r of byCategory) {
    const v = vacancies.find(x => x.id === r.vacancyId)
    console.log(
      `  ${r.category.padEnd(16)} ${(v?.priority ?? '').padEnd(10)}` +
      `${String(r.slotsNeeded).padStart(5)}${String(r.generated).padStart(5)}` +
      `${String(r.inserted).padStart(5)}${String(r.duplicates).padStart(6)}`,
    )
  }
  console.log('  ' + '─'.repeat(50))
  console.log(
    `  ${'TOTAL'.padEnd(16)} ${' '.padEnd(10)}` +
    `${String(byCategory.reduce((s, r) => s + r.slotsNeeded, 0)).padStart(5)}` +
    `${String(job.candidatesGenerated).padStart(5)}` +
    `${String(job.candidatesInserted).padStart(5)}` +
    `${String(job.duplicatesSkipped).padStart(6)}`,
  )

  // ── Inserted candidates detail ────────────────────────────────────────────

  if (allInserted.length > 0) {
    console.log()
    console.log(`  INSERTED CANDIDATES (${allInserted.length})`)
    console.log(`  ${'ID'.padEnd(12)} ${'ASIN'.padEnd(12)} ${'Category'.padEnd(14)} ${'Price'.padStart(8)} Title`)
    console.log('  ' + '─'.repeat(72))
    for (const c of allInserted) {
      console.log(
        `  ${c.id.padEnd(12)} ${c.asin.padEnd(12)} ${c.category.padEnd(14)}` +
        `${'$' + c.price.toFixed(2).padStart(7)}  ${c.title.slice(0, 34)}…`,
      )
    }
  }

  // ── Duplicate detail ──────────────────────────────────────────────────────

  if (allDuplicates.length > 0) {
    console.log()
    console.log(`  DUPLICATES BLOCKED (${allDuplicates.length})`)
    for (const d of allDuplicates) {
      console.log(`  [${d.reason.toUpperCase().padEnd(5)}] ${d.asin}  ${d.detail.slice(0, 50)}`)
    }
  }

  // ── Categories impacted ───────────────────────────────────────────────────

  const impactedCats = byCategory.filter(r => r.inserted > 0).map(r => r.category)
  console.log()
  console.log(`  Categories impacted:  ${impactedCats.length}  (${impactedCats.join(', ')})`)

  // ── Pool state change ─────────────────────────────────────────────────────

  console.log()
  console.log(DIVIDER)
  console.log('  POOL STATE CHANGE')
  console.log(DIVIDER)
  console.log(`  Candidates before: ${poolBefore}`)
  console.log(`  Candidates added:  +${allInserted.length}`)
  console.log(`  Candidates after:  ${poolBefore + allInserted.length}`)
  console.log()
  console.log('  All inserted candidates have:')
  console.log('    status          = pending')
  console.log('    source          = discovery_engine')
  console.log('    evaluationCount = 0')
  console.log('    productStatus   = active')
  console.log('    shipsToColombiaConfirmed = true')
  console.log()
  console.log('  Next step: run evaluate-local.ts + evaluate-http.ts to gate-check candidates.')
  console.log('  Expected result: gates 1–6 PASS, gate 7 FAIL (mock ASINs not on Amazon).')
  console.log('  This validates the pipeline; real ASINs will come in Sprint 5B (PA-API).')

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log()
  console.log(DIVIDER)
  console.log('  SPRINT 5A SUMMARY')
  console.log(DIVIDER)
  console.log()
  console.log(`  Vacancies processed:    ${vacancies.length}  (${vacancies.map(v => v.priority).join(', ')})`)
  console.log(`  Candidates generated:   ${job.candidatesGenerated}`)
  console.log(`  Candidates inserted:    ${job.candidatesInserted}  (status=pending)`)
  console.log(`  Duplicates blocked:     ${job.duplicatesSkipped}`)
  console.log(`  Categories impacted:    ${impactedCats.length}  (${impactedCats.join(', ')})`)
  console.log()
  console.log(`  Discovery job ID:       ${job.id}`)
  console.log(`  Duration:               ${durationMs}ms`)
  console.log()
  if (!dryRun) {
    console.log('  Written:')
    console.log('    data/tpe/candidate-pool.json     (+ inserted candidates)')
    console.log('    data/tpe/vacancy-queue.json      (vacancies → in_progress)')
    console.log('    data/tpe/discovery-log.json      (job appended)')
  }
  console.log(DIVIDER + '\n')
}

main().catch(err => {
  console.error('\n  Sprint 5A discovery failed:', err)
  process.exit(1)
})
