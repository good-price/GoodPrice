#!/usr/bin/env tsx
/**
 * scripts/catalog-check-imports.ts
 *
 * Detects unsafe catalog imports in public-facing code.
 *
 * UNSAFE patterns in app/ and components/:
 *   - Importing getColombiaProducts from @/data/catalog
 *   - Importing getAllProducts from @/data/catalog
 *   - Importing getRawProducts from @/data/catalog
 *   - Direct use of REGISTRY identifier (outside data/catalog/)
 *
 * SAFE (allowed in all files):
 *   - Importing from @/lib/catalog/public (getPublicProducts, etc.)
 *   - Importing from @/data/products (getFeatured, getTopSellers, etc.)
 *   - getRawProducts in scripts/ and lib/ (internal pipeline use)
 *   - getAllProducts in lib/catalog/integrity.ts (integrity audit only)
 *
 * Usage:
 *   npm run catalog:check
 *   npx tsx scripts/catalog-check-imports.ts
 *
 * Exit codes:
 *   0  no violations
 *   1  unsafe imports found
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

// ── Configuration ─────────────────────────────────────────────────────────────

/** Directories to scan for unsafe imports */
const SCAN_DIRS = ['app', 'components']

/**
 * Path prefixes to SKIP — these are internal/admin surfaces that legitimately
 * need the raw catalog (validation, health checks, audit, sync).
 * Only public-facing UI code (pages, components) must use the public catalog.
 */
const SKIP_PREFIXES = [
  'app/api/',             // All API routes are internal — allowed raw access
  'app/admin/',           // Admin dashboard — intentionally bypasses public filter
]

/** Patterns that are UNSAFE in public-facing code */
interface UnsafePattern {
  pattern: RegExp
  code: string
  message: string
  suggestion: string
}

const UNSAFE_PATTERNS: UnsafePattern[] = [
  {
    pattern: /import\s*\{[^}]*\bgetColombiaProducts\b[^}]*\}\s*from\s*['"]@\/data\/catalog['"]/,
    code: 'UNSAFE_GET_COLOMBIA',
    message: 'getColombiaProducts() bypasses the public safety filter',
    suggestion: "Use getPublicProducts() from '@/lib/catalog/public' instead",
  },
  {
    pattern: /import\s*\{[^}]*\bgetAllProducts\b[^}]*\}\s*from\s*['"]@\/data\/catalog['"]/,
    code: 'UNSAFE_GET_ALL',
    message: 'getAllProducts() exposes inactive and Colombia-restricted products',
    suggestion: "Use getPublicProducts() from '@/lib/catalog/public' instead",
  },
  {
    pattern: /import\s*\{[^}]*\bgetRawProducts\b[^}]*\}\s*from\s*['"]@\/data\/catalog['"]/,
    code: 'UNSAFE_GET_RAW',
    message: 'getRawProducts() returns raw unfiltered catalog',
    suggestion: "Use getPublicProducts() from '@/lib/catalog/public' instead",
  },
  {
    pattern: /\bREGISTRY\b/,
    code: 'UNSAFE_REGISTRY',
    message: 'Direct REGISTRY access bypasses all public safety gates',
    suggestion: "Use getPublicProducts() from '@/lib/catalog/public'",
  },
]

// ── File discovery ─────────────────────────────────────────────────────────────

function walkDir(dir: string): string[] {
  const files: string[] = []
  if (!require('fs').existsSync(dir)) return files

  const entries = readdirSync(dir)
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      // Skip node_modules, .next, build artifacts
      if (!['node_modules', '.next', 'dist', '.git'].includes(entry)) {
        files.push(...walkDir(fullPath))
      }
    } else if (stat.isFile() && /\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath)
    }
  }
  return files
}

// ── Violation type ─────────────────────────────────────────────────────────────

interface Violation {
  file: string
  line: number
  code: string
  message: string
  suggestion: string
  snippet: string
}

// ── Scanner ────────────────────────────────────────────────────────────────────

function scanFile(filePath: string, root: string): Violation[] {
  const violations: Violation[] = []

  let content: string
  try {
    content = readFileSync(filePath, 'utf8')
  } catch { return violations }

  const lines = content.split('\n')
  const relPath = relative(root, filePath).replace(/\\/g, '/')

  // Skip internal/admin paths — they legitimately use the raw catalog
  if (SKIP_PREFIXES.some(prefix => relPath.startsWith(prefix))) {
    return violations
  }

  for (const pattern of UNSAFE_PATTERNS) {
    // Check line by line for better location reporting
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Skip comment lines
      if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue

      if (pattern.pattern.test(line)) {
        // Additional context: REGISTRY is allowed in data/catalog/ files
        if (pattern.code === 'UNSAFE_REGISTRY') {
          if (relPath.startsWith('data/catalog/')) continue
          if (relPath.startsWith('lib/catalog/integrity')) continue
        }

        violations.push({
          file: relPath,
          line: i + 1,
          code: pattern.code,
          message: pattern.message,
          suggestion: pattern.suggestion,
          snippet: line.trim().slice(0, 120),
        })
      }
    }
  }

  return violations
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const root = process.cwd()
  const allViolations: Violation[] = []

  for (const dir of SCAN_DIRS) {
    const dirPath = join(root, dir)
    const files = walkDir(dirPath)
    for (const file of files) {
      allViolations.push(...scanFile(file, root))
    }
  }

  // ── Output ──────────────────────────────────────────────────────────────────
  const C = {
    reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
  }

  console.log()
  console.log(`${C.bold}${C.cyan}GOODPRICE — Catalog Import Safety Check${C.reset}`)
  console.log(`${C.dim}Scanning: ${SCAN_DIRS.join(', ')}${C.reset}`)
  console.log()

  if (allViolations.length === 0) {
    console.log(`\x1b[32m\x1b[1m✓ All clear — no unsafe catalog imports found\x1b[0m`)
    console.log()
    process.exit(0)
  }

  // Group by file
  const byFile = new Map<string, Violation[]>()
  for (const v of allViolations) {
    const list = byFile.get(v.file) ?? []
    list.push(v)
    byFile.set(v.file, list)
  }

  for (const [file, violations] of Array.from(byFile.entries())) {
    console.log(`${C.bold}${file}${C.reset}`)
    for (const v of violations) {
      console.log(`  ${C.red}✗${C.reset}  Line ${v.line}: [${C.dim}${v.code}${C.reset}] ${v.message}`)
      console.log(`     ${C.dim}${v.snippet}${C.reset}`)
      console.log(`     ${C.yellow}→ ${v.suggestion}${C.reset}`)
    }
    console.log()
  }

  console.log('─'.repeat(60))
  console.log(`  ${C.red}${allViolations.length} violation${allViolations.length !== 1 ? 's' : ''}${C.reset} in ${byFile.size} file${byFile.size !== 1 ? 's' : ''}`)
  console.log(`  ${C.yellow}Fix: use getPublicProducts() / getPublicProductByAsin() / getPublicCategoryProducts() from '@/lib/catalog/public'${C.reset}`)
  console.log()

  process.exit(1)
}

main().catch(err => {
  console.error('\x1b[31mError running catalog:check:\x1b[0m', err)
  process.exit(1)
})
