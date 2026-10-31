# Business OS – EPIC A + EPIC B Complete

**Autonomous Enterprise SaaS Platform**

Archive: `business-os-backend-epic-b-complete.tar.gz`  
Full e2e: **42/42 suites, 177/177 tests PASS** (verified on a fresh database, 2026-10-31)

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

Expected: **42 suites passed, 177 tests passed**.

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
- **Entra**: issuer / authorize / token / JWKS derived from `entraTenantId` (required at creation)
- Auto-provisioning: user → membership → RBAC role, idempotent via `identity_mappings`
- SAML: discovery metadata only (assertion consumer not enabled)

**Tests:** `audit-compliance` (7), `enterprise-org` (3), `enterprise-identity` (5).

