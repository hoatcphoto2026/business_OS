# Sprint 8 – Folder structure

```
src/modules/feature/
├── feature.module.ts
├── feature.controller.ts          GET /features, GET /tenant-features, POST enable/disable
├── feature-demo.controller.ts     GET /accounting/reports, GET /inventory (guard demo)
├── feature.service.ts             isEnabled / enable / disable / getFeatures / applyPlan
├── entities/
│   ├── feature.entity.ts
│   └── tenant-feature.entity.ts
├── enums/feature.enum.ts
├── guards/feature.guard.ts
└── decorators/require-feature.decorator.ts

src/database/migrations/1736000000000-CreateFeatureToggle.ts
src/database/seeds/feature.seeder.ts
```

Integrations:
- Audit: enable/disable → AuditService.logAction
- Event Bus: FeatureEnabled / FeatureDisabled
- Guard: `@RequireFeature('accounting')` + FeatureGuard → 403 "Feature Disabled"
