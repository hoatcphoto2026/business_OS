# AGENTS.md

> Entry point for AI agents working in this repository.

**Read [`ENGINEERING-GUARDRAILS.md`](./ENGINEERING-GUARDRAILS.md) before changing any code.**

Non-negotiables (short version):

1. Tenant isolation everywhere: `tenant_id` comes from ALS, never from the client.
2. Permissions are tenant-scoped → always pass `tenantId` to `hasPermission`.
3. JWT principal field is `req.user.userId` (not `.id` / `.sub`).
4. Sensitive mutations require real step-up flow — never loosen test assertions to pass.
5. `npm run seed` on an empty DB must leave `ABC` + `CAFE_MOC` with ACTIVE subscriptions.
6. Verify with `npm run verify` — lint + build + unit + isolated e2e (43 suites / 186 tests).

See `.clinerules` for the enforced checklist.
