# ENGINEERING GUARDRAILS – Business OS Backend

> **Đọc file này trước khi sửa code.** Đây là "bộ nhớ dài hạn" của dự án:
> các lỗi thật đã từng xảy ra, cách phòng tránh, và Definition of Done.
> Cập nhật lần cuối: 2026-11-01 (D6 dashboard, D7 forecast, D8 warehouse + supply-chain hardening).

---

## 1. Bất biến kiến trúc — KHÔNG được vi phạm

### 1.1 Tenant isolation
- Mọi entity nghiệp vụ phải `extends BaseTenantEntity` và mọi query phải có `tenant_id`
  lấy từ ALS (`TenantContextService`), **không bao giờ tin `tenantId` từ client**.
- `TenantGuard` chỉ validate; context thật do `TenantContextInterceptor` set sau `JwtAuthGuard`.

### 1.2 Permission phải scoped theo tenant
- `roles` có `tenant_id` ⇒ **quyền phải resolve theo tenant của request**:
  `AuthorizationService.hasPermission(userId, permission, tenantId)`.
- Cache key là `${tenantId}:${userId}` (không phải `userId`) — nếu thêm call site mới
  mà quên truyền `tenantId` là mở lại lỗ hổng leo thang đặc quyền cross-tenant.
- Call site hiện tại: `PermissionGuard`, `WorkflowEngineService.perform`, `RbacService/Controller`.

### 1.3 JWT field name
- `JwtStrategy.validate()` trả `{ userId, tenantId, role, email, tokenVersion, companyId, branchId, departmentId }`.
- Guard/controller dùng `req.user.userId`. `.id` / `.sub` chỉ là fallback.
- Đã từng sai ở đúng chỗ này: `StepUpGuard` đọc `.id || .sub` ⇒ **mọi step-up trả 412 vĩnh viễn**.

### 1.4 Step-up authentication
- Endpoint mutation nhạy cảm (billing change-plan/cancel, admin, api-key, break-glass…)
  phải có `@RequireStepUp(action)` + `StepUpGuard`.
- `action` trong `@RequireStepUp` phải khớp `action` dùng khi initiate (`billing.change-plan`, `billing.cancel`…).
- Test phải đi luồng thật: `POST /admin/step-up/initiate` → `/verify` (code 6 số) → header `X-Step-Up-Token`.
- **Không được** nới `expect([200, 412])` để test xanh — chính thói quen đó đã che bug 1.3.

### 1.5 Trạng thái tenant / subscription phải đồng bộ
- `TenantGuard` + `AuthService` cho phép: `ACTIVE`, `TRIAL`, `PAST_DUE`.
  - `PAST_DUE` là **có chủ đích**: `BillingService.mapStatusToTenant` map `CANCELLED → PAST_DUE`
    để owner còn login mà reactivate. Chặn nghiệp vụ là việc của `SubscriptionGuard`/`FeatureGuard`.
- `SUSPENDED` / `CLOSED` thì chặn.
- Đổi mapping ở `billing.service.ts` ⇒ phải rà lại `auth.service.ts` + `common/guards/tenant.guard.ts`.

### 1.6 Hợp đồng dữ liệu seed
Sau `npm run seed`, **DB trắng** phải dùng được ngay:

| Hạng mục | Yêu cầu |
|---|---|
| Tenant demo | `ABC`, `CAFE_MOC` tồn tại, `status = active` |
| User demo | 6 email trong `DEMO_USER_EMAILS`, membership `active` |
| RBAC | roles + permissions gán đúng tenant |
| Billing | plan (4 gói) **và subscription ACTIVE** cho từng tenant demo (`seedDemoSubscriptions`) |
| Master data | currencies / uoms / taxes / terms / logistics |
| Idempotent | chạy seed lần 2 không tạo bản ghi trùng, và tự recover trạng thái bị test làm hỏng |

Thêm bảng/feature mới ⇒ cập nhật seeder tương ứng, đừng để e2e phải "tự tạo nền".

### 1.7 Hardening (đã bật, giữ nguyên)
- `helmet` bật trong `src/main.ts` (CSP tắt ở dev cho Swagger UI, bật ở production).
- **Health probes**: `GET /health`, `GET /health/ready` — public, `@SkipThrottle`, không nằm dưới prefix `api/v1`.
- **Metrics**: dùng `MetricsService` (prom-client registry dùng chung ở `src/common/metrics`).
  Không tạo `Map<string, number>` counter riêng trong service mới; dùng `metrics.inc(name, labels)` /
  `metrics.set(...)` để có label và không mất số liệu khi module khác scrape.
- `ThrottlerGuard` là `APP_GUARD` toàn cục: `THROTTLE_TTL_MS` × `THROTTLE_LIMIT` theo IP.
  `POST /auth/login` bị giới hạn chặt hơn: **10 request/phút/IP**.
  Endpoint public mới cân nhắc `@Throttle` chặt hơn hoặc `@SkipThrottle` (có lý do rõ ràng).
- `BODY_LIMIT` (mặc định 1mb) cho json/urlencoded; `app.enableShutdownHooks()`.
- Production **fail-closed**: `JWT_SECRET`, `BANKING_WEBHOOK_SECRET`, `PAYMENT_WEBHOOK_SECRET` ≥ 32 ký tự;
  từ chối boot khi `SKIP_STEP_UP=true` hoặc `ALLOW_MOCK_PAYMENTS=true`.
- Chạy sau proxy/LB ⇒ phải set `TRUST_PROXY` để rate limit dùng IP thật.

### 1.8 SCIM provisioning (C4)
- SCIM requests carry **no JWT/ALS**: the tenant always comes from the bearer-token endpoint
  (`request.scimEndpoint.tenantId`), never from the body/query.
- Endpoint tokens are stored **hashed (sha256)**; the plaintext token is returned only once
  (`POST /scim/endpoints`, rotate via `/scim/endpoints/:id/rotate-token`).
- Every provisioning mutation writes `scim_provisioning_logs` (operation, status, attempts,
  trace id, resource id). Failures retry up to `SCIM_MAX_ATTEMPTS` then become **DEAD** (DLQ).
- Mapping is idempotent by `(endpoint_id, resource_type, external_id)`; SCIM resource `id`
  is the mapping id, never the internal user/team id.
- Tenant isolation: every query filters by `endpoint.tenantId` **and** `endpointId`.
- Bulk: tối đa 100 operation/lần, mỗi operation có status riêng; sort chỉ nhận thuộc tính trong whitelist
  (`userName`, `displayName`, `externalId`, `id`, `meta.created`).

### 1.9 Security telemetry (C6)
- `AuthService` ghi **mọi** login attempt vào `security_login_attempts` (success + lý do thất bại).
  `LoginAttemptService.record()` tự catch lỗi — telemetry **không được** làm login fail.
- Geo baseline: `x-country-code` chỉ đáng tin khi edge proxy strip bản client gửi lên.
  Country lạ đầu tiên tạo `GEO_ANOMALY` và set `anomalous = true` trên attempt (detection đọc cờ này,
  không suy đoán lại từ timestamp).
- Rotate secret (`API_KEY` / `SCIM_TOKEN` / `WEBHOOK_SECRET`) và approve/revoke emergency access
  phải có `@RequireStepUp('security.*')` + `StepUpGuard`; test chạy flow thật, không nới assertion.
- Break-glass dual-control: approver ≠ requester, grant tự hết hạn; `list()` chuyển grant quá hạn
  (`PENDING`/`APPROVED`) sang `EXPIRED`.
- Alert rules mặc định seed cho `ABC` + `CAFE_MOC` (`src/database/seeds/security.seeder.ts`).
  Thêm event type mới ⇒ cập nhật seeder, đừng để e2e tự tạo nền.

### 1.10 Reporting (C7)
- CSV/Excel/PDF dùng **chung** `src/common/reports/tabular-export.ts`
  (`compliance-export.format.ts` chỉ re-export) — không copy thêm exporter.
- Report SQL luôn pin `tenant_id`; JSON/CSV/Excel/PDF đều đi qua cùng `generate()`
  + cùng period để số liệu khớp nhau.
- Delivery semantics: `IN_APP` = notification row thật; `EMAIL` = notification channel email
  (mock transport như EPIC A/B); `WEBHOOK` = `integration_logs` + `assertSafeWebhookUrl`.
  Mọi attempt phải ghi `report_deliveries` (`SENT` / `FAILED` / `SKIPPED`).
- Schedules: `next_run_at` tính khi create/update/run; worker 5 phút chỉ chạy row đã due.
  Seed 2 schedule/tenant (`src/database/seeds/reporting.seeder.ts`).

### 1.11 Executive metrics (D1)
- KPI executive là **platform-wide aggregate** (MRR/ARR/ARPU/LTV, tenant/user activity) nên chỉ
  platform operator được gọi: `PLATFORM_ADMIN_EMAILS`. Production mà list rỗng ⇒ toàn bộ endpoint 403
  (fail-closed). Dev/test fallback `admin@abctrading.vn`.
- Snapshot/metric cache lưu dưới tenant của operator (`tenant_id` vẫn được filter khi đọc);
  không tạo tenant riêng cho analytics.
- `metric_history` refresh theo `(tenant, period, ngày)` — snapshot lại trong cùng ngày không nhân đôi điểm.
- Cron daily/monthly và `POST /executive/snapshots` dùng chung `generateSnapshot()`; gauges Prometheus
  (`executive_mrr`, `executive_arr`, `executive_*_rate_pct`, …) set từ cùng summary.

### 1.12 Revenue intelligence (D2)
- Analytics doanh thu là **platform-wide** → dùng chung operator allowlist với D1
  (`PLATFORM_ADMIN_EMAILS`); snapshot/metric cache lưu dưới tenant operator.
- Expansion/contraction + upgrade/downgrade trends đọc `audit_logs` entity `Subscription`
  (`old_data.planCode` + `new_data.planCode`). `BillingService.changePlan` **phải** giữ `oldData`;
  bỏ đi là mất khả năng tính expansion/contraction.
- `Revenue By Country` dùng `tenants.settings.country` (seed `VN`), fallback `UNKNOWN`.
- Snapshot refresh theo `(tenant, snapshot_date, period)`; segment unique
  `(tenant, dimension, segment_key, period)`; forecast unique `(tenant, horizon, as_of)`.

### 1.13 Customer health (D3)
- `/health` + `/health/ready` là **public probes** (guardrail §1.7) — KHÔNG đổi. Dashboard D3 ở
  `/customer-health`; alias không trùng đặt tại `/health/dashboard`, `/health/at-risk`, `/health/tenant/:id`.
- Scoring platform-wide → operator allowlist (`PLATFORM_ADMIN_EMAILS`); scores/snapshots lưu dưới tenant operator.
- 7 tín hiệu có trọng số tổng = 100 (`health_signals` seed cho ABC); sửa weight ⇒ cập nhật seeder.
- `health_snapshots` unique `(tenant, target_tenant_id, snapshot_date)`; chạy lại trong ngày không nhân đôi điểm.
- Audit snapshot phải dùng `entity_id` thật (AuditService bỏ qua khi id null).

### 1.14 Product analytics (D4)
- Feature usage lưu theo **tenant khách hàng** (`feature_usage`); adoption/trend lưu dưới tenant operator.
  Endpoint `/analytics/features*` là operator-only, chia sẻ prefix `/analytics` với analytics tenant nhưng
  chỉ thêm path mới (`features`, `adoption`, `trends`) — không đè route cũ.
- `collect` derive usage từ bảng nghiệp vụ (sales_orders, invoices, customers, products, support_tickets,
  report_runs, compliance_evidence, security_events, scim_provisioning_logs, api_keys, scheduled_jobs)
  với `dedupe_key = FEATURE:tenant:day` + `ON CONFLICT DO NOTHING` ⇒ chạy lại không nhân đôi.
- Adoption dimensions: TENANT / ORGANIZATION / DEPARTMENT / PLAN; ORG/DEPT lấy từ cột trên usage row
  (tracked event nhận `organizationId`/`departmentId`), null ⇒ `UNASSIGNED`.
- `feature_trends` unique `(tenant, feature_key, period_date)`; `feature_adoption` unique
  `(tenant, feature_key, dimension, dimension_key, period)`. Audit `collect` cần `entity_id` thật.

### 1.15 Growth intelligence (D5)
- Growth metrics platform-wide → operator allowlist (`PLATFORM_ADMIN_EMAILS`); snapshot/experiment/segment
  lưu dưới tenant operator, endpoint `/growth*` operator-only.
- Trial/paid conversion lấy từ `audit_logs` (`Subscription` UPDATE: `old_data.status` → `new_data.status`)
  và subscription `created_at`/`trial_end`; expansion/upsell lấy từ plan-price delta (audit old/new planCode).
- Acquisition source dùng `tenants.settings.source` (seed `direct`), fallback `UNKNOWN`.
- `growth_snapshots` unique `(tenant, date, period)`, `growth_segments` unique
  `(tenant, dimension, key, period)`, `growth_experiments` unique `(tenant, name)`.
- `changePlan` đổi từ enterprise → professional là **DOWNGRADE** (không phải upgrade) — test phải assert đúng chiều.

### 1.16 Executive dashboard (D6)
- `GET /executive/dashboard` là endpoint **superset**: giữ nguyên field D1 (`kpis`, `metrics`,
  `latestDaily`, `latestMonthly`, `trends`) và thêm `widgets`, `alerts`, `summaries`, `meta`, `range`.
  Không tạo route trùng; mọi thay đổi phải giữ test D1 xanh.
- 7 widget cố định: `REVENUE | GROWTH | CUSTOMERS | COMPLIANCE | SECURITY | AUTOMATION | OPERATIONS`;
  mỗi widget có `status` (`OK | WARNING | CRITICAL`), `primary`, `secondary`, `drilldown`.
- Drill-down: `GET /executive/widgets/:key` trả widget + `details` (rows thật); key lạ → 404.
- Alerts suy ra từ dữ liệu D1–D5 + bảng vận hành: `REVENUE_DROP` (MRR < -5% so snapshot trước),
  `CHURN_SPIKE` (churn candidates ≥ max(1, 10% tenants)), `SECURITY_SPIKE` (open critical/high),
  `SYSTEM_RISK` (past-due + failed onboarding + failed job). Không lưu bảng alert riêng.
- Date range `from`/`to` (ISO) áp cho widget/alerts; `from > to` hoặc sai format → 400.
- Toàn bộ `/executive/*` vẫn qua `PlatformOperatorGuard` + `PLATFORM_ADMIN_EMAILS`; non-operator → 403.

### 1.17 Supply-chain & payload hardening
- **Audit gate**: `npm run audit:gate` (chạy trong CI sau `npm ci`) đọc `npm audit --omit=dev --json`
  và fail nếu có advisory **critical/high** chưa nằm trong `security/audit-allowlist.json`.
  Mỗi entry bắt buộc có `owner`, `mitigation`, `expiresOn`; hết hạn ⇒ gate fail để buộc review lại.
  Không được thêm entry chỉ để "cho xanh" — phải kèm biện pháp giảm thiểu thật.
- `bcrypt` (native, kéo `tar` critical + `@mapbox/node-pre-gyp`) đã thay bằng `bcryptjs`;
  hash `$2b$` tương thích, seed/login không đổi hành vi.
- **JWT**: production mặc định RS256 khi có `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`.
  HS256 **bị chặn** ở production trừ khi `JWT_ALLOW_HS256_IN_PRODUCTION=true` (escape hatch tạm thời,
  có log cảnh báo). Logic tập trung ở `src/modules/auth/jwt.config.ts` — không đọc `JWT_SECRET` rải rác.
- **Upload**: không dùng `FileInterceptor` trần. Luôn `FileInterceptor('file', buildMulterOptions())`
  (`src/common/uploads/upload.config.ts`) để có giới hạn fileSize/files/fields/parts + MIME allowlist;
  `multipartLimitMiddleware()` trả 413 cho multipart vượt `UPLOAD_MAX_REQUEST_BYTES`. Không có upload
  endpoint nào được phép bỏ qua hai lớp này.

### 1.18 Forecast engine (D7)
- 3 bảng: `forecast_models` (unique `tenant, metric, method`), `forecast_runs` (mỗi lần chạy là 1
  history entry), `forecast_results` (unique `run, metric, method, horizon`; FK → run CASCADE).
- 5 metrics (`REVENUE | CUSTOMER_GROWTH | CHURN | USAGE | TICKET_VOLUME`) × 3 methods
  (`MOVING_AVERAGE | TREND_PROJECTION | SEASONAL_ANALYSIS`) × 3 horizons (`30 | 90 | 365`) = 45 results/run.
- Chuỗi lịch sử lấy **platform-wide** (operator-only) và neo theo **`CURRENT_DATE` của DB**, không theo
  giờ Node — nếu không, timezone UTC+7 làm lệch 1 ngày và test horizon sẽ fail.
- `node-postgres` parse cột `date` thành `Date` local-midnight ⇒ format bằng `getFullYear/getMonth/getDate`,
  **không** dùng `toISOString()` (lệch ngày).
- Mọi run ghi audit `entity_type = 'forecast_run'`, metrics `forecast_runs_total{status}`,
  `forecast_results_total{metric}`, gauges `forecast_latest_value` / `forecast_confidence_pct`.
- Chạy lại chỉ subset (metric/method/horizon) không được nhân bản model; `lastRunAt` cập nhật, tổng model giữ 15.
- Seed contract: sau `npm run seed`, operator `ABC` có đủ 15 model ACTIVE.

### 1.19 Analytics warehouse (D8)
- Star schema: 5 dimension (`warehouse_dim_tenants|plans|organizations|departments|dates`) + 5 fact
  (`fact_revenue|usage|customer|compliance|security`) + `warehouse_snapshots`. Mọi bảng
  `extends BaseTenantEntity` với `tenant_id` = tenant operator; `source_tenant_id` = tenant bị đo.
- Grain fact = 1 dòng / ngày / source tenant (/ metric hoặc plan). Unique constraint đúng grain
  ⇒ ETL `ON CONFLICT DO UPDATE` là idempotent; chạy lại cùng window không nhân bản dữ liệu.
- `POST /warehouse/etl` nhận `from/to` (mặc định 7 ngày), refresh dimensions + 5 facts, ghi audit
  `entity_type = warehouse_etl`; trả counts thật. `refreshDimensions=false` để chạy nhanh.
- Dimension date là spine `CURRENT_DATE ±` (đủ 365+ ngày) — seed sẵn để dashboard không phụ thuộc ETL.
- Fact API trả **camelCase** (`factDate`, `revenueAmount`…), cột `date` format theo local date
  (không dùng `toISOString()`), và validate `from <= to` (nếu không → 400).
- Overview/trends dùng `generate_series` zero-fill theo DB `CURRENT_DATE`; snapshot unique
  `(tenant, snapshot_date, period_type)` nên generate lại chỉ update, không tạo bản ghi mới.
- Prometheus: `warehouse_etl_runs_total{status}`, `warehouse_fact_rows_total{fact}`,
  `warehouse_fact_rows{fact}`, `warehouse_snapshots_total{period}`, `warehouse_revenue_30d`,
  `warehouse_snapshot_*`; audit `warehouse_snapshot`.
- Seed contract: sau `npm run seed`, operator `ABC` có date spine + plans + tenants + orgs + departments.

---

## 2. Definition of Done — verify trước khi báo "xong"

- [ ] `npm run verify` → lint + build + unit + e2e isolated (baseline hiện tại: **54 suites / 291 tests PASS**)
- [ ] Sửa nhỏ thì chạy nhanh `npm run verify:fast` (lint + build + unit)
- [ ] Muốn xem warning của lint: `npm run lint:check` (CI fail khi có **error**, warning không chặn)
- [ ] Nếu chạm auth / guard / billing / seed: chạy lại với `NODE_ENV=test` (parity CI)
- [ ] Smoke test login: `admin@abctrading.vn` / `Password123!` / tenant `ABC` → 200 + accessToken
- [ ] Báo **số liệu thật** của lần chạy vừa rồi (không copy số cũ, không suy đoán)
- [ ] Nếu đổi hành vi: cập nhật `README.md` / `README-EPIC-A-B.md` / notes tương ứng

---

## 3. Vệ sinh dữ liệu & môi trường

- e2e mặc định chạy trên **DB riêng** `business_os_e2e` (`npm run test:e2e:isolated`) —
  runner tự tạo → migrate → seed → test → drop, và **từ chối chạy nếu trùng `DB_NAME`**.
  Ngoài ra `test/setup-e2e.ts` (jest `setupFiles`) **ép `process.env.DB_NAME`** khi
  `E2E_ISOLATED=1`, nên kể cả shell/session leak `DB_NAME` thì e2e cũng không thể ghi vào DB app.
- Nếu buộc chạy `npm run test:e2e` trên DB dev thì **sau đó phải**:
  `npm run db:purge-test-data:apply` → `npm run seed`.
- Không để lại tenant/user rác: chỉ `ABC` + `CAFE_MOC` (+ 6 demo user) là hợp lệ.
- Chạy `npm run test:e2e` (không isolated) trên DB dev ⇒ DB đó **phải** đã
  `npm run migration:run` + `npm run seed`; `test/e2e-preflight.js` (Jest `globalSetup`)
  sẽ chặn ngay nếu thiếu bảng C4–C6 (thay vì 17 test fail vì `relation does not exist`).
  Sau khi chạy xong vẫn phải `db:purge-test-data:apply` + `seed`.
- Không commit đường dẫn tuyệt đối của sandbox (`/tmp/...`, `/workspace/...`).
  Dùng `path.resolve(__dirname, ...)` hoặc đường dẫn tương đối với repo.
- Test phải **tự tạo dữ liệu riêng và cleanup**; không phụ thuộc thứ tự chạy giữa các suite
  (ví dụ: một suite huỷ subscription thì phải restore `ACTIVE` trong `afterAll`).

---

## 4. Cấu trúc repo — giữ sạch

| Sai | Đúng |
|---|---|
| `main.ts`, `tracing.ts` ở root | chỉ `src/main.ts`, `src/tracing.ts` |
| `ci.yml` ở root | chỉ `.github/workflows/ci.yml` |
| File 0 byte (`nest`, `npm`, `pkg@version`) | không tạo; kiểm tra `git status` trước khi commit |
| Log tạm `.txt` ở root | ghi ra thư mục tạm hoặc xoá ngay sau khi chạy |
| `.sql` bootstrap tay trùng migration | mọi schema đi qua `src/database/migrations` |
| Config test trỏ `/tmp/node_modules` | dùng config trong `package.json` / `test/jest-e2e.json` |

---

## 5. Lỗi cụ thể đã từng xảy ra — đừng lặp lại

| # | Triệu chứng | Nguyên nhân gốc | Đã fix tại |
|---|---|---|---|
| 1 | Mọi endpoint step-up trả 412 | `StepUpGuard` đọc `req.user.id/sub` thay vì `userId` | `administration/guards/step-up.guard.ts` |
| 2 | User admin tenant A có quyền admin ở tenant B | `AuthorizationService` bỏ qua `roles.tenant_id`, cache theo `userId` | `rbac/authorization.service.ts`, `permission.guard.ts`, `workflow-engine.service.ts`, `rbac.service/controller.ts` |
| 3 | DB trắng: `GET /billing/subscription` = null, invoice 500 `uuid "undefined"`, license `NO_SUBSCRIPTION` | Seeder chỉ seed `plans`, không tạo subscription cho tenant demo | `database/seeds/billing.seeder.ts` (`seedDemoSubscriptions`), `run-seed.ts` |
| 4 | Huỷ subscription ⇒ tenant bị khoá, không login/reactivate được | `CANCELLED → PAST_DUE` nhưng `AuthService` + `TenantGuard` chỉ cho `ACTIVE/TRIAL` | `auth/auth.service.ts`, `common/guards/tenant.guard.ts` |
| 5 | Suite billing/license/invoice fail trên DB trắng | Test "chấp nhận 412" rồi vẫn assert như đã đổi plan | `test/license.e2e-spec.ts` (step-up flow thật) |
| 6 | DB phình 121 tenant / 274 user | e2e không teardown | `scripts/purge-test-data.ts`, `scripts/run-e2e-isolated.js` |
| 7 | CI xanh nhưng thực tế 3 suite fail | CI chỉ chạy `administration` | `.github/workflows/ci.yml` (full e2e) |
| 8 | `npm run lint` lỗi vì thiếu `eslint` | Script khai báo nhưng dependency chưa cài; config test còn trỏ `/tmp` | `.eslintrc.js`, devDeps `eslint` + `@typescript-eslint/*`, CI step `lint:check` |
| 9 | Thiếu header bảo mật & rate limit toàn cục | Chưa có `helmet`, chưa có giới hạn request theo IP | `src/main.ts` (helmet + `TRUST_PROXY`), `src/app.module.ts` (`ThrottlerGuard` + `THROTTLE_*`) |
| 10 | SSO test pass nhưng IdP thật (Google/Entra) không login được | `verifyIdToken` chỉ hỗ trợ HS256 (client secret), không đọc JWKS; discovery lại khai báo RS256 | `identity.service.ts`: RS256/384/512 + JWKS cache/kid rotation + exchange authorization code server-side |
| 11 | Chạy `npm run verify` nhưng dữ liệu e2e vẫn rơi vào DB app | `DB_NAME` từ shell/.env thắng env của runner trong tiến trình Jest | `test/setup-e2e.ts` (jest `setupFiles`) ép `DB_NAME` khi `E2E_ISOLATED=1` + runner set `E2E_ISOLATED`/`E2E_DB_NAME` |

---

## 6. Checklist khi thêm module / endpoint mới

1. Entity `extends BaseTenantEntity` (trừ bảng global: `users`, `plans`, `permissions`…).
2. Migration mới: timestamp **không trùng**, có `IF NOT EXISTS` khi thêm cột vào bảng cũ.
3. Đăng ký entity vào danh sách `entities` trong `app.module.ts` (dự án dùng cả `autoLoadEntities` và list tường minh).
4. Thứ tự guard chuẩn:
   `JwtAuthGuard → TenantGuard → PermissionGuard → FeatureGuard → (StepUpGuard nếu mutation nhạy cảm)`.
5. Có audit (`AuditService.logAction` / `@Audited`) và event (`EventBus`) nếu là nghiệp vụ.
6. Seeder idempotent + recover trạng thái (nếu phục vụ demo/e2e).
7. e2e: tạo dữ liệu riêng, cleanup, không phụ thuộc suite khác, không nới assertion.
8. Cập nhật `README.md` (mục Sprint/Module) + guardrails này nếu phát sinh bài học mới.

---

## 7. Lệnh nhanh

```bash
# Verify đầy đủ (không bẩn DB dev) — 1 lệnh duy nhất
npm run verify                         # lint → build → unit → e2e isolated
npm run verify:fast                    # lint + build + unit (sửa nhỏ)

# Debug 1 suite trên DB tạm
npm run test:e2e:isolated -- billing --keep

# Dọn dữ liệu test trên DB hiện tại
npm run db:purge-test-data             # dry-run
npm run db:purge-test-data:apply

# Reset baseline demo
npm run seed
```

---

## 8. Về "trí nhớ"

Mình (AI) **không có bộ nhớ giữa các phiên**. File này chính là bộ nhớ đó.
Đầu mỗi phiên làm việc, đọc theo thứ tự:

1. `ENGINEERING-GUARDRAILS.md` (file này)
2. `git status --short` + `git --no-pager diff --stat`
3. `README.md` (mục Dev Workflow) và notes mới nhất (`P1-NOTES.md`, `P2-NOTES.md`)

Nếu phát hiện lỗi/bài học mới → **thêm vào bảng mục 5** ngay trong cùng PR/commit.

