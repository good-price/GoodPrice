/**
 * Post-deploy validation script.
 * Run: npx tsx scripts/validate-deploy.ts https://your-domain.com
 *
 * Exit code 0 → all checks passed
 * Exit code 1 → one or more checks failed
 */

const BASE_URL = process.argv[2]?.replace(/\/$/, '')

if (!BASE_URL || !BASE_URL.startsWith('http')) {
  console.error('Usage: npx tsx scripts/validate-deploy.ts https://your-domain.com')
  process.exit(1)
}

// ── Env var checks (local only — validates Vercel config before deploy) ────────

const ENV_CHECKS: Array<{ name: string; test: () => boolean; hint: string }> = [
  {
    name: 'NEXT_PUBLIC_SITE_URL is not localhost',
    test: () => {
      const url = process.env.NEXT_PUBLIC_SITE_URL ?? ''
      return !!url && !url.includes('localhost') && !url.includes('127.0.0.1')
    },
    hint: 'Set NEXT_PUBLIC_SITE_URL=https://your-domain.com in Vercel env vars',
  },
  {
    name: 'NEXT_PUBLIC_GA_ID starts with G-',
    test: () => (process.env.NEXT_PUBLIC_GA_ID ?? '').startsWith('G-'),
    hint: 'Set NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX in Vercel env vars',
  },
  {
    name: 'GOOGLE_SITE_VERIFICATION is set',
    test: () => !!(process.env.GOOGLE_SITE_VERIFICATION ?? '').trim(),
    hint: 'Get token from Google Search Console → HTML tag method',
  },
  {
    name: 'AUDIT_SECRET is set',
    test: () => !!(process.env.AUDIT_SECRET ?? '').trim(),
    hint: 'Set AUDIT_SECRET=<random-string> in Vercel env vars',
  },
]

// ── HTTP checks ───────────────────────────────────────────────────────────────

interface HttpCheck {
  name:           string
  url:            string
  expectedStatus: number
  bodyContains?:  string
  bodyExcludes?:  string
}

const HTTP_CHECKS: HttpCheck[] = [
  { name: 'Homepage returns 200',           url: '/',                          expectedStatus: 200 },
  { name: '/robots.txt returns 200',        url: '/robots.txt',                expectedStatus: 200, bodyContains: 'Disallow: /admin' },
  { name: '/sitemap.xml returns 200',       url: '/sitemap.xml',               expectedStatus: 200, bodyExcludes: 'localhost' },
  { name: '/productos returns 200',         url: '/productos',                 expectedStatus: 200 },
  { name: '/categorias/electronica 200',   url: '/categorias/electronica',    expectedStatus: 200 },
  { name: '/categorias/herramientas 200',  url: '/categorias/herramientas',   expectedStatus: 200 },
  { name: 'Unknown URL returns 404',        url: '/pagina-que-no-existe-xyz',  expectedStatus: 404 },
  {
    name:           'Homepage has GA4 script',
    url:            '/',
    expectedStatus: 200,
    bodyContains:   'googletagmanager.com/gtag/js',
  },
  {
    name:           'Product page has affiliate tag',
    url:            '/productos/B09X7CRKRZ',
    expectedStatus: 200,
    bodyContains:   'tag=upgoodprice-20',
  },
]

// ── Runner ─────────────────────────────────────────────────────────────────────

type Result = { name: string; pass: boolean; detail?: string }

async function runHttpCheck(check: HttpCheck): Promise<Result> {
  const url = `${BASE_URL}${check.url}`
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (res.status !== check.expectedStatus) {
      return { name: check.name, pass: false, detail: `Got ${res.status}, expected ${check.expectedStatus}` }
    }
    if (check.bodyContains || check.bodyExcludes) {
      const body = await res.text()
      if (check.bodyContains && !body.includes(check.bodyContains)) {
        return { name: check.name, pass: false, detail: `Body missing: "${check.bodyContains}"` }
      }
      if (check.bodyExcludes && body.includes(check.bodyExcludes)) {
        return { name: check.name, pass: false, detail: `Body contains forbidden: "${check.bodyExcludes}"` }
      }
    }
    return { name: check.name, pass: true }
  } catch (err) {
    return { name: check.name, pass: false, detail: String(err) }
  }
}

async function main() {
  console.log(`\nGOODPRICE deploy validation → ${BASE_URL}\n`)

  const results: Result[] = []

  // Env checks (skip in CI when env vars are from Vercel runtime)
  for (const check of ENV_CHECKS) {
    results.push({ name: check.name, pass: check.test(), detail: check.hint })
  }

  // HTTP checks (run in parallel)
  const httpResults = await Promise.all(HTTP_CHECKS.map(runHttpCheck))
  results.push(...httpResults)

  // Print results
  const pass = results.filter(r => r.pass)
  const fail = results.filter(r => !r.pass)

  for (const r of results) {
    const icon = r.pass ? '✅' : '❌'
    const hint = !r.pass && r.detail ? `  → ${r.detail}` : ''
    console.log(`${icon} ${r.name}${hint}`)
  }

  console.log(`\n${pass.length}/${results.length} checks passed`)

  if (fail.length > 0) {
    console.log(`\nFailed checks:`)
    for (const r of fail) {
      console.log(`  - ${r.name}${r.detail ? `: ${r.detail}` : ''}`)
    }
    process.exit(1)
  }

  console.log('\nDeploy validation PASSED. Ready to go live.\n')
}

main().catch(err => {
  console.error('Validation script error:', err)
  process.exit(1)
})
