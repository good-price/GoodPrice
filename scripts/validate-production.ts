/**
 * scripts/validate-production.ts
 *
 * Sprint 5C — Production Audit.
 *
 * Runs TypeScript, ESLint, secret scan, and build verification.
 *
 * Run: npx tsx --tsconfig tsconfig.scripts.json scripts/validate-production.ts
 */

import { execSync } from 'child_process'

const ROOT = process.cwd()
let passed = 0
let failed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  ✅ ${name}`)
    passed++
  } catch (err) {
    console.error(`  ❌ ${name}`)
    console.error(`     ${err instanceof Error ? err.message : String(err)}`)
    failed++
  }
}

function section(title: string): void {
  console.log(`\n${title}`)
}

function run(cmd: string, timeoutMs = 300_000): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(cmd, {
      cwd:      ROOT,
      encoding: 'utf-8',
      stdio:    ['pipe', 'pipe', 'pipe'],
      timeout:  timeoutMs,
    })
    return { stdout, stderr: '', exitCode: 0 }
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; status?: number }
    return {
      stdout:   err.stdout  ?? '',
      stderr:   err.stderr  ?? '',
      exitCode: err.status  ?? 1,
    }
  }
}

// ── 1. TypeScript ──────────────────────────────────────────────────────────────

section('1. TypeScript — zero errors')

test('npx tsc --noEmit exits 0', () => {
  const { exitCode, stdout, stderr } = run('npx tsc --noEmit')
  if (exitCode !== 0) throw new Error(`TypeScript errors:\n${stdout}\n${stderr}`.trim())
})

// ── 2. ESLint ─────────────────────────────────────────────────────────────────

section('2. ESLint — zero errors')

test('npm run lint exits 0', () => {
  const { exitCode, stdout, stderr } = run('npm run lint')
  if (exitCode !== 0) throw new Error(`Lint errors:\n${stdout}\n${stderr}`.trim())
})

// ── 3. Secret audit ───────────────────────────────────────────────────────────

section('3. Secret audit — no hardcoded credentials')

// Known safe patterns that grep may match but are NOT credentials:
// - process.env.X  (env var reference, not value)
// - export type/interface names containing Key/Token/Secret
// - single-line comments
// - .env.example files
// - test/script filenames in comments
function isLikelySafe(line: string): boolean {
  if (!line.trim()) return true
  if (line.includes('process.env.'))                     return true
  if (line.includes('.env.example'))                     return true
  if (line.includes('validate-production'))              return true
  if (/^\s*(\/\/|\*)/.test(line.split(':').slice(2).join(':'))) return true
  if (/export\s+(type|interface|const)\s+\w*(Key|Token|Secret|Password)\w*/i.test(line)) return true
  if (/^\s*(\/\/|\*|#)/.test(line))                     return true
  return false
}

const SECRET_PATTERNS = ['SECRET=', 'TOKEN=', 'API_KEY=', 'PASSWORD=', 'PRIVATE_KEY=']

for (const pattern of SECRET_PATTERNS) {
  test(`no hardcoded "${pattern}" values`, () => {
    const result = run(
      `git grep -rn "${pattern}" -- ":(exclude)node_modules" ":(exclude).next" ":(exclude).git" ":(exclude)data" ":(exclude)*.example" 2>nul || echo ""`,
      10_000,
    )
    const hits = result.stdout.split('\n').filter(l => l.trim() && !isLikelySafe(l))
    if (hits.length > 0) {
      throw new Error(`Possible hardcoded credential (${hits.length} hits):\n${hits.slice(0, 5).join('\n')}`)
    }
  })
}

// ── 4. Build ──────────────────────────────────────────────────────────────────

section('4. Build — all pages compile cleanly')

test('npm run build exits 0', () => {
  const { exitCode, stderr } = run('npm run build', 300_000)
  if (exitCode !== 0) throw new Error(`Build failed:\n${stderr}`)
})

// ── Results ───────────────────────────────────────────────────────────────────

console.log()
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
