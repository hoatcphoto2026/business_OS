# Sprint 4 – Data Scope Engine ERD

```
┌──────────────┐       ┌─────────────────┐
│    roles     │       │   role_scopes   │
│──────────────│       │─────────────────│
│ id (PK)      │───┐   │ id (PK)         │
│ tenant_id    │   └──▶│ role_id (FK)    │
│ code         │       │ resource        │
│ name         │       │ scope           │  SELF | TEAM | BRANCH | COMPANY | TENANT
└──────────────┘       └─────────────────┘

┌──────────────┐       ┌─────────────────┐
│    teams     │       │  team_members   │
│──────────────│       │─────────────────│
│ id (PK)      │───┐   │ id (PK)         │
│ tenant_id    │   └──▶│ team_id (FK)    │
│ company_id   │       │ user_id (FK)    │
│ branch_id    │       │ is_manager      │
│ code         │       └─────────────────┘
│ name         │
│ manager_id   │
└──────────────┘

Business tables (customers, sales_orders, …)
extend BaseOrganizationEntity:
- tenant_id
- company_id
- branch_id
- owner_id          ← used by SELF / TEAM scopes
- created_by / updated_by
```

**Flow**
1. User has Role(s) via `user_roles`
2. Role has Scope(s) via `role_scopes` for each resource
3. Effective scope = highest priority among user's roles
4. ScopeService builds WHERE clause
5. ScopeAwareRepository injects it into every query
