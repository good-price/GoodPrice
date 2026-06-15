# Site Mode Manager V1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a centralized site-mode toggle (PUBLIC / DEVELOPMENT) that redirects all public traffic to a branded development page, controlled from the admin panel without code changes or redeploys.

**Architecture:** A single `lib/system/site-mode.ts` module reads/writes `data/system/site-mode.json` synchronously (same pattern as quarantine.ts and status-overrides.ts). The 7 affected public pages each become `force-dynamic` and call `readSiteMode()` at render time — redirecting to `/en-desarrollo` when mode is `'development'`. Middleware is NOT changed (Edge Runtime cannot read `fs`). The admin API route validates input and writes the JSON; the admin UI page provides a toggle with session protection.

**Tech Stack:** Next.js 14 App Router · TypeScript · `fs` (Node.js) · `isAdminRequest` from `lib/admin/auth` · Tailwind CSS · Radix UI patterns already in project

---

## File Map

**Create:**
- `lib/system/site-mode.ts` — core read/write module, the only place that touches the JSON
- `data/system/site-mode.json` — persistent state file (`{ mode, updatedAt, previousMode }`)
- `app/en-desarrollo/page.tsx` — static development landing page
- `app/api/system/site-mode/route.ts` — GET (public) + POST (admin-only) API
- `app/admin/system/page.tsx` — admin toggle UI (Server Component)
- `components/admin/SiteModeToggle.tsx` — Client Component for the toggle button

**Modify:**
- `app/page.tsx` — add `force-dynamic` + mode check
- `app/categorias/page.tsx` — add `force-dynamic` + mode check
- `app/categorias/[slug]/page.tsx` — add `force-dynamic` + mode check
- `app/productos/page.tsx` — add `force-dynamic` + mode check
- `app/productos/[asin]/page.tsx` — add `force-dynamic` + mode check
- `app/ofertas/page.tsx` — add `force-dynamic` + mode check
- `app/top-ventas/page.tsx` — add `force-dynamic` + mode check
- `app/admin/page.tsx` — add System module card to the grid

---

## Task 1: Core lib + data file

**Files:**
- Create: `lib/system/site-mode.ts`
- Create: `data/system/site-mode.json`

- [ ] **Step 1: Create `data/system/` directory and initial JSON**

```powershell
New-Item -ItemType Directory -Force "C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice\data\system"
```

Then create `data/system/site-mode.json`:

```json
{
  "mode": "public",
  "updatedAt": "2026-06-15T00:00:00.000Z",
  "previousMode": null
}
```

- [ ] **Step 2: Create `lib/system/site-mode.ts`**

```typescript
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// ── Types ──────────────────────────────────────────────────────────────────────

export type SiteMode = 'public' | 'development'

export interface SiteModeState {
  mode:         SiteMode
  updatedAt:    string | null
  previousMode: SiteMode | null
}

const ALLOWED_MODES: SiteMode[] = ['public', 'development']
const MODE_PATH = join(process.cwd(), 'data', 'system', 'site-mode.json')

// ── Helpers ───────────────────────────────────────────────────────────────────

function isAllowedMode(value: unknown): value is SiteMode {
  return ALLOWED_MODES.includes(value as SiteMode)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Reads site-mode.json synchronously.
 * Falls back to PUBLIC if the file is missing, unreadable, or contains
 * an invalid mode value — ensuring the site is always publicly accessible
 * in case of file corruption.
 */
export function readSiteMode(): SiteModeState {
  if (!existsSync(MODE_PATH)) {
    return { mode: 'public', updatedAt: null, previousMode: null }
  }
  try {
    const raw   = readFileSync(MODE_PATH, 'utf-8')
    const data  = JSON.parse(raw) as Record<string, unknown>
    const mode  = isAllowedMode(data.mode) ? data.mode : 'public'
    const prev  = isAllowedMode(data.previousMode) ? data.previousMode : null
    const upd   = typeof data.updatedAt === 'string' ? data.updatedAt : null
    return { mode, updatedAt: upd, previousMode: prev }
  } catch {
    return { mode: 'public', updatedAt: null, previousMode: null }
  }
}

/**
 * Writes a new site mode to disk.
 * Validates the value and records the previous mode + timestamp.
 * Throws if `newMode` is not a valid SiteMode.
 */
export function setSiteMode(newMode: SiteMode): SiteModeState {
  if (!isAllowedMode(newMode)) {
    throw new Error(`Invalid site mode: "${newMode}". Allowed: ${ALLOWED_MODES.join(', ')}`)
  }
  const current = readSiteMode()
  const state: SiteModeState = {
    mode:         newMode,
    updatedAt:    new Date().toISOString(),
    previousMode: current.mode,
  }
  mkdirSync(join(process.cwd(), 'data', 'system'), { recursive: true })
  writeFileSync(MODE_PATH, JSON.stringify(state, null, 2), 'utf-8')
  return state
}
```

- [ ] **Step 3: TypeScript check**

```powershell
cd C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice
npx tsc --noEmit
```

Expected: no output, exit 0.

- [ ] **Step 4: Smoke test the module**

```powershell
node -e "
const { join } = require('path');
process.chdir('C:/Users/pombo/OneDrive/Documents/GOODPRICE/goodprice');
// Test fallback (before file exists)
const { readSiteMode } = require('./data/system/site-mode.json');
console.log('file exists check passed');
"
```

A simpler test — verify the JSON parses correctly:

```powershell
node -e "
const d = JSON.parse(require('fs').readFileSync('data/system/site-mode.json','utf8'));
console.log('mode:', d.mode, '| valid:', ['public','development'].includes(d.mode));
"
```

Expected: `mode: public | valid: true`

---

## Task 2: `/en-desarrollo` page

**Files:**
- Create: `app/en-desarrollo/page.tsx`

- [ ] **Step 1: Create the page**

Create `app/en-desarrollo/page.tsx`:

```typescript
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'En desarrollo — GOODPRICE',
  robots: { index: false, follow: false },
}

export default function EnDesarrolloPage() {
  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center px-6">

      {/* Logo */}
      <div className="mb-12 text-center">
        <span className="text-4xl font-black tracking-tight text-white">
          <span className="text-[#F7A823]">GOOD</span>PRICE
        </span>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-[#1a1f2e] rounded-2xl border border-white/10 p-10 text-center shadow-2xl">

        {/* Pulse indicator */}
        <div className="flex items-center justify-center mb-8">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F7A823] opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#F7A823]" />
          </span>
          <span className="ml-2.5 text-[11px] font-semibold text-[#F7A823] uppercase tracking-widest">
            En desarrollo
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-xl font-bold text-white mb-3 leading-snug">
          Estamos realizando mejoras<br />para ofrecer una mejor experiencia.
        </h1>

        {/* Body */}
        <p className="text-sm text-white/50 leading-relaxed mb-10">
          Nuestro catálogo y herramientas están siendo actualizados.
          <br />Volveremos pronto.
        </p>

        {/* OPS access */}
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-xs font-medium text-white/30 hover:text-white/60 transition-colors duration-150"
        >
          <span className="text-[10px]">🔒</span>
          Acceso OPS
        </Link>
      </div>

      {/* Footer */}
      <p className="mt-8 text-[11px] text-white/20">
        © {new Date().getFullYear()} GOODPRICE
      </p>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```powershell
cd C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice
npx tsc --noEmit
```

Expected: no output, exit 0.

---

## Task 3: API route — GET + POST `/api/system/site-mode`

**Files:**
- Create: `app/api/system/site-mode/route.ts`

- [ ] **Step 1: Create the route**

Create `app/api/system/site-mode/route.ts`:

```typescript
/**
 * GET  /api/system/site-mode — public, returns current mode
 * POST /api/system/site-mode — admin-only, sets new mode
 *
 * POST body: { "mode": "public" | "development" }
 * POST response: { ok: true, previous: string, current: string, updatedAt: string }
 */

import { type NextRequest, NextResponse } from 'next/server'
import { readSiteMode, setSiteMode }      from '@/lib/system/site-mode'
import { isAdminRequest }                 from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ── GET — public ──────────────────────────────────────────────────────────────

export function GET() {
  const state = readSiteMode()
  return NextResponse.json({
    ok:           true,
    mode:         state.mode,
    updatedAt:    state.updatedAt,
    previousMode: state.previousMode,
  })
}

// ── POST — admin only ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const newMode = body.mode
  if (newMode !== 'public' && newMode !== 'development') {
    return NextResponse.json(
      { ok: false, error: `Invalid mode: "${newMode}". Allowed: public, development` },
      { status: 400 },
    )
  }

  const current  = readSiteMode()
  const previous = current.mode

  if (previous === newMode) {
    return NextResponse.json({
      ok:       true,
      message:  `Mode already set to "${newMode}" — no change`,
      previous,
      current:  newMode,
      updatedAt: current.updatedAt,
    })
  }

  const state = setSiteMode(newMode)

  return NextResponse.json({
    ok:        true,
    previous,
    current:   state.mode,
    updatedAt: state.updatedAt,
  })
}
```

- [ ] **Step 2: TypeScript check**

```powershell
cd C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice
npx tsc --noEmit
```

Expected: no output, exit 0.

- [ ] **Step 3: Smoke test GET in dev mode**

Start dev server (`npm run dev` in a separate terminal), then:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/system/site-mode" -Method GET | ConvertTo-Json
```

Expected:
```json
{ "ok": true, "mode": "public", "updatedAt": "2026-06-15T00:00:00.000Z", "previousMode": null }
```

---

## Task 4: Public page guards (7 pages)

Add `force-dynamic` and a mode check to each affected public page. The check is identical in each — two lines added at the top of the page function body.

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/categorias/page.tsx`
- Modify: `app/categorias/[slug]/page.tsx`
- Modify: `app/productos/page.tsx`
- Modify: `app/productos/[asin]/page.tsx`
- Modify: `app/ofertas/page.tsx`
- Modify: `app/top-ventas/page.tsx`

### 4a — `app/page.tsx`

- [ ] **Step 1: Replace `revalidate` with `force-dynamic`, add import + check**

Find and replace in `app/page.tsx`:

```typescript
// REMOVE this line:
export const revalidate = 86400

// ADD these two lines in their place:
import { readSiteMode } from '@/lib/system/site-mode'
import { redirect }     from 'next/navigation'
export const dynamic = 'force-dynamic'
```

Then at the START of the `HomePage()` function body, before any existing code, add:

```typescript
const { mode } = readSiteMode()
if (mode === 'development') redirect('/en-desarrollo')
```

The final top of the file should look like:

```typescript
import { Metadata } from 'next'
import { redirect }     from 'next/navigation'
import { readSiteMode } from '@/lib/system/site-mode'
// ... (existing imports unchanged)

export const dynamic = 'force-dynamic'
// (remove the old: export const revalidate = 86400)

export const metadata: Metadata = buildHomeMetadata()

export default function HomePage() {
  const { mode } = readSiteMode()
  if (mode === 'development') redirect('/en-desarrollo')

  // ... rest of function unchanged
```

### 4b — `app/categorias/page.tsx`

- [ ] **Step 1: Replace `revalidate`, add import + check**

```typescript
// REMOVE:
export const revalidate = 86400

// ADD (at top with other imports):
import { readSiteMode } from '@/lib/system/site-mode'
import { redirect }     from 'next/navigation'
export const dynamic = 'force-dynamic'
```

At the START of `CategoriasPage()` body:

```typescript
const { mode } = readSiteMode()
if (mode === 'development') redirect('/en-desarrollo')
```

### 4c — `app/categorias/[slug]/page.tsx`

- [ ] **Step 1: Replace `revalidate`, add import + check**

```typescript
// REMOVE:
export const revalidate = 86400

// ADD (at top with other imports):
import { readSiteMode } from '@/lib/system/site-mode'
import { redirect }     from 'next/navigation'
export const dynamic = 'force-dynamic'
```

Keep `generateStaticParams` exactly as is — it continues to work with `force-dynamic` (params define valid slugs; pages render dynamically).

At the START of the default export page function body (after the `params` destructure):

```typescript
const { mode } = readSiteMode()
if (mode === 'development') redirect('/en-desarrollo')
```

### 4d — `app/productos/page.tsx`

- [ ] **Step 1: Replace `revalidate`, add import + check**

```typescript
// REMOVE:
export const revalidate = 86400

// ADD:
import { readSiteMode } from '@/lib/system/site-mode'
import { redirect }     from 'next/navigation'
export const dynamic = 'force-dynamic'
```

At the START of `ProductosPage()` body (before the `query` destructure):

```typescript
const { mode } = readSiteMode()
if (mode === 'development') redirect('/en-desarrollo')
```

### 4e — `app/productos/[asin]/page.tsx`

- [ ] **Step 1: Replace `revalidate`, add import + check**

```typescript
// REMOVE:
export const revalidate = 3600

// ADD:
import { readSiteMode } from '@/lib/system/site-mode'
import { redirect }     from 'next/navigation'
export const dynamic = 'force-dynamic'
```

Keep `generateStaticParams`, `dynamicParams = false`, and all other exports unchanged.

At the START of the default export page function body:

```typescript
const { mode } = readSiteMode()
if (mode === 'development') redirect('/en-desarrollo')
```

### 4f — `app/ofertas/page.tsx`

- [ ] **Step 1: Replace `revalidate`, add import + check**

```typescript
// REMOVE:
export const revalidate = 86400

// ADD:
import { readSiteMode } from '@/lib/system/site-mode'
import { redirect }     from 'next/navigation'
export const dynamic = 'force-dynamic'
```

At the START of `OfertasPage()` body:

```typescript
const { mode } = readSiteMode()
if (mode === 'development') redirect('/en-desarrollo')
```

### 4g — `app/top-ventas/page.tsx`

- [ ] **Step 1: Replace `revalidate`, add import + check**

```typescript
// REMOVE:
export const revalidate = 86400

// ADD:
import { readSiteMode } from '@/lib/system/site-mode'
import { redirect }     from 'next/navigation'
export const dynamic = 'force-dynamic'
```

At the START of `TopVentasPage()` body:

```typescript
const { mode } = readSiteMode()
if (mode === 'development') redirect('/en-desarrollo')
```

- [ ] **Step 2: TypeScript check after all 7 pages**

```powershell
cd C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice
npx tsc --noEmit
```

Expected: no output, exit 0.

---

## Task 5: Admin UI — SiteModeToggle + System page

**Files:**
- Create: `components/admin/SiteModeToggle.tsx`
- Create: `app/admin/system/page.tsx`

### 5a — `components/admin/SiteModeToggle.tsx`

- [ ] **Step 1: Create the Client Component**

```typescript
'use client'

import { useState } from 'react'
import type { SiteMode } from '@/lib/system/site-mode'

interface Props {
  currentMode: SiteMode
}

export function SiteModeToggle({ currentMode }: Props) {
  const [mode,    setMode]    = useState<SiteMode>(currentMode)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const targetMode: SiteMode = mode === 'public' ? 'development' : 'public'

  async function handleToggle() {
    if (!confirm(
      targetMode === 'development'
        ? '¿Activar modo DEVELOPMENT? Las rutas públicas quedarán inaccesibles para visitantes.'
        : '¿Activar modo PUBLIC? El sitio volverá a ser accesible para todos.'
    )) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/system/site-mode', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ mode: targetMode }),
      })
      const data = await res.json() as { ok: boolean; current?: string; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Error desconocido')
      setMode(targetMode)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cambiar el modo')
    } finally {
      setLoading(false)
    }
  }

  const isPublic = mode === 'public'

  return (
    <div className="space-y-4">

      {/* Current mode badge */}
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
          isPublic
            ? 'bg-green-100 text-green-700'
            : 'bg-yellow-100 text-yellow-700'
        }`}>
          <span className={`w-2 h-2 rounded-full ${isPublic ? 'bg-green-500' : 'bg-yellow-500'}`} />
          {isPublic ? 'PUBLIC' : 'DEVELOPMENT'}
        </span>
        <span className="text-[11px] text-gray-400">
          {isPublic
            ? 'Sitio activo — rutas públicas accesibles'
            : 'Sitio en desarrollo — tráfico público redirigido'}
        </span>
      </div>

      {/* Toggle button */}
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${
          isPublic
            ? 'border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
            : 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
        }`}
      >
        {loading ? '…' : isPublic ? '⟳ Activar DEVELOPMENT' : '⟳ Activar PUBLIC'}
      </button>

      {error && (
        <p className="text-xs text-red-600 font-medium">{error}</p>
      )}
    </div>
  )
}
```

### 5b — `app/admin/system/page.tsx`

- [ ] **Step 1: Create the admin page**

```typescript
/**
 * app/admin/system/page.tsx — Site Mode Control
 *
 * Allows admins to toggle between PUBLIC and DEVELOPMENT mode.
 * In DEVELOPMENT mode all public routes redirect to /en-desarrollo.
 */

import type { Metadata } from 'next'
import { readSiteMode }  from '@/lib/system/site-mode'
import { SiteModeToggle } from '@/components/admin/SiteModeToggle'
import { SectionHeader, Card } from '@/components/admin/shared'

export const dynamic  = 'force-dynamic'
export const metadata: Metadata = { title: 'Sistema — GOODPRICE Internal' }

const PUBLIC_ROUTES = [
  '/',
  '/categorias',
  '/categorias/[slug]',
  '/productos',
  '/productos/[asin]',
  '/ofertas',
  '/top-ventas',
]

const EXEMPT_ROUTES = [
  '/admin/*',
  '/api/health',
  '/api/readiness',
  '/en-desarrollo',
]

export default function SystemPage() {
  const state = readSiteMode()

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-base font-bold text-gray-900">
            <span className="text-[#F7A823]">GOOD</span>PRICE
            <span className="text-gray-300 font-light mx-2">/</span>
            <span className="text-gray-500 font-normal">Sistema</span>
          </h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Control de acceso público al sitio
          </p>
        </div>
        <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-400 border border-gray-200">
          🔒 INTERNAL
        </span>
      </div>

      {/* Mode Control */}
      <section>
        <SectionHeader>Modo del sitio</SectionHeader>
        <Card>
          <p className="text-[11px] text-gray-400 mb-4">
            Controla si el sitio está abierto al público o en desarrollo.
            El cambio es inmediato — no requiere redeploy.
          </p>
          <SiteModeToggle currentMode={state.mode} />
          {state.updatedAt && (
            <div className="mt-4 pt-4 border-t border-gray-100 text-[10px] text-gray-400 space-y-0.5">
              <p>Último cambio: <span className="font-mono text-gray-500">{state.updatedAt}</span></p>
              {state.previousMode && (
                <p>Modo anterior: <span className="font-medium text-gray-500 uppercase">{state.previousMode}</span></p>
              )}
            </div>
          )}
        </Card>
      </section>

      {/* Affected routes */}
      <section>
        <SectionHeader>Rutas afectadas</SectionHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
              Redirigidas en DEVELOPMENT
            </p>
            <ul className="space-y-1">
              {PUBLIC_ROUTES.map(r => (
                <li key={r} className="text-[11px] font-mono text-gray-500">{r}</li>
              ))}
            </ul>
          </Card>
          <Card>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
              Siempre accesibles
            </p>
            <ul className="space-y-1">
              {EXEMPT_ROUTES.map(r => (
                <li key={r} className="text-[11px] font-mono text-green-600">{r}</li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```powershell
cd C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice
npx tsc --noEmit
```

Expected: no output, exit 0.

---

## Task 6: Wire System module into Admin Dashboard

**Files:**
- Modify: `app/admin/page.tsx` (around line 76 — the `moduleCards` array)

- [ ] **Step 1: Add System card to `moduleCards` array in `app/admin/page.tsx`**

Find the `moduleCards` array definition (starts at line ~76). Add the System card as the last item:

```typescript
// Add after the last existing card (analytics):
{
  href:  '/admin/system',
  icon:  '⚙',
  title: 'Sistema',
  desc:  'Modo del sitio: PUBLIC / DEVELOPMENT',
  metric: 'Site Mode Control',
  metricColor: 'text-gray-500',
},
```

The full array after modification ends with:

```typescript
    {
      href:  '/admin/analytics',
      icon:  '▲',
      title: 'Analytics',
      desc:  'Clicks, ClickShare, engagement por categoría',
      metric: 'Métricas de tráfico',
      metricColor: 'text-indigo-600',
    },
    {
      href:  '/admin/system',
      icon:  '⚙',
      title: 'Sistema',
      desc:  'Modo del sitio: PUBLIC / DEVELOPMENT',
      metric: 'Site Mode Control',
      metricColor: 'text-gray-500',
    },
  ]
```

- [ ] **Step 2: TypeScript check**

```powershell
cd C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice
npx tsc --noEmit
```

Expected: no output, exit 0.

---

## Task 7: Full validation

- [ ] **Step 1: TypeScript — clean compile**

```powershell
cd C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice
npx tsc --noEmit
```

Expected: no output, exit 0.

- [ ] **Step 2: Build**

```powershell
cd C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice
npm run build 2>&1
```

Expected: build completes without TypeScript errors. Note: pages that were ISR will now show as λ (dynamic) instead of ○ (static) in the build output.

- [ ] **Step 3: Verify current mode is PUBLIC**

```powershell
node -e "
const d = JSON.parse(require('fs').readFileSync('data/system/site-mode.json','utf8'));
console.log('mode:', d.mode);
if (d.mode !== 'public') process.exit(1);
console.log('OK — site is PUBLIC');
"
```

Expected: `mode: public` / `OK — site is PUBLIC`

- [ ] **Step 4: Verify dev server — PUBLIC mode (all routes render)**

Start dev server: `npm run dev`

Manually verify in browser:
- `http://localhost:3000/` → renders home page (not redirect)
- `http://localhost:3000/categorias` → renders categories
- `http://localhost:3000/ofertas` → renders offers
- `http://localhost:3000/admin` → requires login (unchanged)
- `http://localhost:3000/en-desarrollo` → renders development page directly

- [ ] **Step 5: Switch to DEVELOPMENT via API**

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/system/site-mode" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"mode":"development"}'
```

Expected:
```json
{ "ok": true, "previous": "public", "current": "development", "updatedAt": "..." }
```

- [ ] **Step 6: Verify DEVELOPMENT mode — public routes redirect**

```powershell
# Should return 307 redirect to /en-desarrollo
$r = Invoke-WebRequest -Uri "http://localhost:3000/" -MaximumRedirection 0 -ErrorAction SilentlyContinue
Write-Host "Status:" $r.StatusCode
Write-Host "Location:" $r.Headers.Location
```

Expected: `Status: 307` / `Location: /en-desarrollo`

Manually verify in browser:
- `http://localhost:3000/` → redirects to `/en-desarrollo`
- `http://localhost:3000/categorias` → redirects to `/en-desarrollo`
- `http://localhost:3000/en-desarrollo` → renders development page
- `http://localhost:3000/admin` → still accessible (login page or dashboard)
- `http://localhost:3000/api/health` → still returns health JSON

- [ ] **Step 7: Switch back to PUBLIC via admin UI**

In browser, go to `http://localhost:3000/admin/system`. Verify:
- Current mode shows DEVELOPMENT badge
- Click "Activar PUBLIC" button
- Confirm the dialog
- Badge changes to PUBLIC without page reload

Then verify `http://localhost:3000/` renders normally again.

- [ ] **Step 8: Verify PUBLIC mode restored**

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/system/site-mode" -Method GET
```

Expected: `mode: public`

- [ ] **Step 9: Integrity check — confirm 0 issues**

```powershell
cd C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice
npx tsx --tsconfig tsconfig.json scripts/catalog-integrity.ts
```

Expected: `✓ INTEGRITY OK` — site mode system does not affect catalog integrity.

---

## Self-Review

**Spec coverage:**
- ✅ States: PUBLIC and DEVELOPMENT only — implemented
- ✅ PUBLIC: all routes function normally — `readSiteMode()` returns 'public', no redirect
- ✅ DEVELOPMENT: `/`, `/categorias/*`, `/productos/*`, `/ofertas`, `/top-ventas` redirect — 7 pages modified
- ✅ DEVELOPMENT: `/admin/*`, `/api/health`, `/api/readiness` NOT affected — middleware handles admin, health routes not modified, `force-dynamic` only on public pages
- ✅ Persistence: `data/system/site-mode.json` — created in Task 1
- ✅ No env vars — uses only `fs`
- ✅ No hardcoded flags — reads from JSON at render time
- ✅ Change without redeploy — `force-dynamic` + `readSiteMode()` on every request
- ✅ `/en-desarrollo` page — visual premium, GOODPRICE branding, OPS button — Task 2
- ✅ Admin UI in Admin panel — `app/admin/system/page.tsx` — Task 5
- ✅ Shows current mode — badge in `SiteModeToggle`
- ✅ Allows switching — POST to API via `SiteModeToggle`
- ✅ Requires valid admin session — `isAdminRequest` in POST handler
- ✅ Records previousMode + updatedAt — stored in JSON, displayed in admin page
- ✅ Validates input — API rejects anything other than 'public' or 'development'
- ✅ Fallback to PUBLIC if file missing — `readSiteMode()` returns 'public' on any error

**Placeholder scan:** No TBDs, no "implement later", all code blocks complete.

**Type consistency:**
- `SiteMode = 'public' | 'development'` — defined in Task 1, used in Tasks 3, 5
- `SiteModeState = { mode, updatedAt, previousMode }` — defined in Task 1, returned by API in Task 3, read in Task 5b
- `readSiteMode()` returns `SiteModeState` — consistent across all tasks
- `setSiteMode(newMode: SiteMode)` — called in Task 3 only
- `SiteModeToggle` props: `{ currentMode: SiteMode }` — defined in Task 5a, used in Task 5b
