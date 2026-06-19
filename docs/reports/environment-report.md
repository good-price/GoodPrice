# GOODPRICE — Environment Report

Date: 2026-06-19
Phase: FASE 4 — Auditoría de Variables de Entorno

---

## Local Env Files

| File | Status |
|---|---|
| .env | ABSENT (expected) |
| .env.local | EXISTS |
| .env.production | ABSENT (expected — secrets in Vercel) |
| .env.production.local | ABSENT (expected) |

---

## Required Variables — Local Presence

| Variable | Local (.env.local) | Notes |
|---|---|---|
| NEXT_PUBLIC_SITE_URL | ✓ present | Public, safe in local file |
| NEXT_PUBLIC_GA_ID | ✗ not in local | Must be configured in Vercel |
| CRON_SECRET | ✗ not in local | Secret — must be in Vercel env vars |
| ANALYTICS_SECRET | ✗ not in local | Secret — must be in Vercel env vars |
| CATALOG_VALIDATE_SECRET | ✗ not in local | Secret — must be in Vercel env vars |
| PAAPI_ACCESS_KEY | ✗ not in local | Secret — must be in Vercel env vars |
| PAAPI_SECRET_KEY | ✗ not in local | Secret — must be in Vercel env vars |
| PAAPI_PARTNER_TAG | ✗ not in local | Required for Amazon PA-API |

**Note:** The 6 missing secrets are intentionally absent from local files.
They must be configured in the Vercel project's Environment Variables
settings before deploy. Vercel injects them at build and runtime.

---

## vercel.json — Cron Configuration

```json
{
  "crons": [
    { "path": "/api/pricing/check",      "schedule": "0 6 * * *"  },
    { "path": "/api/alerts/detect",      "schedule": "0 7 * * *"  },
    { "path": "/api/catalog/audit/daily","schedule": "30 8 * * *" },
    { "path": "/api/audit/run",          "schedule": "0 9 1 * *"  },
    { "path": "/api/paapi/sync",         "schedule": "0 9 * * 1"  },
    { "path": "/api/currency/update",    "schedule": "0 8 * * *"  }
  ]
}
```

All cron endpoints are protected by `CRON_SECRET` (Bearer token).
In development, NODE_ENV=development skips auth checks.

---

## Pre-Deploy Vercel Configuration Checklist

Before deploying, configure in Vercel Dashboard → Project → Settings → Environment Variables:

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | ✅ | Canonical URL for SEO/sitemap |
| `NEXT_PUBLIC_GA_ID` | ✅ | Google Analytics (G-XXXXXXXXXX) |
| `CRON_SECRET` | ✅ | Protects all cron-triggered API routes |
| `ANALYTICS_SECRET` | ✅ | Protects /api/analytics write endpoints |
| `CATALOG_VALIDATE_SECRET` | ✅ | Protects catalog mutation routes |
| `AUDIT_SECRET` | ✅ | Protects /api/audit/run, /api/ops/run |
| `PAAPI_ACCESS_KEY` | ✅ | Amazon PA-API access key |
| `PAAPI_SECRET_KEY` | ✅ | Amazon PA-API secret key |
| `PAAPI_PARTNER_TAG` | ✅ | Amazon affiliate tag (upgoodprice-20) |

---

## Security Notes

- All secrets are server-side only (no NEXT_PUBLIC_ prefix)
- Admin auth uses daily-rotating password — no plaintext storage
- CSP does not include `unsafe-eval` (GTM limitation — LOW severity)
- Open-redirect protection: `sanitiseNext()` limits `?next=` to `/admin/*`
