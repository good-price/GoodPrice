/**
 * scripts/validate-release.ts
 *
 * Sprint 5C — Release Check Engine.
 *
 * Single entry point that runs all Sprint 5C validation engines and
 * prints the final RELEASE CHECK table.
 *
 * Run: npx tsx --tsconfig tsconfig.scripts.json scripts/validate-release.ts
 */

import { execSync } from 'child_process'

const ROOT = process.cwd()

interface CheckResult {
  label:  string
  passed: boolean
  notes?: string
}

function runScript(relPath: string, timeoutMs = 300_000): { passed: boolean; output: string } {
  try {
    const output = execSync(
      `npx tsx --tsconfig tsconfig.scripts.json ${relPath}`,
      {
        cwd:      ROOT,
        encoding: 'utf-8',
        stdio:    ['pipe', 'pipe', 'pipe'],
        timeout:  timeoutMs,
      }
    )
    return { passed: true, output }
  } catch (e: unknown) {
    const err = e as { stdout?: string; message?: string }
    return { passed: false, output: err.stdout ?? err.message ?? '' }
  }
}

function runTsc(): boolean {
  try {
    execSync('npx tsc --noEmit', { cwd: ROOT, stdio: 'pipe', timeout: 60_000 })
    return true
  } catch { return false }
}

function runBuild(): boolean {
  try {
    execSync('npm run build', { cwd: ROOT, stdio: 'pipe', timeout: 300_000 })
    return true
  } catch { return false }
}

function runLint(): boolean {
  try {
    execSync('npm run lint', { cwd: ROOT, stdio: 'pipe', timeout: 60_000 })
    return true
  } catch { return false }
}

// ── Run all checks ────────────────────────────────────────────────────────────

console.log('\n🚦 GOODPRICE — RELEASE CHECK\n')

const checks: CheckResult[] = []

function check(label: string, passed: boolean, notes?: string): void {
  checks.push({ label, passed, notes })
  const icon = passed ? '✅' : '❌'
  console.log(`  ${icon}  Running: ${label}`)
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  Pre-flight checks')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

process.stdout.write('  Checking TypeScript...')
const tscOk = runTsc()
console.log(tscOk ? ' PASS' : ' FAIL')
checks.push({ label: 'TypeScript', passed: tscOk })

process.stdout.write('  Checking ESLint...')
const lintOk = runLint()
console.log(lintOk ? ' PASS' : ' FAIL')
checks.push({ label: 'Lint', passed: lintOk })

process.stdout.write('  Running build...')
const buildOk = runBuild()
console.log(buildOk ? ' PASS' : ' FAIL')
checks.push({ label: 'Build', passed: buildOk })

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  Data & Intelligence checks')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

process.stdout.write('  Data integrity...')
const integ = runScript('scripts/validate-data-integrity.ts')
console.log(integ.passed ? ' PASS' : ' FAIL')
checks.push({ label: 'Data Integrity', passed: integ.passed })

process.stdout.write('  Recommendations & Alerts...')
const ra = runScript('scripts/validate-recommendations-alerts.ts')
console.log(ra.passed ? ' PASS' : ' FAIL')
checks.push({ label: 'Recommendations & Alerts', passed: ra.passed })

process.stdout.write('  Product Intelligence...')
const pi = runScript('scripts/validate-product-intelligence.ts')
console.log(pi.passed ? ' PASS' : ' FAIL')
checks.push({ label: 'Product Intelligence', passed: pi.passed })

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  Hardening checks')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

process.stdout.write('  Concurrency...')
const conc = runScript('scripts/validate-concurrency.ts')
console.log(conc.passed ? ' PASS' : ' FAIL')
checks.push({ label: 'Concurrency', passed: conc.passed })

process.stdout.write('  Chaos / Fault Tolerance...')
const chaos = runScript('scripts/validate-chaos.ts')
console.log(chaos.passed ? ' PASS' : ' FAIL')
checks.push({ label: 'Chaos / Fault Tolerance', passed: chaos.passed })

process.stdout.write('  Recovery...')
const rec = runScript('scripts/validate-recovery.ts')
console.log(rec.passed ? ' PASS' : ' FAIL')
checks.push({ label: 'Recovery', passed: rec.passed })

process.stdout.write('  Stress (H2)...')
const stress = runScript('scripts/validate-stress.ts')
console.log(stress.passed ? ' PASS' : ' FAIL')
checks.push({ label: 'Stress (H2)', passed: stress.passed })

process.stdout.write('  E2E (H3)...')
const e2e = runScript('scripts/validate-e2e.ts')
console.log(e2e.passed ? ' PASS' : ' FAIL')
checks.push({ label: 'E2E (H3)', passed: e2e.passed })

process.stdout.write('  Scale (H4)...')
const scale = runScript('scripts/validate-scale.ts')
console.log(scale.passed ? ' PASS' : ' FAIL')
checks.push({ label: 'Scale (H4)', passed: scale.passed })

// ── Print results table ───────────────────────────────────────────────────────

const totalPassed = checks.filter(c => c.passed).length
const total       = checks.length
const score       = Math.round((totalPassed / total) * 100)

console.log('\n')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  RELEASE CHECK RESULTS')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log()

for (const c of checks) {
  const icon   = c.passed ? '✅' : '❌'
  const status = c.passed ? 'PASS' : 'FAIL'
  const label  = c.label.padEnd(32, '.')
  console.log(`  ${icon}  ${label} ${status}${c.notes ? `  ← ${c.notes}` : ''}`)
}

console.log()
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`  Score: ${totalPassed}/${total}  (${score}/100)`)
console.log()

if (score === 100) {
  console.log('  ✅  READY FOR PRODUCTION\n')
} else {
  const failures = checks.filter(c => !c.passed).map(c => c.label)
  console.log(`  ❌  NOT READY — ${failures.length} check(s) failed: ${failures.join(', ')}\n`)
  process.exit(1)
}
