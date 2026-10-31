# P1 Notes

## P1-1 Security
- `JWT_SECRET` fails closed in production if missing or default.
- Swagger (`/api/docs`) only enabled when `NODE_ENV !== 'production'`.
- Explicit CORS via `CORS_ORIGIN` (comma-separated). Production defaults to disabled if unset.
- Helmet / global rate-limit: not added (no extra deps). Add `@nestjs/throttler` + `helmet` when deploying.

## P1-2 Data
- Duplicate timestamp `1752000000000` resolved: automation workflow is now `1752100000000`.
- Three invoice models are intentional and separate:
  - `invoices` — sales/business invoices
  - `billing_invoices` — subscription billing
  - `auto_invoices` — automation-generated billing
- Migration names `173A` / `173B` are historical; order is by timestamp prefix.

## P1-3 Architecture
- Two workflow engines are distinct:
  - `workflow` — approval instances (Sprint 6) + definition engine (B1)
  - `automation-workflow` — event-driven automation actions
- `rule-engine`, `event-automation`, `scheduled-jobs` complement them.
- Cron runner (`ScheduledJobRunner`) has no HTTP tenant context by design; `runBySystem` uses `job.tenantId`.
- `AppModule` uses both `autoLoadEntities` and explicit entity list for clarity. Prefer explicit list for production predictability.
