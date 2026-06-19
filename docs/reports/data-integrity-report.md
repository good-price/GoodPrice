# GOODPRICE — Data Integrity Report

Date: 2026-06-19
Phase: FASE 3 — Verificación de Stores y Datos

---

## JSON Store Validation

| Store | Status | Size | Notes |
|---|---|---|---|
| runtime-catalog.json | ✅ VALID | 121.4 KB | 154 products, totalProducts=154, 0 dupes |
| category-config.json | ✅ VALID | 0.4 KB | 10 categories configured |
| catalog-execution.json | ✅ VALID | 0.6 KB | isRunning=false (stale lock fixed) |
| lifecycle.json | ✅ VALID | 73.3 KB | 154 entries |
| recommendations.json | ✅ VALID | 56.2 KB | 154 entries |
| alerts.json | ✅ VALID | 0.1 KB | 0 active alerts |
| discovery-state.json | ✅ VALID | 0.4 KB | valid structure |
| automation-state.json | ✅ VALID | 0.5 KB | valid structure |
| master-cycle-state.json | ✅ VALID | 0.4 KB | isRunning=false |
| system-health.json | ✅ VALID | 0.1 KB | healthScore=100 |

---

## Cross-Reference Integrity (validate-data-integrity.ts)

| Check | Result |
|---|---|
| All store readers never throw | ✅ 12/12 PASS |
| runtime-catalog.json parseable | ✅ PASS |
| products is array | ✅ PASS |
| totalProducts === products.length (154) | ✅ PASS |
| All ASINs unique | ✅ PASS — 0 duplicates |
| All IDs unique | ✅ PASS |
| All statuses valid enum | ✅ PASS |
| All categories valid slugs | ✅ PASS |
| All prices non-negative | ✅ PASS |
| All ratings in [0, 5] | ✅ PASS |
| All review counts non-negative | ✅ PASS |
| lifecycle — ASINs in catalog | ✅ PASS — 0 orphans |
| recommendations — ASINs in catalog | ✅ PASS — 0 orphans |
| alerts — ASINs in catalog | ✅ PASS — 0 orphans |
| product-intelligence — ASINs in catalog | ✅ PASS — 0 orphans |
| price-history — ASINs in catalog | ✅ PASS — 0 orphans |
| master-cycle-state has isRunning | ✅ PASS |
| master-cycle-state isRunning=false | ✅ PASS |
| catalog-execution isRunning=false | ✅ PASS (after stale lock fix) |

**Results: 29/29 PASS, 0 FAIL**

---

## Category Distribution

| Category | Products | Minimum | Status |
|---|---|---|---|
| electronica | 15 | 15 | ✅ at minimum |
| gaming | 10 | 10 | ✅ at minimum |
| hogar | 15 | 20 | ⚠️ deficit 5 (PAAPI will resolve) |
| cocina | 15 | 15 | ✅ at minimum |
| deporte | 25 | 25 | ✅ at minimum |
| oficina | 15 | 15 | ✅ at minimum |
| belleza | 10 | 10 | ✅ at minimum |
| mascotas | 20 | 20 | ✅ at minimum |
| bebes | 9 | 20 | ⚠️ deficit 11 (PAAPI will resolve) |
| herramientas | 20 | 20 | ✅ at minimum |
| **TOTAL** | **154** | — | — |

Note: hogar and bebes deficits are expected in RC — 74 candidates exist for bebes;
PAAPI credentials in production will validate and admit them.

---

## E2E Cross-Store Check (validate-e2e.ts)

- Every recommendation ASIN in runtime catalog: ✅
- Every alert ASIN in runtime catalog: ✅
- Every lifecycle entry ASIN in runtime catalog: ✅
- 20/20 tests PASS

---

## Summary

```
Duplicate ASINs:    0
Orphan ASINs:       0
Corrupt stores:     0
Invalid products:   0
Version:            158
Health score:       100
```
