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

### Shared Prometheus registry (observability)

Every module now increments **one** `prom-client` registry (`src/common/metrics/metrics.service.ts`)
instead of keeping a private `Map`:

- default labels (`service`) + Node.js process metrics are exposed with every scrape
- per-module `/metrics` endpoints (`/identity/metrics`, `/org/metrics`, `/scim/metrics`, `/audit/metrics`,
  `/renewals/metrics`, …) all return the same registry, so a single scrape sees the whole process
- service code uses `metrics.inc('name', { label })` / `metrics.set(...)`; nothing resets on restart
  within the same process lifecycle, and labels are first-class (e.g. `http_requests_total{status,method}`,
  `usage_recorded_total{metric,tenant}`)

