# GOODPRICE — Catalog V2 Baseline Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Archive the 4 legacy audit reports (covering the old 200-product catalog), generate the first official V2 baseline audit report (99 products, offline mode), and resync the integrity snapshot — all without modifying catalog logic, Discovery, Validator, Title Intelligence, or any product data.

**Architecture:** The audit loader in `lib/catalog/public.ts` and `lib/catalog/integrity.ts` both use `readdirSync('data/audit/reports').filter(f => f.endsWith('.json'))` — they scan only the direct directory, not subdirectories. Moving legacy reports to `data/audit/reports/legacy/` makes them invisible to all loaders. After archiving, running the audit-runner in `--offline` mode generates a new report covering exactly the 99 current V2 products. The integrity CLI then regenerates the snapshot with `--save`.

**Tech Stack:** Node.js / PowerShell file moves · `npx tsx` (already installed) · `scripts/audit-runner.ts` · `scripts/catalog-integrity.ts`

---

## Pre-flight verification

Before starting, verify the project compiles cleanly:

- [ ] **Verify TypeScript**

```powershell
cd C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice
npx tsc --noEmit
```

Expected: no output, exit 0. If errors exist, record them — do NOT fix them as part of this plan.

---

## Task 1: Create `legacy/` directory and move legacy reports

**Files:**
- Move: `data/audit/reports/audit-1779859610982-c6lccv.json` → `data/audit/reports/legacy/`
- Move: `data/audit/reports/audit-1779859629997-eags1t.json` → `data/audit/reports/legacy/`
- Move: `data/audit/reports/audit-1779861122783-ur842z.json` → `data/audit/reports/legacy/`
- Move: `data/audit/reports/latest.json` → `data/audit/reports/legacy/`

**Why:** These 4 files cover the old 200-product catalog. 85 of those product IDs overlap with V2 IDs but point to completely different ASINs. The Gate 6/7 loaders currently read scores from these wrong products. Moving to a subdirectory makes them invisible to the loaders.

- [ ] **Step 1: Create the `legacy/` subdirectory**

```powershell
New-Item -ItemType Directory -Force "C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice\data\audit\reports\legacy"
```

Expected: directory created (or already exists).

- [ ] **Step 2: Move the 4 legacy files**

```powershell
$src = "C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice\data\audit\reports"
$dst = "$src\legacy"
Move-Item "$src\audit-1779859610982-c6lccv.json" $dst
Move-Item "$src\audit-1779859629997-eags1t.json" $dst
Move-Item "$src\audit-1779861122783-ur842z.json" $dst
Move-Item "$src\latest.json" $dst
```

Expected: no errors, files are now in `legacy/`.

- [ ] **Step 3: Verify the reports directory is now empty of .json files**

```powershell
Get-ChildItem "C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice\data\audit\reports" -Filter "*.json"
```

Expected: no output (zero `.json` files in the direct directory).

- [ ] **Step 4: Verify legacy files are preserved**

```powershell
Get-ChildItem "C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice\data\audit\reports\legacy"
```

Expected: 4 files listed (`audit-1779859610982-c6lccv.json`, `audit-1779859629997-eags1t.json`, `audit-1779861122783-ur842z.json`, `latest.json`).

---

## Task 2: Verify loader isolation

Confirm the Gate 6/7 loaders now see an empty reports directory (no legacy contamination).

**Files:**
- Read-only: `lib/catalog/public.ts` (loadAuditHistory, loadLatestAuditScores)
- Read-only: `lib/catalog/integrity.ts` (getLastAuditInfo)

- [ ] **Step 1: Quick Node.js check — confirm readdirSync sees zero .json files**

```powershell
node -e "const fs=require('fs'),p=require('path'); const d=p.join(process.cwd(),'data','audit','reports'); const files=fs.readdirSync(d).filter(f=>f.endsWith('.json')); console.log('JSON files in reports/:', files.length, files);"
```

Run from: `C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice`

Expected output: `JSON files in reports/: 0 []`

If output shows files, STOP — Task 1 did not complete correctly.

---

## Task 3: Generate V2 baseline audit report (offline)

Run the audit-runner in offline mode. It loads all products from `data/catalog/*.ts` (currently 99 V2 products), skips all network checks, and saves to `data/audit/reports/<runId>.json` + `data/audit/reports/latest.json`.

**Files:**
- Creates: `data/audit/reports/audit-<timestamp>-<random>.json`
- Creates: `data/audit/reports/latest.json`

- [ ] **Step 1: Run the audit-runner in offline mode**

```powershell
cd C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice
npx tsx --tsconfig tsconfig.json scripts/audit-runner.ts --offline
```

Expected output (last lines):
```
[audit] 99 productos · score avg XX/100 · A:XX B:XX C:XX D:0 F:0
  ⚠ ASIN inválido: 0
  ⚠ Amazon 404: 0
  ⚠ Imagen rota: 0
  ...
Reporte completo guardado en: ...data/audit/reports/audit-<timestamp>-<random>.json
```

Key checks:
- `99 productos` — confirms all V2 products loaded
- `D:0 F:0` — no critical products (all V2 products validated)
- `ASIN inválido: 0` — all ASINs pass format check
- A `.json` file appears in `data/audit/reports/`

If product count is NOT 99, STOP and investigate what `getRawProducts()` from `data/catalog/index.ts` returns.

- [ ] **Step 2: Verify two new files exist in reports/**

```powershell
Get-ChildItem "C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice\data\audit\reports" -Filter "*.json" | Select-Object Name, LastWriteTime
```

Expected: 2 files — `audit-<timestamp>-<random>.json` and `latest.json`, both created just now.

- [ ] **Step 3: Quick sanity check on latest.json**

```powershell
node -e "const r=JSON.parse(require('fs').readFileSync('data/audit/reports/latest.json','utf8')); console.log('totalProducts:', r.totalProducts, '| avgScore:', r.averageScore, '| runId:', r.runId);"
```

Run from: `C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice`

Expected: `totalProducts: 99 | avgScore: <number> | runId: audit-<timestamp>-<random>`

---

## Task 4: Regenerate integrity snapshot

The integrity snapshot at `data/catalog/integrity-snapshot.json` is currently missing the `totalProducts` field and was generated before the audit baseline existed. Regenerate it so `auditScore` (freshness component, 0-20) is computed correctly with the new report.

**Files:**
- Overwrites: `data/catalog/integrity-snapshot.json`

- [ ] **Step 1: Run the integrity CLI with --save**

```powershell
cd C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice
npx tsx --tsconfig tsconfig.json scripts/catalog-integrity.ts --save
```

Expected output:
- Score breakdown shows `auditScore` > 0 (freshness: just generated)
- `✓ Snapshot guardado → data/catalog/integrity-snapshot.json`
- `✓ INTEGRITY OK` (exit 0)

The snapshot should report `totalProducts: 99`, `publicProducts: 99`, `hiddenProducts: 0`.

If it exits 1 with integrity errors (red ✗ lines), investigate before continuing.

- [ ] **Step 2: Verify snapshot has all required fields**

```powershell
node -e "const s=JSON.parse(require('fs').readFileSync('data/catalog/integrity-snapshot.json','utf8')); console.log(JSON.stringify(s,null,2));"
```

Run from: `C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice`

Expected: JSON with all 8 fields present:
```json
{
  "generatedAt": "2026-06-15T...",
  "score": <90+>,
  "grade": "A",
  "totalProducts": 99,
  "publicProducts": 99,
  "hiddenProducts": 0,
  "staleImages": 0,
  "issueCount": 0
}
```

---

## Task 5: Final validation

Run TypeScript check and integrity check together to confirm nothing is broken.

- [ ] **Step 1: TypeScript check — no new errors**

```powershell
cd C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice
npx tsc --noEmit
```

Expected: no output, exit 0. Any errors not present in the pre-flight check are regressions to investigate.

- [ ] **Step 2: Integrity check in strict mode**

```powershell
npx tsx --tsconfig tsconfig.json scripts/catalog-integrity.ts --strict
```

Expected:
- Score ≥ 70 (strict mode)
- No red ✗ lines
- Exit 0

- [ ] **Step 3: Verify legacy files are still intact (not deleted)**

```powershell
Get-ChildItem "C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice\data\audit\reports\legacy" | Select-Object Name
```

Expected: 4 files still present.

- [ ] **Step 4: Summarize final state**

Run both checks one final time and record the output:

```powershell
node -e "
const r=JSON.parse(require('fs').readFileSync('data/audit/reports/latest.json','utf8'));
const s=JSON.parse(require('fs').readFileSync('data/catalog/integrity-snapshot.json','utf8'));
console.log('=== V2 BASELINE ===');
console.log('Audit report: ', r.runId);
console.log('Products audited:', r.totalProducts);
console.log('Avg score:', r.averageScore);
console.log('Grade dist: A:', r.gradeDistribution.A, 'B:', r.gradeDistribution.B, 'C:', r.gradeDistribution.C, 'D:', r.gradeDistribution.D, 'F:', r.gradeDistribution.F);
console.log('--- Integrity ---');
console.log('Score:', s.score, '/', 100, '| Grade:', s.grade);
console.log('Total products:', s.totalProducts, '| Public:', s.publicProducts);
console.log('Hidden:', s.hiddenProducts, '| Stale images:', s.staleImages);
"
```

Run from: `C:\Users\pombo\OneDrive\Documents\GOODPRICE\goodprice`

---

## Done criteria

- [ ] `data/audit/reports/` has exactly 2 files: `audit-<timestamp>-<random>.json` and `latest.json`, both covering 99 V2 products
- [ ] `data/audit/reports/legacy/` has exactly 4 files (the old 200-product reports)
- [ ] `data/catalog/integrity-snapshot.json` has `totalProducts: 99`, all 8 required fields, and score ≥ 90
- [ ] `npx tsc --noEmit` exits 0
- [ ] `scripts/catalog-integrity.ts --strict` exits 0
- [ ] No catalog `.ts` files were modified
- [ ] No `lib/` files were modified
