# Business OS – Sprint 1: Multi-Tenant Foundation (Revised)

Production-ready Multi-Tenant SaaS foundation.

**Goal:** Single-Company App → Multi-Tenant SaaS with absolute data isolation.

**Tech Stack:** NestJS · TypeScript · PostgreSQL · TypeORM

> ⚠️ **Trước khi sửa code, đọc [`ENGINEERING-GUARDRAILS.md`](./ENGINEERING-GUARDRAILS.md)**
> – bất biến kiến trúc (tenant isolation, step-up, seed contract), Definition of Done
> và danh sách lỗi đã từng xảy ra.

---

## Key Architecture Decisions (Mandatory)

| Decision | Detail |
|----------|--------|
| **Users are GLOBAL** | No `tenant_id` on `users`. Membership via `tenant_users` junction. |
| **One User → Many Tenants** | User can belong to ABC + Cafe Mộc + XYZ simultaneously. |
| **Tenant has `slug`** | For subdomain / path routing: `abc.businessos.vn` or `/t/abc-trading` |
| **Audit fields** | `BaseTenantEntity` includes `createdBy` + `updatedBy` (Sprint 5-6 ready) |
| **Status enum** | `trial \| active \| suspended \| past_due \| closed` |

---

## 1. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Client / Frontend                            │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  Bearer JWT { userId, tenantId, role }
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ NestJS                                                               │
│  1. JwtAuthGuard          validate token                             │
│  2. TenantMiddleware      ALS context (tenantId, userId, role)       │
│  3. TenantGuard           tenant exists + active + membership active │
│  4. Controller / Service                                             │
│  5. TenantAwareRepository EVERY query forced to tenant_id            │
│     + stamps createdBy / updatedBy                                   │
└───────────────────────────────┬──────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ PostgreSQL                                                           │
│                                                                      │
│  users (GLOBAL identity)                                             │
│     │                                                                │
│     └── tenant_users (membership) ──┬── tenants                      │
│                                     │      code, slug, plan, status  │
│                                     │                                │
│                                     ├── customers      (tenant_id)   │
│                                     ├── products       (tenant_id)   │
│                                     ├── sales_orders   (tenant_id)   │
│                                     ├── invoices       (tenant_id)   │
│                                     ├── payments       (tenant_id)   │
│                                     └── inventory_tx   (tenant_id)   │
└──────────────────────────────────────────────────────────────────────┘
```

**Request flow**

```
Request → JWT Auth → Tenant Resolver (Middleware + ALS)
       → TenantGuard (tenant + membership) → Business Logic
```

---

## 2. Database Schema

### tenants
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| code | varchar(50) UNIQUE | ABC |
| slug | varchar(100) UNIQUE | abc-trading |
| name | varchar(255) | |
| plan | enum | free/starter/professional/enterprise |
| status | enum | trial/active/suspended/past_due/closed |
| settings | jsonb | timezone, currency, language… |
| created_at / updated_at | timestamptz | |

### users (GLOBAL – no tenant_id)
| Column | Type |
|--------|------|
| id | uuid PK |
| email | varchar UNIQUE |
| password_hash | varchar |
| full_name | varchar |
| is_active | boolean |

### tenant_users (membership)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK | |
| user_id | uuid FK | |
| role | varchar | admin/member… (Sprint 3 → RBAC) |
| status | enum | active/invited/suspended/left |
| UNIQUE(tenant_id, user_id) | | |

### Business tables (all tenant-aware)
`customers`, `products`, `sales_orders`, `invoices`, `payments`, `inventory_transactions`

Each has:
- `tenant_id uuid NOT NULL` + FK + index
- `created_by uuid`
- `updated_by uuid`
- `created_at` / `updated_at`

---

## 3. ERD (simplified)

```
┌──────────┐       ┌──────────────┐       ┌──────────┐
│  users   │──1:N──│ tenant_users │──N:1──│ tenants  │
│ (global) │       │ membership   │       │ + slug   │
└──────────┘       └──────────────┘       └────┬─────┘
                                               │ 1:N
                    ┌──────────────────────────┼──────────────────────────┐
                    ▼                          ▼                          ▼
              customers                   products                  sales_orders
              + tenant_id                 + tenant_id               + tenant_id
              + created_by                + created_by              + created_by
              + updated_by                + updated_by              + updated_by
```

---

## 4–6. Entities / DTOs / Migration

- `BaseEntity` / `BaseTenantEntity` → `src/common/entities/base.entity.ts`
- `Tenant` (+ slug, new status) → `src/modules/tenant/entities/tenant.entity.ts`
- `TenantUser` → `src/modules/tenant/entities/tenant-user.entity.ts`
- `User` (global) → `src/modules/users/entities/user.entity.ts`
- DTOs + TenantSettingsDto validation → `src/modules/tenant/dto/tenant.dto.ts`
- Full migration → `src/database/migrations/1729750000000-CreateMultiTenantFoundation.ts`

---

## 7. Tenant Context Service

```ts
getCurrentTenantId()
getCurrentUserId()
getCurrentRole()
setContext(data)
clearContext()
```

Uses **AsyncLocalStorage**.

---

## 8. Middleware

`TenantMiddleware` – after JWT, establishes ALS context from `request.user`.

---

## 9. Guards

`TenantGuard`:
1. Tenant exists
2. Status ∈ {active, trial}
3. User has **active membership** in `tenant_users`

→ 401 / 403

---

## 10. Repository Pattern

```ts
this.customerRepo.scoped().findAll()
this.customerRepo.scoped().findById(id)
this.customerRepo.scoped().save(data)  // auto tenantId + createdBy/updatedBy
```

Raw repository is **not** exposed.

---

## 11. Global Tenant Filter

Primary defense = `TenantAwareRepository` (forces `WHERE tenant_id = ?`).

Secondary = `TenantAuditInterceptor` (logs tenantId on every request).

Future: PostgreSQL RLS as extra safety net.

**How data leakage is prevented:**
- No public `find()` without tenant
- Cross-tenant ID lookup → record invisible → 404
- Delete/update also scoped by tenant_id
- Unique indexes are composite `(tenant_id, business_key)`

---

## 12. Seeder

| Tenant | code | slug | Users |
|--------|------|------|-------|
| ABC Trading | ABC | abc-trading | admin@abctrading.vn |
| Cafe Mộc | CAFE_MOC | cafe-moc | owner@cafemoc.vn |
| (both) | | | multi@businessos.vn (CASE 6) |

Password: `Password123!`

```bash
npm run seed
```

---

## 13. Integration Tests

| Case | Description | Expected |
|------|-------------|----------|
| 1 | ABC user sees only ABC data | PASS |
| 2 | Cafe user never sees ABC data | PASS |
| 3 | No token | 401 |
| 4 | Tenant suspended | 403 |
| 5 | Cross-tenant ID access | 403/404 |
| 6 | Multi-tenant user switches tenant | PASS |

```bash
npm run test:e2e
```

---

## 14. Folder Structure

```
business-os-backend/
├── src/
│   ├── common/
│   │   ├── entities/          BaseEntity, BaseTenantEntity, Invoice…
│   │   ├── guards/            TenantGuard
│   │   ├── middleware/        TenantMiddleware
│   │   ├── repositories/      TenantAwareRepository
│   │   ├── tenant-context/    TenantContextService (ALS)
│   │   └── filters/           Audit interceptor
│   ├── modules/
│   │   ├── tenant/            Tenant + TenantUser entities, DTOs, Service
│   │   ├── auth/              Login + Switch-Tenant
│   │   ├── users/             Global User entity
│   │   ├── customers/         Example TenantAware usage
│   │   ├── products/
│   │   └── sales-orders/
│   ├── database/
│   │   ├── migrations/
│   │   └── seeds/
│   ├── app.module.ts
│   └── main.ts
├── test/
│   └── tenant-isolation.e2e-spec.ts
└── README.md
```

---

## 15. Security Notes

1. **Defense in depth**
   - JWT carries tenantId
   - Middleware → ALS
   - Guard verifies tenant health + active membership
   - Repository forces tenant filter + audit stamps

2. **Multi-tenant membership**
   - Login may return `requiresTenantSelection`
   - Client picks tenant → new JWT
   - `POST /auth/switch-tenant` issues new JWT for another membership

3. **No leakage paths**
   - Global User table never exposes other tenants' business data
   - Membership check is mandatory in Guard

---

## 16. Production Recommendations

| Topic | Recommendation |
|-------|----------------|
| Connection pooling | PgBouncer; pool size tuned per load |
| Caching | Keys namespaced `tenant:{id}:…` |
| Background jobs | Always pass tenantId explicitly (no ALS) |
| Migrations | Never `synchronize: true` in prod |
| RLS (optional) | PostgreSQL Row Level Security as extra net |
| Tenant onboarding | Create tenant → create first membership → seed defaults |
| Sprint 2 | Add Company/Branch/Department under Tenant – no change to foundation |
| Sprint 3 | Replace role string with Role/Permission tables via membership |
| Sprint 4 | Scope filters are extra WHERE on top of tenant_id |
| Sprint 5 | Audit log on top of tenant + scope. No change to those filters |
| Sprint 6 | Workflow uses audit `logAction` (APPROVE / REJECT / POST / CANCEL) |

---

## Quick Start

```bash
npm install
cp .env.example .env
npm run migration:run
npm run seed
npm run start:dev
```

**Login examples**

```bash
# Single-tenant user
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@abctrading.vn","password":"Password123!"}'

# Multi-tenant user (returns tenant list)
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"multi@businessos.vn","password":"Password123!"}'

# Multi-tenant user with explicit tenant
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"multi@businessos.vn","password":"Password123!","tenant":"ABC"}'

# Switch tenant
curl -X POST http://localhost:3000/api/v1/auth/switch-tenant \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -d '{"tenantId":"<cafe-tenant-id>"}'
```

---

**Sprint 1 Complete Criteria**

- ✅ tenants (+ slug, new status)
- ✅ users GLOBAL + tenant_users membership
- ✅ Tenant Context (ALS + set/clear)
- ✅ tenant_id + audit fields on business tables
- ✅ Tenant Middleware + Guard (membership check)
- ✅ TenantAwareRepository (no leak)
- ✅ Seed (ABC, Cafe Mộc, multi-user)
- ✅ 6 isolation test cases including switch-tenant

Ready for Sprint 2–8 without foundation refactor.

---

## Sprint 2 – Organization Structure

### Goal
Transform from:
```
Tenant
```
to:
```
Tenant
├── Company
│   └── Branch
│       └── Department
└── Users (via assignment tables)
```

### Deliverables Implemented

| # | Item | Status |
|---|------|--------|
| 1 | Company Module (`companies`) | ✅ |
| 2 | Branch Module (`branches`) | ✅ |
| 3 | Department Module (`departments`) | ✅ |
| 4 | User Assignment (user_companies, user_branches, user_departments) | ✅ |
| 5 | Organization Context (companyId, branchId, departmentId) | ✅ |
| 6 | BaseOrganizationEntity | ✅ |
| 7 | Business tables upgraded (company_id, branch_id) | ✅ |
| 8 | Organization Seeder (ABC Trading + HCM/Hanoi + demo users) | ✅ |
| 9 | Organization Isolation Tests | ✅ |

### ERD (Sprint 2)

```
tenants
  └── companies (tenant_id)
        └── branches (company_id)
              └── departments (branch_id)

users (global)
  ├── tenant_users (membership)
  ├── user_companies
  ├── user_branches
  └── user_departments

business tables (customers, products, sales_orders, invoices, payments, inventory_transactions)
  └── tenant_id + company_id + branch_id
```

### Context after login (Sprint 2)

```json
{
  "tenantId": "...",
  "companyId": "...",
  "branchId": "...",   // null = company-level access
  "departmentId": "...",
  "userId": "...",
  "role": "..."
}
```

### Isolation Rules

- Always filter by `tenantId`
- If `companyId` present in context → filter by it
- If `branchId` present in context → filter by it
- `branchId = null` → company manager sees all branches of the company

### Demo Users (after seeding)

| Email | Access |
|-------|--------|
| hcm.user@abctrading.vn | HCM Branch only |
| hanoi.user@abctrading.vn | Hanoi Branch only |
| manager@abctrading.vn | Company level (all branches) |

Password for all: `Password123!`

### Run seeder

```bash
npm run seed
```

### Migration

```bash
npm run migration:run
```

### What is NOT in Sprint 2

- RBAC / Roles / Permissions → Sprint 3
- Scope (Self/Team/Branch/Company) → Sprint 4
- Workflow → Sprint 6
- Event Bus → Sprint 7

---

## Sprint 3 – RBAC

### Tables
- `permissions` (global catalog)
- `roles` (tenant-scoped)
- `role_permissions`
- `user_roles`

### Default Roles (seeded for ABC tenant)
- owner, admin, manager, sales, cashier, warehouse, accountant, auditor

### Demo Users
| Email                      | Role       | Can do                          |
|----------------------------|------------|---------------------------------|
| hcm.user@abctrading.vn     | sales      | customer.view/create, sales.*   |
| hanoi.user@abctrading.vn   | warehouse  | inventory.view/update           |
| manager@abctrading.vn      | manager    | most business operations        |

### Protected Demo Endpoints
- `POST /demo/sales-orders` → `sales.create`
- `GET  /demo/profit-report` → `profit.view`
- `POST /demo/inventory-adjustment` → `inventory.update`
- `GET  /demo/bank` → `bank.view`
- `GET  /rbac/my-permissions` → returns current user's permission codes

### Permission Format
`module.action` (e.g. `customer.view`, `sales.approve`, `profit.view`)

---

## Sprint 4 – Data Scope Engine

**Goal:** Answer “Which data is the user allowed to SEE?”  
(Independent of RBAC which answers “What can the user DO?”)

### Scope Levels
| Scope   | Meaning                                      | Example Filter                  |
|---------|----------------------------------------------|---------------------------------|
| SELF    | Only records owned by the user               | `owner_id = currentUser`        |
| TEAM    | Records owned by members of the same team    | `owner_id IN (team members)`    |
| BRANCH  | All records of the current branch            | `branch_id = currentBranch`     |
| COMPANY | All records of the current company           | `company_id = currentCompany`   |
| TENANT  | All records of the tenant                    | `tenant_id = currentTenant`     |

### New Tables
- `role_scopes` (role_id, resource, scope)
- `teams` (tenant_id, code, name, manager_id, …)
- `team_members` (team_id, user_id, is_manager)

### Key Components
- `ScopeService.getScopeFilter(userId, resource)`
- `ScopeService.buildQueryScope()`
- `ScopeAwareRepository` – automatically injects scope into queries
- Applied first on `customers` and `sales_orders`

### Migration
`1732000000000-CreateScopeAndTeams`

### Test Cases (expected)
- Sales A → only own customers
- Sales Manager → team customers
- Branch Manager → whole branch
- Director → whole company
- Owner → entire tenant

Run: `npm run migration:run && npm run seed && npm run test:e2e`

---

## Sprint 5 – Audit Log Foundation

Answers who created, updated, deleted, approved, or signed in — and when.
It does not add workflow or an event bus.

### Table
`audit_logs` — see [SPRINT5-ERD.md](SPRINT5-ERD.md).

Migration: `1733000000000-CreateAuditLogs`.

### API
`GET /api/v1/audit-logs` with `audit.view`.

Filters: `entity_type`, `entity_id`, `action`, `performed_by`, `from_date`, `to_date`.

There is no `tenant_id` filter. The tenant always comes from the token.
Scope (SELF / TEAM / BRANCH / COMPANY / TENANT) is the Sprint 4 scope of the
underlying record, so a sales user only sees audits of rows they can already see.

### Phase 1
`@Audited()` on customers, products, and sales orders.
Login writes `LOGIN`, `POST /api/v1/auth/logout` writes `LOGOUT`.
Business services do not call the audit writer themselves.

### Before running
```bash
npm install
npm run migration:run
npm run seed
npm test
npm run test:e2e
```

Re-seed is required: sales receives `customer.update`, `customer.delete`, and
`audit.view`. Cafe Mộc's owner receives the admin role so cross-tenant checks
have a second tenant. Password is still `Password123!`.

### Copilot queries
- Who changed this customer: `?entity_type=customer&entity_id=<id>&action=UPDATE`
- Who deleted this order: `?entity_type=sales_order&entity_id=<id>&action=DELETE`
- Full history: `?entity_type=customer&entity_id=<id>` (oldest first)



---

## Sprint 6 – Workflow Engine Foundation (2026-10-26)

Generic Workflow Engine (not per-module).

- Tables: `workflow_instances`, `workflow_histories`
- Statuses: DRAFT → PENDING → APPROVED → POSTED → CLOSED (+ REJECTED / CANCELLED)
- Actions: SUBMIT / APPROVE / REJECT / POST / CANCEL / CLOSE
- RBAC integrated (sales.approve, invoice.issue, …)
- Audit integrated (every action → audit_logs)
- Phase 1: Sales Orders auto-create workflow; Invoices ready
- Endpoints: POST /workflows/:id/{submit|approve|reject|post|cancel|close}
- See SPRINT6-ERD.md and SPRINT6-STRUCTURE.md

Run: `npm run migration:run && npm run seed`



---

## Sprint 7 – Event Bus Foundation (2026-10-26)

In-process Event Bus (no RabbitMQ/Kafka).

- Table: `event_logs`
- EventBus: publish / subscribe / unsubscribe / publishBatch / query
- Registry: Customer*, Product*, Sales*, Workflow*, Invoice*, Payment*
- Publishers: CustomersService, SalesOrdersService, WorkflowEngineService
- Subscribers: CustomerSubscriber, SalesSubscriber, WorkflowSubscriber, InvoiceSubscriber
- Audit remains separate (who) vs Event (what)
- See SPRINT7-ERD.md and SPRINT7-STRUCTURE.md

Run: `npm run migration:run && npm run seed`



---

## Sprint 8 – Feature Toggle Platform (2026-10-26)

Feature ≠ Permission ≠ Scope.

- Tables: `features`, `tenant_features`
- FeatureService: isEnabled / enable / disable / getFeatures / applyPlan
- @RequireFeature + FeatureGuard → 403 Feature Disabled
- Plan presets: Starter / Growth / Business / Enterprise
- Audit + Event Bus integration (FeatureEnabled / FeatureDisabled)
- See SPRINT8-ERD.md and SPRINT8-STRUCTURE.md

Run: `npm run migration:run && npm run seed`



---

## Sprint 9 – Business Copilot Runtime Foundation (2026-10-26)

Rule-based runtime. No LLM.

- Module: `business-copilot`
- APIs: POST /copilot/ask, /analyze, /recommend; GET /copilot/dashboard
- IntentResolver (keyword) → QueryEngine (scoped) → InsightEngine + RecommendationEngine
- Protected by Feature Toggle `business_copilot`
- Integrates Workflow, Audit, Event, Scope, Feature
- See SPRINT9-STRUCTURE.md

Run: `npm run migration:run && npm run seed`



---

## Sprint 10 – LLM Integration Layer (2026-10-26)

LLM → Copilot Runtime → QueryEngine → Platform. No direct DB access.

- AIProvider: Mock / OpenAI / Azure OpenAI
- PromptTemplateService + ContextBuilder
- GET /copilot/ceo-summary
- copilot_logs (migration 1737000000000)
- Feature: business_copilot_ai
- See SPRINT10-STRUCTURE.md

Run: `npm run migration:run && npm run seed`


---

## Dev Workflow – Test Data Hygiene (2026-10-31)

E2E suites create tenants, users, invoices, logs… and only close the Nest app;
they never delete their rows. Two helpers keep the database predictable.

### 0. One command (dùng trước khi tạo PR)

```bash
npm run verify        # lint → build → unit → full e2e trên DB tạm (43 suites / 186 tests)
npm run verify:fast   # lint + build + unit (khi sửa nhỏ)
```

### 1. Run e2e on a throw-away database (recommended)

```bash
npm run test:e2e:isolated                 # create business_os_e2e → migrate → seed → full e2e → drop
npm run test:e2e:isolated -- billing      # only matching spec files
npm run test:e2e:isolated -- --keep       # keep the DB for debugging (psql -d business_os_e2e)
```

The runner refuses to run if `E2E_DB_NAME` equals `DB_NAME`, so the dev
database can never be dropped by accident. Override the target with
`E2E_DB_NAME` / `E2E_MAINTENANCE_DB`.

### 2. Purge test data from the current database

```bash
npm run db:purge-test-data            # DRY-RUN: shows tenants/rows/users that would be deleted
npm run db:purge-test-data:apply      # delete them (single transaction)
```

Rules:

- Keeps tenant `ABC`, `CAFE_MOC` (override with `DEMO_TENANT_CODES`) and the
  demo users (override with `DEMO_USER_EMAILS`).
- Deletes every other tenant plus all rows carrying their `tenant_id`
  (works for the 56 tables that have `tenant_id` without a FK).
- Deletes users that only belonged to removed tenants, and test accounts left
  inside the demo tenants (`e2e.*`, `audit.*`, `revoke.*`, `limit-test-*`,
  `sso-*`, `sus-owner-*`, `@test.local`, `@test.vn`, `@example.com`).
- Refuses to run when a demo tenant is missing – run `npm run seed` first.

Demo subscription/plan baseline is restored by `npm run seed`
(`seedDemoSubscriptions`: ABC=professional, CAFE_MOC=starter, both ACTIVE).

### 3. CI

`.github/workflows/ci.yml` runs on every push/PR:

```
npm ci → npm run lint:check → npm run build → npm test -- --runInBand
       → npm run migration:run → npm run seed
       → npm run test:e2e -- --runInBand   # FULL suite (43 suites / 186 tests)
```

### 4. Production hardening (đã bật)

| Lớp | Cấu hình |
|---|---|
| Security headers | `helmet` trong `src/main.ts` (CSP tắt ở dev để Swagger UI chạy, bật default ở production) |
| Health probes | `GET /health` (liveness) và `GET /health/ready` (DB ping) — public, không qua prefix, `@SkipThrottle` |
| Rate limit toàn cục | `ThrottlerGuard` (APP_GUARD): `THROTTLE_TTL_MS` (mặc định 60000) × `THROTTLE_LIMIT` (mặc định 300) / IP |
| Rate limit login | `POST /api/v1/auth/login`: **10 request / phút / IP** |
| Rate limit admin | `AdminRateLimitGuard`: `ADMIN_MUTATE_LIMIT` (mặc định 30 mutation/phút/admin) |
| Body size | `BODY_LIMIT` (mặc định `1mb`) cho json + urlencoded |
| Secret bắt buộc | `JWT_SECRET`, `BANKING_WEBHOOK_SECRET`, `PAYMENT_WEBHOOK_SECRET` ≥ 32 ký tự khi `NODE_ENV=production` (fail-closed) |
| Prod guards | Từ chối boot nếu `SKIP_STEP_UP=true` hoặc `ALLOW_MOCK_PAYMENTS=true`; cảnh báo khi thiếu `CORS_ORIGIN` |
| Graceful shutdown | `app.enableShutdownHooks()` (SIGTERM/SIGINT) |
| CORS | `CORS_ORIGIN` danh sách phẩy; production mà unset ⇒ CORS tắt |
| Proxy | `TRUST_PROXY=<số hop>` khi chạy sau nginx/ALB để rate-limit theo IP thật |

Xem toàn bộ biến trong `.env.example`.

