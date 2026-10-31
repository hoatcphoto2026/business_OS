# P2 Notes

## P2-1 Testing
- Unit specs added: `src/modules/billing/payment.safety.spec.ts` (ambiguous ref + secret policy).
- E2E already covers tenant isolation, webhooks, and payment flows (`*.e2e-spec.ts`).
- `DemoModule` is now gated: only loaded when `NODE_ENV !== 'production'`.
- `license-demo` endpoints remain for e2e of feature limits; they are behind auth + feature guards.

## P2-2 Operations
- Prometheus counters in automation modules are in-memory `Map`s. They reset on restart.
  For durable metrics, scrape `/metrics` into Prometheus (admin module already exposes counters via interceptor).
- `package.json` description updated to "Autonomous Enterprise SaaS Platform (EPIC A+B)".
- `TenantMiddleware` runs before guards, so `request.user` is empty there.
  Real tenant/user context is set by `TenantContextInterceptor` after `JwtAuthGuard`.
  Services must read context from the interceptor (ALS), not from middleware.
