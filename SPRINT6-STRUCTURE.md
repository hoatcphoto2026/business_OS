# Sprint 6 – Folder structure

```
src/modules/workflow/
├── workflow.module.ts
├── workflow.controller.ts          /workflows/:id/{submit|approve|...}
├── workflow-engine.service.ts      createWorkflow + actions + history + RBAC + audit
├── dto/workflow.dto.ts
├── entities/
│   ├── workflow-instance.entity.ts
│   └── workflow-history.entity.ts
└── enums/
    ├── workflow-status.enum.ts
    └── workflow-action.enum.ts

src/database/migrations/1734000000000-CreateWorkflowEngine.ts
```

Phase 1 targets: Sales Orders (auto-create workflow on SO create) + Invoices (engine ready).

Request path for approve:

```
POST /api/v1/workflows/:id/approve
  → JwtAuthGuard + TenantGuard + PermissionGuard
  → WorkflowEngineService.approve
      → RBAC check (sales.approve / invoice.issue)
      → transition validation
      → update current_status
      → insert workflow_histories
      → AuditService.logAction (APPROVE)
```
