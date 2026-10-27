# Sprint 5 – Folder structure

```
src/modules/audit/
├── audit.module.ts
├── audit.controller.ts          GET /audit-logs
├── audit.service.ts             logCreate logUpdate logDelete logAction logLogin logLogout query
├── audit.repository.ts
├── audit-scope.ts               scope predicate (reuses ScopeService)
├── audit.serializer.ts          snapshot + diff, strips secrets
├── audit.types.ts
├── audit.foundation.spec.ts     cases 1–6 without Postgres
├── audit.serializer.spec.ts
├── decorators/audited.decorator.ts
├── dto/query-audit-log.dto.ts
├── entities/audit-log.entity.ts
├── enums/audit-action.enum.ts
└── interceptors/audit.interceptor.ts

src/database/migrations/1733000000000-CreateAuditLogs.ts
src/modules/products/            controller + service (phase 1 target)
src/modules/sales-orders/        controller added (phase 1 target)
test/audit.e2e-spec.ts           HTTP cases against Postgres
```

Request path for a customer update:

```
PATCH /api/v1/customers/:id
  → JwtAuthGuard + TenantGuard + PermissionGuard
  → TenantContextInterceptor (ALS)
  → AuditInterceptor loads the pre-image
  → CustomersService.update (scope-aware)
  → AuditInterceptor → AuditService.logUpdate
  → audit_logs
```

Services do not call the audit writer. Login and logout do, because there
is no business entity yet when the session starts.
