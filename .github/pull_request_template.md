# Pull Request

## Summary

<!-- What changed and why (1–3 bullet points). -->

-

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no behaviour change)
- [ ] Migration / schema change
- [ ] Docs / tooling / CI only

## Scope

<!-- Modules touched (e.g. billing, rbac, auth, workflow) + affected endpoints. -->

| Module | Endpoint / file | Breaking? |
|--------|-----------------|-----------|
|        |                 | No        |

---

## Guardrails checklist (see [`ENGINEERING-GUARDRAILS.md`](../ENGINEERING-GUARDRAILS.md))

- [ ] **Tenant isolation**: every new/changed query filters `tenant_id` from ALS — no client-supplied tenant id.
- [ ] **Tenant-scoped permissions**: every `hasPermission(...)` call passes `tenantId` (cache key `${tenantId}:${userId}`).
- [ ] **JWT principal**: guards/controllers read `req.user.userId` (not `.id` / `.sub`).
- [ ] **Step-up**: sensitive mutations use `@RequireStepUp` + `StepUpGuard`; tests exercise the real flow
      (`/admin/step-up/initiate` → `/verify` → `X-Step-Up-Token`).
- [ ] **No loosened assertions**: no `expect([200, 412])` / `[200, 400]` added to make tests pass.
- [ ] **Tenant status**: `ACTIVE | TRIAL | PAST_DUE` allowed; `billing.mapStatusToTenant` stays in sync with
      `auth.service.ts` + `TenantGuard`.
- [ ] **Seed contract**: `npm run seed` on an empty DB still leaves `ABC` + `CAFE_MOC` with active
      tenant / membership / roles / plan **and an ACTIVE subscription**.
- [ ] New entity extends `BaseTenantEntity`, registered in `app.module.ts`, migration timestamp is unique.
- [ ] Guard order respected: `JwtAuthGuard → TenantGuard → PermissionGuard → FeatureGuard → StepUpGuard`.
- [ ] Audit + event published for new business actions.

## Verification evidence

Commands run (paste the **actual** result lines, not old ones):

```bash
npm run verify          # lint + build + unit + isolated e2e
```

- [ ] `npm run lint:check` — no **errors** (`__ warnings`)
- [ ] `npm run build` — OK
- [ ] `npm test -- --runInBand` — `__ suites / __ tests passed`
- [ ] `npm run test:e2e:isolated` — `__ suites / __ tests passed` (baseline: 43/189 as of 2026-10-31)
- [ ] Re-ran with `NODE_ENV=test` (required if auth / guard / billing / seed changed) — OK
- [ ] Login smoke: `admin@abctrading.vn` / `Password123!` / `ABC` → 200 + accessToken

## Data & environment hygiene

- [ ] Full e2e was NOT run against `DB_NAME` (used `test:e2e:isolated`), or if it was:
      `npm run db:purge-test-data:apply && npm run seed` was executed afterwards.
- [ ] No test tenants/users left behind (only `ABC`, `CAFE_MOC` + 6 demo users).
- [ ] No absolute sandbox paths (`/tmp/...`, `/workspace/...`) committed.
- [ ] Root stays clean — no `main.ts` / `tracing.ts` / `ci.yml` copies, no 0-byte or temp `.txt` files.

## Docs

- [ ] `README.md` / sprint notes updated if behaviour or commands changed.
- [ ] New lesson learned added to the table in `ENGINEERING-GUARDRAILS.md` §5.

## Rollback

<!-- How to revert safely: migration:revert? feature flag? data restore? -->
