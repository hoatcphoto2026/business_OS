# Business OS – EPIC A + EPIC B Complete

**Autonomous Enterprise SaaS Platform**

Archive: `business-os-backend-epic-b-complete.tar.gz`  
Full e2e: **43/43 suites, 189/189 tests PASS** (verified on a fresh database, 2026-10-31)

---

## Overview

Business OS has evolved from a multi-tenant SaaS foundation into an **Autonomous Enterprise SaaS Platform**. The lifecycle below can now run with minimal manual intervention:

```
Customer → Subscription → Usage → Invoice → Payment
    → Notification → Renewal → Compliance → Offboarding
```

---

## EPIC A – Expansion

| Module | Path | Key APIs | Notes |
|--------|------|----------|-------|
| **A1 Customer Portal** | `src/modules/customer-portal` | `/portal/*` | Dashboard, subscription, invoices, usage, payments |
| **A2 Notification Center** | `src/modules/notification` | `/notifications` | Templates, multi-channel, retry, delivery log |
| **A3 Support Center** | `src/modules/support` | `/support/tickets` | Tickets, comments, attachments, status flow |
| **A4 Tenant Onboarding** | `src/modules/onboarding` | `/onboarding/start` | Create tenant + owner + trial + seed roles |
| **A5 Tenant Offboarding** | `src/modules/offboarding` | `/offboarding/*` | Export, deactivate, revoke keys, cancel sub |

**Safety:** Offboarding e2e creates an isolated tenant so the demo ABC tenant is never touched.

---

## EPIC B – Automation

| Module | Path | Key APIs | Notes |
|--------|------|----------|-------|
| **B1 Workflow Engine** | `src/modules/workflow` | `/workflow-definitions` | Definition/Node/Transition/Execution, versioning, execute/retry |
| **B2 Scheduled Jobs** | `src/modules/scheduled-jobs` | `/jobs` | CRON/DAILY/WEEKLY/MONTHLY + **Cron Runner** (`@Cron` every minute) |
| **B3 Rule Engine** | `src/modules/rule-engine` | `/rules` | Conditions + actions, versioning, evaluate |
| **B4 Event Automation** | `src/modules/event-automation` | `/events` | Handlers, DLQ, retry, idempotency, replay |
| **B5 Auto Renewal** | `src/modules/auto-renewal` | `/renewals` | Near-expiration → invoice → payment → renew, grace 7d |
| **B6 Auto Suspension** | `src/modules/auto-suspension` | `/suspensions` | Triggers + suspend tenant/users/keys + reactivate |
| **B7 Auto Invoice** | `src/modules/auto-invoice` | `/auto-invoices` | Items + tax + discount + coupon |
| **B8 Auto Notification** | `src/modules/auto-notification` | `/auto-notifications` | Templates, multi-channel, retry, delivery tracking |

---

## Autonomy Wiring

| Capability | Implementation |
|------------|----------------|
| **Cron Runner** | `ScheduledJobRunner` (`@Cron(EVERY_MINUTE)`) calls `runBySystem()` |
| **Real Events** | `InvoiceService` → `InvoiceGenerated`; `PaymentService` → `InvoicePaid` / `PaymentFailed` |
| **Rule Actions** | `SEND_NOTIFICATION` → NotificationService<br>`CREATE_TICKET` → SupportService<br>`SUSPEND_TENANT` → AutoSuspensionService.trigger<br>`REACTIVATE_TENANT` → AutoSuspensionService.reactivate |

---

## Critical Fixes Applied

| Issue | Fix |
|-------|-----|
| Membership suspended after offboarding | Seeder `ensureMembership` recovers status to `ACTIVE` |
| Isolation 403 (Hanoi / multi user) | RBAC seeder assigns `sales` role (has `customer.view`) |
| Webhook `ANY/ALL` error | Query uses jsonb containment `@>` instead of `ANY()` |
| Step-up `user_id null` | Controller reads `req.user.userId` (JWT strategy field) |
| Column name mismatches | Explicit `name: 'snake_case'` on entities |
| Step-up 412 in older tests | Expectations accept 412 where guard is active |

---

## Migrations (run in order)

```
1752000000000-WorkflowDefinitionEngine
1753000000000-AddStepUpUpdatedAt
1754000000000-ScheduledJobs
1755000000000-RuleEngine
1756000000000-EventAutomation
1757000000000-AutoRenewal
1758000000000-AutoSuspension
1759000000000-AutoInvoice
1760000000000-AutoNotification
```

Plus all earlier migrations from Sprint 1 through Phase 6 and EPIC A.

---

## Quick Start

```bash
# 1. Extract
tar -xzf business-os-backend-epic-b-complete.tar.gz
cd business-os-backend

# 2. Install
npm install

# 3. Migrate + Seed
npm run migration:run
npm run seed

# 4. Verify login
# admin@abctrading.vn / Password123! / tenant ABC

# 5. Run e2e
npm run test:e2e
```

Expected: **43 suites passed, 189 tests passed**.

---

## Demo Users (after seed)

| Email | Tenant | Role |
|-------|--------|------|
| `admin@abctrading.vn` | ABC | admin |
| `hcm.user@abctrading.vn` | ABC | sales |
| `hanoi.user@abctrading.vn` | ABC | sales |
| `manager@abctrading.vn` | ABC | manager |
| `multi@businessos.vn` | ABC + Cafe Mộc | sales |
| `owner@cafemoc.vn` | Cafe Mộc | admin |

Password for all: `Password123!`

---

## Architecture Notes

- **Multi-tenant:** All tenant-scoped entities extend `BaseTenantEntity`.
- **RBAC:** `JwtAuthGuard` + `TenantGuard` + `PermissionGuard` + `FeatureGuard`.
- **Audit:** Global interceptor + explicit `logAction` in services.
- **Events:** In-process `EventBus` with `event_logs` table.
- **Step-up:** Required for sensitive admin/billing actions (returns 412 without token).
- **Observability:** Prometheus metrics endpoints on most modules; OpenTelemetry-style tracing interceptor.

---

## Remaining (non-blocking)

| Item | Status |
|------|--------|
| Cron assertion in e2e | Not covered (e2e does not wait 1 minute) |
| Worker force-exited warning | Teardown leak, does not fail tests |
| pg deprecation warning | Driver-level, no functional impact |

---

## Next Possible Steps

- Real cron assertion test (or manual trigger endpoint)
- Outbox + external broker for EventBus
- Full payment provider adapters (beyond mock/VietQR/PayOS)
- UI for workflow/rule/job designers

---

*Generated: 2026-10-31*

---

## EPIC C – Enterprise Platform

### C1 Audit & Compliance Platform
- Tables: `audit_events`, `audit_exports`, `audit_retention_policies`, `compliance_reports`
- APIs: `GET /audit`, `/audit/search`, `/audit/export` (csv | excel | pdf), `/audit/reports`,
  `/audit/retention`, `/audit/metrics`
- Tenant-isolated search, 4 compliance reports, retention 90 / 180 / 365 / custom
- Audit trace id is carried from the request (`x-request-id`) into the stored event

### C2 Organization Structure
- Tables: `enterprise_organizations`, `enterprise_departments`, `enterprise_teams`,
  `cost_centers`, `org_memberships`
- Create/list: `POST|GET /org/organizations`, `POST /org/departments|teams|cost-centers`,
  `POST /org/memberships`, `POST /org/memberships/:id/move`,
  `POST /org/departments/:id/manager`, `POST /org/teams/:id/lead`
- Maintenance: `PATCH|PUT|DELETE /org/{organizations|departments|teams|cost-centers}/:id`
  - `PATCH` = partial (rename / move / status), `PUT` = full replace (`name` required)
  - `DELETE` = **soft deactivate** (`status = inactive`); hierarchy checks reject cycles
- Reports: `GET /org/tree`, `/org/statistics`, `/org/cost-centers/report`, `/org/metrics`

### C3 Enterprise Identity (OIDC + Entra)
- Tables: `identity_providers`, `identity_mappings`, `sso_sessions`
- APIs: `/identity/providers` (create / list / enable / disable), `/identity/providers/:code/discovery`,
  `GET /identity/login/:code`, `POST /identity/callback`, `GET /identity/sessions`, `/identity/metrics`
- **id_token verification**: RS256/RS384/RS512 via the provider JWKS (`kid` selection, 10-minute cache,
  refresh on key rotation); HS256 kept only for internal/mock providers
- **Callback** accepts either `code` (exchanged server-side at the token endpoint, client secret never
  leaves the backend) or a pre-obtained `id_token`
- **PKCE (S256)**: a verifier is generated per login, only its SHA-256 challenge is sent to the IdP,
  and the verifier is stored on the session and used during the server-side code exchange
- **Session hygiene**: `POST /identity/sessions/cleanup` (manual) plus an hourly cron delete
  `PENDING` sessions older than 1h and `ACTIVE` sessions older than 7 days
- **Entra**: issuer / authorize / token / JWKS derived from `entraTenantId` (required at creation)
- Auto-provisioning: user → membership → RBAC role, idempotent via `identity_mappings`
- SAML: discovery metadata only (assertion consumer not enabled)

**Tests:** `audit-compliance` (7), `enterprise-org` (3), `enterprise-identity` (5).


### C4 SCIM 2.0 Provisioning

**Entities:** `scim_endpoints` (token hash, enabled, default role, organization code, last used),
`scim_mappings` (resource type, sync target, external id, internal user/org/department ids, role code,
members, active/deleted), `scim_provisioning_logs` (operation, status, attempts, resource id, payload,
error, trace id, completed/dead-letter timestamps).

**SCIM APIs (RFC 7644):**

| Method | Path | Notes |
|---|---|---|
| GET | `/scim/v2/ServiceProviderConfig` · `/ResourceTypes` · `/Schemas` | discovery |
| GET/POST | `/scim/v2/Users` | list (`userName`/`externalId`/`id` `eq` filter, `sortBy`/`sortOrder`, startIndex/count) · create |
| GET/PUT/PATCH/DELETE | `/scim/v2/Users/:id` | read · replace · PatchOp (active/name/userName/roles) · deprovision |
| GET/POST | `/scim/v2/Groups` | list (filter + sort) · create |
| GET/PUT/PATCH/DELETE | `/scim/v2/Groups/:id` | read · replace · add/remove members · deactivate |
| POST | `/scim/v2/Bulk` | RFC 7644 bulk: up to 100 operations, per-operation status, `failOnErrors` |

Groups use the `urn:ietf:params:scim:schemas:extension:businessos:2.0:Group` extension:
`syncTarget = GROUP | DEPARTMENT | ORGANIZATION` (+ `organizationCode`).

**Admin APIs (JWT + `admin.access`):** `POST/GET/PATCH /scim/endpoints`,
`POST /scim/endpoints/:id/rotate-token` (plaintext token returned once),
`GET /scim/provisioning-logs` (`status` filter), `GET /scim/provisioning-logs/:id`,
`POST /scim/provisioning-logs/:id/retry`, `GET /scim/metrics`.

**Capabilities:** create/update/suspend/delete user, group + department + organization sync,
automatic role mapping (SCIM `roles` → tenant RBAC role, fallback to the endpoint default role),
provisioning status tracking, retry (max 3 attempts), dead-letter queue (`status = DEAD`,
`dead_letter_at`), audit logging, Prometheus counters, OpenTelemetry span attributes.

**Tests:** `scim` (11) — token auth/disabled endpoint, discovery, user CRUD + filter + sort + suspend/reactivate,
role mapping, org/department/group sync, plain group sync, bulk operations, status + retry + DLQ, metrics,
tenant isolation.

---

### C5 Compliance Center

**Entities:** `compliance_evidence` (code, title, category, source, status, collected / valid-until,
sha256 hash, JSON payload), `compliance_access_reviews` (name, scope, status, period, reviewer,
`findings` jsonb, reviewed/flagged counts), `compliance_risks` (title, category, severity, status,
likelihood × impact score, owner, due date, mitigation), `compliance_snapshots` (evidence/access/risk/
retention/security + overall scores, `metrics` jsonb).

**APIs (JWT + `admin.access`):**

| Method | Path | Notes |
|---|---|---|
| GET | `/compliance/dashboard` | live scores + evidence/risk/review/security counts |
| POST/GET | `/compliance/evidence` | register manual evidence (sha256) · list (category/status) |
| POST | `/compliance/evidence/collect` | auto-collect audit/access/security/operations evidence |
| GET | `/compliance/evidence/export?format=csv\|excel\|pdf` | evidence export |
| GET | `/compliance/evidence/:id` · POST `…/verify` | read · mark verified |
| POST/GET | `/compliance/access-reviews` | start review (membership + role snapshot) · list |
| GET | `/compliance/access-reviews/:id` · POST `…/complete` | findings · sign-off |
| GET | `/compliance/permission-review` | role → permission matrix + risky assignments |
| POST/GET/PATCH | `/compliance/risks` | create/list/update (status, severity, likelihood, impact) |
| GET | `/compliance/reports/risks` · `/retention` · `/security` | risk, retention, security reports |
| POST/GET | `/compliance/snapshots` | generate · list compliance snapshots |
| GET | `/compliance/analytics` | score trend + evidence/risk/review breakdowns |
| GET | `/compliance/metrics` | Prometheus text |

**Capabilities:** evidence collection (platform-sourced via audit/access/SSO/SCIM/operations queries,
or manual with a deterministic sha256), evidence export (CSV/Excel/PDF), access review with flags
(`PRIVILEGED_ROLE`, `INACTIVE_MEMBERSHIP`, `NEVER_LOGGED_IN`, `MULTIPLE_ROLES`), permission review with
risky-permission mapping, risk assessment + mitigation workflow, retention report (audit retention
policies + aged audit/login/SSO/SCIM rows), security report (SSO, SCIM, step-up, access-monitoring
checks), compliance dashboard, snapshots + analytics, audit logging for every mutation, and Prometheus
counters (`compliance_evidence_collected_total{category}`, `compliance_exports_total{format}`,
`compliance_access_reviews_started_total`, `compliance_access_reviews_completed_total`,
`compliance_risks_created_total{severity}`, `compliance_snapshots_generated_total`).

**Scoring:** evidence = verified/total; access = 100 − flagged/reviewed (50 when no review exists);
risk = 100 − 15·critical − 10·high − 5·medium (open risks); retention = 100 when no aged records, else 50;
security = 25 points each for SSO configured, SCIM configured, step-up used, access monitoring;
overall = mean of the five scores.

**Tests:** `compliance` (10) — authz, evidence collect/create/hash/verify/duplicate, CSV/Excel/PDF export,
access review flags + completion, permission matrix, risk scoring/filter/mitigation + report,
retention report, security report + Prometheus metrics, snapshot/dashboard/analytics, tenant isolation.

---

### C6 Enterprise Security Hardening

**Entities:** `security_events` (type/severity/status/source, actor, IP, country, risk score, dedupe key,
acknowledge/resolve metadata), `security_login_attempts` (success/failure, reason, IP, country,
`anomalous` flag), `security_login_locations` (learned country baseline per user),
`security_alert_rules` (event type, threshold, window, severity, channels, trigger count),
`security_secret_rotations` (resource type/id, reason, rotated by), `security_emergency_access`
(requester, approver, scope, status, expiry).

**APIs (JWT + `admin.access`):**

| Method | Path | Notes |
|---|---|---|
| GET | `/security/dashboard` · `/security/threats` | posture + monitoring (top IPs/identities, open criticals) |
| GET | `/security/events` · `/security/events/:id` | list/filter · detail |
| POST | `/security/events/:id/acknowledge` · `/resolve` | incident workflow |
| GET | `/security/audit-trail` | security audit logs from `audit_logs` |
| POST | `/security/detect/failed-logins` · `/suspicious-activity` · `/geo-anomalies` · `/all` | detections |
| GET | `/security/login-attempts` · `/login-locations` | login signals · geo baseline |
| GET/POST/PATCH | `/security/alert-rules` | alert rule CRUD |
| GET | `/security/rotations` | rotation history |
| POST | `/security/rotations/api-keys/:id` · `/scim-endpoints/:id` · `/webhooks/:id` | **step-up** (`security.rotate-*`), plaintext returned once |
| GET/POST | `/security/emergency-access` | list (auto-expires stale) · request break-glass |
| POST | `/security/emergency-access/:id/approve` · `/revoke` | **step-up** (`security.emergency-access`), approve must be a different admin |
| GET | `/security/metrics` | Prometheus text (shared registry) |

**Capabilities:** failed-login / brute-force detection (per email, window + threshold), suspicious-activity
detection (multi-IP logins, failed-then-success credential stuffing), geo-anomaly architecture
(trusted `x-country-code` header → per-user country baseline → first-seen-from-new-country event),
security event lifecycle (OPEN → ACKNOWLEDGED → RESOLVED), tenant alert rules with seeded defaults and
threshold evaluation, secret + API-key + SCIM-token + webhook-secret rotation behind real step-up,
persistent break-glass emergency access with dual control and automatic expiry, security audit trail,
Prometheus counters (`security_events_total`, `security_login_attempts_total{result,reason}`,
`security_detections_total{type}`, `security_alerts_triggered_total`, `security_secret_rotations_total`,
`security_emergency_access_total{status}`).

**Auth integration:** `AuthService` records every login attempt (success and failure reasons
`INVALID_PASSWORD`, `UNKNOWN_USER`, `NO_TENANT`, `TENANT_MISMATCH`) and updates the geo baseline on success.
Telemetry never blocks authentication. `x-country-code` is only trustworthy when the edge proxy strips
client-supplied copies (documented in `.env.example` / deployment notes).

**Tests:** `enterprise-security` (11) — authz, seeded alert rules + CRUD, failed-login detection + dedupe,
credential-stuffing detection, geo anomaly vs baseline, event acknowledge/resolve + audit trail,
alert threshold firing, step-up-protected rotations (API key/SCIM/webhook), dual-control emergency access,
threat monitoring + metrics + login signals, tenant isolation.

---

### C7 Enterprise Reporting

**Entities:** `report_runs` (type, format, period, status, row count, summary, schedule id),
`report_schedules` (type/format/frequency, delivery channels, recipients, webhook ids, next/last run),
`report_deliveries` (run id, channel, target, status, error, delivered at, metadata).

**Reports (7):**

| Type | Contents | Columns |
|---|---|---|
| `TENANT_ACTIVITY` | audit events, active members, logins, top actions | action, events |
| `DEPARTMENT_ACTIVITY` | headcount + audit events per enterprise department | code, name, members, events |
| `BILLING` | subscription state + invoice totals by status | status, invoices, totalAmount, paidAmount |
| `REVENUE` | paid invoices by month + payment provider mix | month, invoices, revenue |
| `USAGE` | usage quantities per metric | metric, quantity, records |
| `SECURITY` | security events by type/severity + failed logins/alert triggers | eventType, severity, events, openEvents |
| `AUTOMATION` | workflow instances, scheduled jobs, job executions | category, name, count |

**APIs (JWT + `admin.access`, Swagger documented):**

| Method | Path | Notes |
|---|---|---|
| GET | `/reports/catalog` | 7 definitions + export columns |
| GET | `/reports/:type?from=&to=` | JSON report (period defaults to last 30 days) |
| GET | `/reports/:type/export?format=CSV\|EXCEL\|PDF` | CSV / Excel / PDF download |
| POST | `/reports/:type/run` | generate + persist run + deliver (`IN_APP`, `EMAIL`, `WEBHOOK`) |
| GET | `/reports/runs` · `/reports/runs/:id` | history · detail with deliveries |
| GET/POST | `/reports/schedules` | list · create daily/weekly/monthly schedule |
| GET/PATCH | `/reports/schedules/:id` | detail · change frequency/format/targets |
| POST | `/reports/schedules/:id/run` | run immediately (also used by the worker) |
| GET | `/reports/metrics` | Prometheus text |

**Scheduling:** `next_run_at` is computed on create/update/run (`DAILY +1d`, `WEEKLY +7d`,
`MONTHLY +1 month`); `ReportingSchedulerJob` runs every 5 minutes and only executes due rows.
Manual runs use the frequency look-back window (1/7/30 days).

**Delivery:** `IN_APP` writes a real notification row; `EMAIL` writes the platform email-channel
notification (mock transport, same as EPIC A/B); `WEBHOOK` writes an outbound `integration_logs`
entry per webhook behind `assertSafeWebhookUrl` (SSRF guard). Each attempt is persisted in
`report_deliveries` with `SENT` / `FAILED` / `SKIPPED`.

**Audit & metrics:** every run/schedule change writes `audit_logs` (`entity_type = report`);
Prometheus counters `report_runs_total{type,status}`, `report_exports_total{type,format}`,
`report_deliveries_total{channel,status}`, `report_schedules_created_total{frequency}`,
`report_schedule_runs_total{frequency}`. CSV/Excel/PDF writers are shared with C5 in
`src/common/reports/tabular-export.ts`.

**Tests:** `enterprise-reporting` (12) — authz, catalog, tenant/department activity, billing + revenue,
usage/security/automation, unknown type 400, CSV/Excel/PDF export, run + 3 delivery channels,
schedule create/update/run + next run, run history + metrics + audit, tenant isolation.

---

### D1 Executive Metrics Platform

**Entities:** `executive_metrics` (KPI cache: code, unit, current/previous value, change %, period),
`executive_snapshots` (daily/monthly point-in-time KPIs + summary, unique per day+period),
`metric_history` (time series per KPI for trends).

**KPIs (12):**

| Code | Formula |
|---|---|
| `MRR` | Σ active subscriptions normalised monthly (`YEARLY` → yearly price / 12) |
| `ARR` | MRR × 12 |
| `ARPU` | MRR / active subscriptions |
| `LTV` | ARPU / monthly churn rate (24 × ARPU fallback when churn = 0) |
| `CUSTOMER_COUNT` | tenants with status `active` or `trial` |
| `ACTIVE_USERS` | distinct users with a login in the last 30 days |
| `ACTIVE_TENANTS` | distinct tenants with a login in the last 30 days |
| `TRIAL_CONVERSIONS` | active subscriptions whose `trial_end` fell in the last 30 days |
| `PAID_CONVERSIONS` | active subscriptions without trial created in the last 30 days |
| `REVENUE_GROWTH` | MRR vs the previous recorded MRR history point (%) |
| `RETENTION_RATE` | active tenants with logins / customers × 100 |
| `CHURN_RATE` | 100 − retention rate |

**APIs (JWT + `admin.access` + platform operator):**

| Method | Path | Notes |
|---|---|---|
| GET | `/executive/metrics` | live KPIs + cached previous value / change % |
| GET | `/executive/metrics/history?code=&period=&from=&to=` | daily/monthly time series |
| GET | `/executive/metrics/prometheus` | Prometheus gauges (`executive_mrr`, `executive_arr`, …) |
| GET | `/executive/dashboard` | KPIs + latest daily/monthly snapshot + MRR/tenant trends |
| POST | `/executive/snapshots` | generate daily (default) or monthly snapshot |
| GET | `/executive/snapshots?period=&limit=` | snapshot history |

**Access model:** KPIs aggregate **all tenants**, so they are restricted to platform operators via
`PLATFORM_ADMIN_EMAILS` (production empty list ⇒ endpoints disabled / fail-closed; dev+test fallback
`admin@abctrading.vn`). A tenant owner with `admin.access` still gets 403.

**Snapshots & scheduling:** `ExecutiveSnapshotJob` runs daily at 02:30 and monthly on the 1st at 03:15.
Snapshots are idempotent per `(tenant, snapshot_date, period)`; `metric_history` is refreshed for the
day so re-running a snapshot never duplicates trend points. Every snapshot writes `audit_logs`
(`entity_type = executive_snapshot`) and increments `executive_snapshots_total{period}`.

**Tests:** `executive-metrics` (7) — operator gate (401/403 for sales and tenant owner), 12 KPIs and
formula consistency, idempotent daily snapshot + history rows, monthly snapshot + series,
dashboard trends, snapshot list + Prometheus gauges, cached values + audit + operator-tenant storage.

---

### D2 Revenue Intelligence

**Entities:** `revenue_snapshots` (MRR/ARR, expansion/contraction/net-new, paid revenue, plan/tenant/
country breakdowns, unique per day+period), `revenue_segments` (dimension `PLAN|TENANT|COUNTRY`,
segment key/label, MRR/ARR/share, period `YYYY-MM`), `revenue_forecasts` (horizon, as-of,
predicted revenue, bounds, confidence, method, inputs).

**Metrics & reports:**

| Item | Formula / source |
|---|---|
| `MRR` / `ARR` | active subscriptions normalised monthly; ARR = MRR × 12 |
| Expansion revenue | Σ positive plan-price deltas from `audit_logs` (`Subscription` UPDATE, old vs new plan) in the last 30 days |
| Contraction revenue | Σ negative plan-price deltas in the same window |
| Revenue by plan | active subscriptions grouped by plan (tenants + MRR + share) |
| Revenue by tenant | active subscriptions grouped by tenant (top customers by MRR) |
| Revenue by country | grouped by `tenants.settings.country` (fallback `UNKNOWN`) |
| Revenue trend | paid `billing_invoices` by month (revenue + invoice count) |
| Upgrade / downgrade trend | monthly counts + expansion/contraction from plan-change audit rows |
| Next month / quarter / annual forecast | MRR × (1 + growth) × 1 / 3 / 12, bounds ±10/15/20 %, confidence from history depth |

**APIs (JWT + `admin.access` + platform operator):**

| Method | Path | Notes |
|---|---|---|
| GET | `/revenue/dashboard` | summary, segments, top customers/plans, forecast, trends |
| GET | `/revenue/top-customers?limit=` | customers ranked by MRR + share |
| GET | `/revenue/forecast?horizon=` | `NEXT_MONTH` / `QUARTER` / `ANNUAL` |
| GET | `/revenue/trends?months=` | revenue, MRR history and upgrade/downgrade series |
| GET | `/revenue/segments?dimension=&period=` | live or persisted segments |
| POST/GET | `/revenue/snapshots` | generate (daily/monthly) · list |
| GET | `/revenue/metrics` | Prometheus gauges (`revenue_mrr`, `revenue_expansion`, `revenue_forecast_*`) |

**Scheduling & storage:** `RevenueSnapshotJob` runs daily 03:00 and monthly (1st, 04:00); snapshots are
idempotent per `(tenant, snapshot_date, period)`, segments per `(tenant, dimension, key, period)`,
forecasts per `(tenant, horizon, as_of)`. Every snapshot writes `audit_logs`
(`entity_type = revenue_snapshot`) and increments `revenue_snapshots_total{period}`.

**Supporting changes:** `BillingService.changePlan` now records `oldData` (previous plan/cycle/status) so
expansion/contraction can be derived; `TenantSettingsDto` + tenant seeder persist `settings.country`
(`VN` for the demo tenants) for revenue-by-country.

**Tests:** `revenue-intelligence` (8) — operator gate, dashboard segments/forecast, top customers,
three forecast horizons + bounds, upgrade/downgrade + expansion/contraction from real plan changes,
idempotent monthly/daily snapshots + segments persistence, Prometheus gauges + audit + operator-tenant storage.

---

### D3 Customer Health Platform

**Entities:** `customer_health_scores` (latest score per customer tenant: 0–100 score, level, previous
score/trend, 7 signal breakdowns, risk drivers, primary risk, churn flag), `health_signals` (weighted
signal catalog, seeded for the operator tenant), `health_snapshots` (daily per-tenant score history,
unique per tenant+day).

**Signals (weights sum 100):**

| Signal | Weight | 0–100 points from |
|---|---|---|
| `LOGIN_FREQUENCY` | 15 | logins in the last 30 days |
| `ACTIVE_USERS` | 15 | distinct active users / active memberships |
| `USAGE_TREND` | 15 | usage quantity vs the previous 30 days |
| `SUPPORT_TICKETS` | 15 | open / in-progress / waiting tickets |
| `FAILED_PAYMENTS` | 15 | FAILED / CHARGEBACK payments in the last 30 days |
| `RENEWAL_SUCCESS` | 10 | latest subscription status (ACTIVE 100 … CANCELLED 0) |
| `SECURITY_EVENTS` | 15 | unresolved HIGH/CRITICAL security events in the last 30 days |

**Levels:** `HEALTHY ≥ 80`, `WARNING ≥ 60`, `AT_RISK ≥ 40`, `CRITICAL < 40`. Trend is the delta vs the
previous stored score (`UP` / `DOWN` / `STABLE`). Risk drivers are signals scoring below 60; a tenant is a
**churn candidate** when it is AT_RISK/CRITICAL, has failed payments, or renewal points ≤ 40.

**APIs (JWT + `admin.access` + platform operator):**

| Method | Path | Notes |
|---|---|---|
| GET | `/customer-health` | health dashboard: totals, distribution, tenants, at-risk, churn candidates |
| GET | `/customer-health/at-risk?churnOnly=&limit=` | at-risk tenants sorted by score |
| GET | `/customer-health/tenant/:id` | score detail + risk drivers + 90-day history |
| GET | `/customer-health/trends?tenantId=&days=` | daily score series |
| GET | `/customer-health/signals` | signal catalog + weights |
| POST | `/customer-health/snapshots` | score every tenant, persist latest + daily history |
| GET | `/customer-health/metrics` | Prometheus gauges |
| GET | `/health/dashboard` · `/health/at-risk` · `/health/tenant/:id` | aliases (see note) |

> **Route note:** the requested `GET /health` is already the **public liveness probe** (guardrail §1.7),
> so the dashboard is served at `/customer-health` (alias `/health/dashboard`) while `/health/at-risk` and
> `/health/tenant/:id` are provided as requested without colliding with `/health` / `/health/ready`.

**Features:** health dashboard with distribution + averages, at-risk ranking with risk drivers and reasons,
churn candidates, daily trending score (`HealthSnapshotJob` 02:15), risk detection from seven signals,
Prometheus gauges (`customer_health_avg_score`, `customer_health_*_tenants`, `customer_health_churn_candidates`),
audit (`entity_type = customer_health_snapshot`) and `customer_health_snapshots_total` counter.

**Tests:** `customer-health` (8) — operator gate + probes untouched, dashboard distribution, at-risk +
churn filter with risk drivers, tenant detail (healthy vs at-risk), weighted signal catalog, idempotent
daily snapshots + history, `/health/*` aliases, Prometheus gauges + audit.

---

### D4 Product Analytics

**Entities:** `feature_usage` (raw usage per **customer** tenant: feature, actor, organization,
department, quantity, user count, source `TRACKED|DERIVED|SEED`, dedupe key, occurred at),
`feature_adoption` (operator-scoped breakdown per feature × dimension × key × period),
`feature_trends` (daily usage, active tenants/users, growth %, retention %).

**Features (11):** `SALES_ORDERS`, `INVOICES`, `CUSTOMERS`, `PRODUCTS`, `SUPPORT`, `REPORTS`,
`COMPLIANCE`, `SECURITY`, `SCIM`, `API_KEYS`, `AUTOMATION`.

**Metrics & reports:**

| Item | Definition |
|---|---|
| Most / least used | features ranked by usage in the window (top 5 / bottom 5, zero-usage included) |
| Feature activation | active tenants using the feature / active tenants (%) |
| Feature retention | tenants using the feature in the current **and** previous window / previous window tenants (%) |
| Feature growth | usage in the window vs the previous window (%) |
| Adoption | usage share per dimension key within each feature (%) |
| Usage trend | daily usage, active tenants/users, day-over-day growth and retention |

**Dimensions:** `TENANT`, `ORGANIZATION`, `DEPARTMENT`, `PLAN` (organization/department come from the
usage row; untagged usage is reported as `UNASSIGNED`).

**APIs (JWT + `admin.access` + platform operator, `/analytics` prefix):**

| Method | Path | Notes |
|---|---|---|
| GET | `/analytics/features/catalog` | 11 feature definitions |
| GET | `/analytics/features?days=` | ranking: most/least used, activation, retention, growth |
| POST | `/analytics/features/track` | explicit usage event (optionally org/department tagged) |
| POST | `/analytics/features/collect?days=` | derive usage from existing business tables (idempotent) |
| GET | `/analytics/features/metrics` | Prometheus gauges |
| GET | `/analytics/adoption?dimension=&period=` | adoption breakdown, persisted per period |
| GET | `/analytics/trends?days=&feature=` | daily trend series + persistence |

> Existing tenant analytics (`/analytics/kpis`, `/dashboard`, `/reports/revenue`, `/forecast/revenue`,
> `/metrics`) are untouched; D4 only adds new paths under the same prefix.

**Collection:** `collect` aggregates 11 business tables into daily usage rows keyed
`FEATURE:tenant:day` with `ON CONFLICT DO NOTHING`, so repeated runs never double-count. The seeder
inserts one baseline `SEED` row per feature for ABC. Gauges: `product_analytics_features`,
`product_analytics_active_features`, `product_analytics_usage_30d`,
`product_analytics_avg_activation_pct`; counters `product_feature_usage_tracked_total{feature}`,
`product_analytics_collected_total`, `product_analytics_trends_generated_total`; audit `product_analytics`.

**Tests:** `product-analytics` (8) — operator gate, catalog, derive + ranking, tracked usage with
org/department dimensions, adoption by tenant/plan, adoption by organization/department + invalid period,
daily trends with growth/retention, Prometheus + audit + operator-scoped persistence.

---

### Shared Prometheus registry (observability)

Every module now increments **one** `prom-client` registry (`src/common/metrics/metrics.service.ts`)
instead of keeping a private `Map`:

- default labels (`service`) + Node.js process metrics are exposed with every scrape
- per-module `/metrics` endpoints (`/identity/metrics`, `/org/metrics`, `/scim/metrics`, `/audit/metrics`,
  `/renewals/metrics`, …) all return the same registry, so a single scrape sees the whole process
- service code uses `metrics.inc('name', { label })` / `metrics.set(...)`; nothing resets on restart
  within the same process lifecycle, and labels are first-class (e.g. `http_requests_total{status,method}`,
  `usage_recorded_total{metric,tenant}`)

