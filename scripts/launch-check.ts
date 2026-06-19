#!/usr/bin/env node
/**
 * scripts/launch-check.ts
 *
 * Pre-launch readiness check for GOODPRICE.
 * Run this before making the site public to catch common misconfigurations.
 *
 * Usage:
 *   npx tsx scripts/launch-check.ts              # exit 0 if all required checks pass
 *   npx tsx scripts/launch-check.ts --strict     # exit 1 on any warning
 *   npx tsx scripts/launch-check.ts --url https://goodprice.co  # also probe live URL
 *
 * What it checks:
 *   1. Environment variables (required + recommended)
 *   2. Data directories
 *   3. Catalog health (product count + stale image count)
 *   4. SEO files (robots.ts, sitemap.ts, OG image, favicon)
 *   5. Security (headers config, middleware protection)
 *   6. Cron jobs (vercel.json)
 *   7. (Optional) Live URL probe: /api/health + /api/readiness
 */

import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'

// ── Load .env.local ────────────────────────────────────────────────────────────
// Must run before any module that reads process.env at import time.
// Only sets vars that aren't already in the environment.
const envPath = join(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}

// ── ANSI colors ────────────────────────────────────────────────────────────────
const RESET  = '\x1b[0m'
const BOLD   = '\x1b[1m'
const DIM    = '\x1b[2m'
const GREEN  = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED    = '\x1b[31m'
const CYAN   = '\x1b[36m'

// ── Check types ────────────────────────────────────────────────────────────────
type Status = 'ok' | 'warn' | 'fail' | 'info'

interface Check {
  label:   string
  status:  Status
  detail?: string
}

const checks: Check[] = []

function pass(label: string, detail?: string)  { checks.push({ label, status: 'ok',   detail }) }
function warn(label: string, detail?: string)  { checks.push({ label, status: 'warn', detail }) }
function fail(label: string, detail?: string)  { checks.push({ label, status: 'fail', detail }) }
function info(label: string, detail?: string)  { checks.push({ label, status: 'info', detail }) }

function section(title: string) {
  console.log(`\n${CYAN}${BOLD}${title}${RESET}`)
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isPlaceholder(val: string | undefined): boolean {
  if (!val) return true
  const lower = val.toLowerCase()
  return (
    lower.startsWith('your-') ||
    lower.includes('-here') ||
    lower.includes('example') ||
    lower.includes('placeholder') ||
    lower.includes('changeme')
  )
}

function getEnv(name: string) {
  const val = process.env[name]
  return { exists: Boolean(val), placeholder: isPlaceholder(val), value: val }
}

// ── 1. Environment variables ──────────────────────────────────────────────────

function checkEnvVars() {
  section('1. Variables de entorno')

  // ── Required ────────────────────────────────────────────────────────────────
  const siteUrl = getEnv('NEXT_PUBLIC_SITE_URL')
  if (!siteUrl.exists || siteUrl.placeholder) {
    fail('NEXT_PUBLIC_SITE_URL', 'No configurado — canonical URLs y sitemap usarán el fallback')
  } else if (siteUrl.value?.includes('vercel.app')) {
    warn('NEXT_PUBLIC_SITE_URL', `Dominio Vercel: ${siteUrl.value} — ¿ya tienes dominio personalizado?`)
  } else {
    pass('NEXT_PUBLIC_SITE_URL', siteUrl.value)
  }

  const cronSecret = getEnv('CRON_SECRET')
  if (!cronSecret.exists || cronSecret.placeholder) {
    fail('CRON_SECRET', 'Los crons de Vercel no podrán autenticarse')
  } else {
    pass('CRON_SECRET', `✓ configurado (${cronSecret.value!.length} chars)`)
  }

  const adminPwd = getEnv('ADMIN_PASSWORD')
  if (!adminPwd.exists || adminPwd.placeholder) {
    fail('ADMIN_PASSWORD', '⚠ CRÍTICO — /admin accesible sin contraseña')
  } else {
    pass('ADMIN_PASSWORD', `✓ configurado (${adminPwd.value!.length} chars)`)
  }

  // ── Recommended ─────────────────────────────────────────────────────────────
  const resendKey = getEnv('RESEND_API_KEY')
  if (!resendKey.exists || resendKey.placeholder) {
    warn('RESEND_API_KEY', 'Sin clave — alertas correrán pero no enviarán emails')
  } else {
    pass('RESEND_API_KEY', `✓ configurado (${resendKey.value!.slice(0, 8)}...)`)
  }

  const resendFrom = getEnv('RESEND_FROM_EMAIL')
  if (!resendFrom.exists || resendFrom.placeholder) {
    warn('RESEND_FROM_EMAIL', 'Sin dirección de envío configurada')
  } else {
    pass('RESEND_FROM_EMAIL', resendFrom.value)
  }

  const paapiKey    = getEnv('PAAPI_ACCESS_KEY')
  const paapiSecret = getEnv('PAAPI_SECRET_KEY')
  const paapiOk     = !paapiKey.placeholder && !paapiSecret.placeholder
  if (!paapiOk) {
    warn('PA-API credentials', 'No configuradas — sync de imágenes deshabilitado')
  } else {
    pass('PA-API credentials', `✓ ACCESS_KEY + SECRET_KEY presentes`)
  }

  // ── Informational ────────────────────────────────────────────────────────────
  const auditSecret = getEnv('AUDIT_SECRET')
  if (auditSecret.exists && !auditSecret.placeholder) {
    pass('AUDIT_SECRET', '✓ configurado')
  } else {
    info('AUDIT_SECRET', 'Opcional — solo necesario para trigger manual por curl/CI')
  }
}

// ── 2. Data directories ───────────────────────────────────────────────────────

function checkDataDirs() {
  section('2. Directorios de datos')

  const dirs = [
    { path: 'data/catalog',  required: true  },
    { path: 'data/pricing',  required: true  },
    { path: 'data/audit',    required: false },
    { path: 'data/ops',      required: false },
    { path: 'data/paapi',    required: false },
  ]

  for (const { path, required } of dirs) {
    const full = join(process.cwd(), path)
    if (existsSync(full)) {
      pass(path)
    } else if (required) {
      fail(path, 'Directorio requerido no encontrado')
    } else {
      warn(path, 'No encontrado — se creará en el primer run del cron')
    }
  }
}

// ── 3. Catalog health ─────────────────────────────────────────────────────────

function checkCatalog() {
  section('3. Catálogo')

  const catalogDir = join(process.cwd(), 'data', 'catalog')
  if (!existsSync(catalogDir)) {
    fail('Catálogo', 'data/catalog/ no encontrado — ¿clonaste el repo con los datos?')
    return
  }

  // List category files (exclude index.ts)
  let tsFiles: string[] = []
  try {
    tsFiles = readdirSync(catalogDir).filter(f => f.endsWith('.ts') && f !== 'index.ts')
  } catch {
    fail('Catálogo', 'Error leyendo data/catalog/')
    return
  }

  if (tsFiles.length === 0) {
    fail('Archivos de catálogo', 'No se encontraron archivos .ts en data/catalog/')
  } else {
    pass('Archivos de catálogo', `${tsFiles.length} archivos: ${tsFiles.join(', ')}`)
  }

  // Count stale image URLs
  let staleCount = 0
  let totalCount = 0

  // Patterns that indicate stale / broken image URLs:
  //   P/{ASIN}.01.  — old P/ASIN CDN format
  //   images-na.ssl-images-amazon.com/images/I/ — old I/ CDN
  const stalePatterns = [
    /images-na\.ssl-images-amazon\.com\/images\/P\//,
    /images-na\.ssl-images-amazon\.com\/images\/I\//,
  ]

  for (const file of tsFiles) {
    try {
      const content = readFileSync(join(catalogDir, file), 'utf8')
      const imageMatches = content.match(/image:\s*['"][^'"]+['"]/g) ?? []
      totalCount += imageMatches.length
      for (const match of imageMatches) {
        if (stalePatterns.some(p => p.test(match))) {
          staleCount++
        }
      }
    } catch { /* skip */ }
  }

  if (totalCount === 0) {
    warn('URLs de imágenes', 'No se encontraron URLs de imágenes en el catálogo')
  } else if (staleCount === 0) {
    pass('URLs de imágenes', `${totalCount} imágenes — todas con URLs frescas ✓`)
  } else {
    const pct = Math.round((staleCount / totalCount) * 100)
    const cfg = getEnv('PAAPI_ACCESS_KEY')
    const hint = !cfg.exists || cfg.placeholder
      ? ' — configura PA-API para sincronizar'
      : ' — ejecuta: npx tsx scripts/paapi-sync.ts'
    warn(
      'URLs de imágenes',
      `${staleCount}/${totalCount} (${pct}%) con URLs obsoletas${hint}`,
    )
  }
}

// ── 4. SEO files ──────────────────────────────────────────────────────────────

function checkSEO() {
  section('4. SEO')

  const root = process.cwd()

  if (existsSync(join(root, 'app', 'robots.ts'))) {
    pass('robots.ts', 'Generación dinámica en app/robots.ts')
  } else if (existsSync(join(root, 'public', 'robots.txt'))) {
    pass('robots.txt', 'Archivo estático en public/robots.txt')
  } else {
    fail('robots', 'Falta app/robots.ts — Google no sabrá qué indexar')
  }

  if (existsSync(join(root, 'app', 'sitemap.ts'))) {
    pass('sitemap.ts', 'Generación dinámica en app/sitemap.ts')
  } else if (existsSync(join(root, 'public', 'sitemap.xml'))) {
    pass('sitemap.xml', 'Archivo estático en public/sitemap.xml')
  } else {
    fail('sitemap', 'Falta app/sitemap.ts — Google no podrá descubrir todas las páginas')
  }

  // OG image
  const ogPaths = [
    'app/opengraph-image.tsx',
    'app/opengraph-image.png',
    'app/opengraph-image.jpg',
    'public/og-image.png',
  ]
  const ogFound = ogPaths.find(p => existsSync(join(root, p)))
  if (ogFound) {
    pass('OG Image', `✓ ${ogFound}`)
  } else {
    warn('OG Image', 'Sin imagen de preview — links en redes sociales se verán sin imagen')
  }

  // Favicon
  if (existsSync(join(root, 'app', 'favicon.ico')) || existsSync(join(root, 'public', 'favicon.ico'))) {
    pass('Favicon', '✓')
  } else {
    warn('Favicon', 'No encontrado en app/ ni public/')
  }

  // lib/seo
  if (existsSync(join(root, 'lib', 'seo'))) {
    pass('lib/seo', '✓ módulo de metadata centralizado')
  } else {
    fail('lib/seo', 'No encontrado — los builders de metadata no funcionarán')
  }
}

// ── 5. Security ───────────────────────────────────────────────────────────────

function checkSecurity() {
  section('5. Seguridad')

  const root = process.cwd()

  // next.config.mjs security headers
  const nextConfigPath = join(root, 'next.config.mjs')
  if (existsSync(nextConfigPath)) {
    const content = readFileSync(nextConfigPath, 'utf8')
    const hasHeaders = content.includes('async headers')
    const hasCSP     = content.includes('Content-Security-Policy')
    const hasHSTS    = content.includes('Strict-Transport-Security')
    const hasXFO     = content.includes('X-Frame-Options')

    if (hasCSP && hasHSTS && hasXFO) {
      pass('Security headers', 'CSP + HSTS + X-Frame-Options en next.config.mjs')
    } else if (hasHeaders) {
      const missing: string[] = []
      if (!hasCSP)  missing.push('CSP')
      if (!hasHSTS) missing.push('HSTS')
      if (!hasXFO)  missing.push('X-Frame-Options')
      warn('Security headers', `Faltan: ${missing.join(', ')}`)
    } else {
      fail('Security headers', 'No se encontraron headers de seguridad en next.config.mjs')
    }
  } else {
    warn('next.config.mjs', 'Archivo no encontrado')
  }

  // Middleware — /admin protection
  const middlewarePath = join(root, 'middleware.ts')
  if (existsSync(middlewarePath)) {
    const content = readFileSync(middlewarePath, 'utf8')
    const protectsAdmin = content.includes('/admin') && content.includes('ADMIN_PASSWORD')
    const usesBasicAuth = content.includes('WWW-Authenticate') && content.includes('Basic')
    if (protectsAdmin && usesBasicAuth) {
      pass('Middleware /admin', 'HTTP Basic Auth configurado en middleware.ts')
    } else if (protectsAdmin) {
      warn('Middleware /admin', 'middleware.ts menciona /admin pero el mecanismo de auth es inusual')
    } else {
      fail('Middleware /admin', 'middleware.ts no parece proteger /admin con auth')
    }
  } else {
    fail('Middleware', 'middleware.ts no encontrado — /admin sin protección')
  }

  // API auth — check pricing route uses CRON_SECRET
  const pricingRoute = join(root, 'app', 'api', 'pricing', 'check', 'route.ts')
  if (existsSync(pricingRoute)) {
    const content = readFileSync(pricingRoute, 'utf8')
    if (content.includes('CRON_SECRET') || content.includes('cronSecret')) {
      pass('/api/pricing/check', 'CRON_SECRET auth presente')
    } else {
      warn('/api/pricing/check', 'No se detectó protección con CRON_SECRET')
    }
  }
}

// ── 6. Cron jobs ──────────────────────────────────────────────────────────────

function checkCrons() {
  section('6. Cron jobs (vercel.json)')

  const vercelPath = join(process.cwd(), 'vercel.json')
  if (!existsSync(vercelPath)) {
    fail('vercel.json', 'No encontrado — los jobs automáticos no correrán en Vercel')
    return
  }

  let crons: Array<{ path: string; schedule: string }> = []
  try {
    const cfg = JSON.parse(readFileSync(vercelPath, 'utf8'))
    crons = cfg.crons ?? []
  } catch {
    fail('vercel.json', 'Error parseando el archivo')
    return
  }

  if (crons.length === 0) {
    warn('Crons', 'vercel.json sin entradas de cron configuradas')
    return
  }

  const expected: Array<{ path: string; desc: string }> = [
    { path: '/api/pricing/check', desc: 'Pricing check (Amazon)' },
    { path: '/api/alerts/detect', desc: 'Alert detection' },
    { path: '/api/audit/run',     desc: 'Monthly catalog audit' },
    { path: '/api/paapi/sync',    desc: 'Weekly PA-API image sync' },
  ]

  for (const { path, desc } of expected) {
    const found = crons.find(c => c.path === path)
    if (found) {
      pass(desc, `${path}  →  ${found.schedule}`)
    } else {
      warn(desc, `${path} no está en vercel.json`)
    }
  }
}

// ── 7. Live probe (optional) ──────────────────────────────────────────────────

async function checkLive(url: string) {
  section(`7. Probe en vivo: ${url}`)

  const endpoints = [
    { path: '/api/health',    name: 'Health endpoint' },
    { path: '/api/readiness', name: 'Readiness endpoint' },
    { path: '/robots.txt',    name: 'robots.txt' },
    { path: '/sitemap.xml',   name: 'sitemap.xml' },
  ]

  for (const { path, name } of endpoints) {
    const fullUrl = `${url.replace(/\/$/, '')}${path}`
    try {
      const res = await fetch(fullUrl, {
        headers: { 'User-Agent': 'GOODPRICE-LaunchCheck/1.0' },
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) {
        pass(name, `${res.status} ${res.statusText} — ${fullUrl}`)
      } else if (res.status === 503) {
        warn(name, `503 — ${fullUrl} (sistema degradado o config incompleta)`)
      } else {
        fail(name, `${res.status} — ${fullUrl}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      fail(name, `Error de red: ${msg}`)
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const STRICT  = process.argv.includes('--strict')
  const urlFlag = process.argv.find(a => a.startsWith('--url='))
  const liveUrl = urlFlag?.split('=')[1]

  console.log(`\n${BOLD}${CYAN}GOODPRICE — Verificación pre-lanzamiento${RESET}`)
  console.log(`${DIM}${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })} (COT)${RESET}`)

  checkEnvVars()
  checkDataDirs()
  checkCatalog()
  checkSEO()
  checkSecurity()
  checkCrons()

  if (liveUrl) {
    await checkLive(liveUrl)
  }

  // ── Print summary ───────────────────────────────────────────────────────────

  const icons: Record<Status, string> = {
    ok:   `${GREEN}✓${RESET}`,
    warn: `${YELLOW}⚠${RESET}`,
    fail: `${RED}✗${RESET}`,
    info: `${DIM}i${RESET}`,
  }

  console.log('\n' + '─'.repeat(62))
  console.log(`${BOLD} Resultados${RESET}`)
  console.log('─'.repeat(62))

  for (const check of checks) {
    const icon  = icons[check.status]
    const label =
      check.status === 'fail' ? `${RED}${BOLD}${check.label}${RESET}` :
      check.status === 'warn' ? `${YELLOW}${check.label}${RESET}` :
      check.status === 'info' ? `${DIM}${check.label}${RESET}` :
      check.label
    const detail = check.detail ? `  ${DIM}${check.detail}${RESET}` : ''
    console.log(`  ${icon}  ${label}${detail}`)
  }

  const failed  = checks.filter(c => c.status === 'fail')
  const warned  = checks.filter(c => c.status === 'warn')
  const infos   = checks.filter(c => c.status === 'info')
  const passed  = checks.filter(c => c.status === 'ok')

  console.log('\n' + '─'.repeat(62))
  console.log(
    `  ${GREEN}${passed.length} OK${RESET}` +
    `  ${YELLOW}${warned.length} advertencias${RESET}` +
    `  ${RED}${failed.length} errores${RESET}` +
    (infos.length > 0 ? `  ${DIM}${infos.length} info${RESET}` : ''),
  )

  if (failed.length === 0 && warned.length === 0) {
    console.log(`\n  ${GREEN}${BOLD}✓ LISTO PARA LANZAMIENTO${RESET}\n`)
  } else if (failed.length === 0) {
    console.log(`\n  ${YELLOW}${BOLD}⚠ LISTO CON ADVERTENCIAS — revisa los ítems amarillos antes de publicar${RESET}\n`)
  } else {
    console.log(`\n  ${RED}${BOLD}✗ NO LISTO — corrige los ${failed.length} error(es) en rojo primero${RESET}\n`)
  }

  const exitCode = failed.length > 0 || (STRICT && warned.length > 0) ? 1 : 0
  process.exit(exitCode)
}

main().catch(err => {
  console.error(`\n${RED}Error inesperado:${RESET}`, err)
  process.exit(1)
})
