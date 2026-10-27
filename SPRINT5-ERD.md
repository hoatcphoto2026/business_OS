# Sprint 5 – Audit Log Foundation

Governance layer on top of Tenant + Organization + RBAC + Scope.
No workflow, no event bus, no feature flags.

```
┌──────────────────────────────────────────────────────────────┐
│                         audit_logs                           │
│──────────────────────────────────────────────────────────────│
│ id              uuid PK                                      │
│ tenant_id       uuid FK → tenants          (always required) │
│ company_id      uuid FK → companies        nullable          │
│ branch_id       uuid FK → branches         nullable          │
│ entity_type     varchar   customer | product | sales_order   │
│                           | session                          │
│ entity_id       uuid      business id, or user id for session│
│ action          varchar   CREATE UPDATE DELETE RESTORE       │
│                           APPROVE REJECT POST CANCEL         │
│                           LOGIN LOGOUT                       │
│ old_data        jsonb     null on CREATE                     │
│ new_data        jsonb     null on DELETE                     │
│ performed_by    uuid FK → users             who did it       │
│ owner_id        uuid      scope anchor (SELF / TEAM)         │
│ ip_address      varchar(64)                                  │
│ user_agent      text                                         │
│ created_at      timestamptz                                  │
└──────────────────────────────────────────────────────────────┘

Indexes
  (tenant_id)
  (entity_type, entity_id)
  (performed_by)
  (action)
  (created_at)
  (tenant_id, owner_id)                         -- scope
  (tenant_id, entity_type, entity_id, created_at) -- copilot history

Phase 1 writers
  customers ──┐
  products  ──┼── @Audited() ── AuditInterceptor ── AuditService
  sales_orders┘
  auth login / logout ── AuditService.logLogin / logLogout
```

## Why `owner_id` is on the log

Sprint 4 SELF/TEAM filters `owner_id` of the business row. After DELETE that
row is gone, so the audit line keeps a copy. It is not a new access model:
queries still start with `tenant_id = current tenant`, then the same
ScopeService scope for the resource (`customer`, `product`, `sales_order`,
`audit` for sessions).

## Who can read a line

| Scope   | Audit rows returned                                      |
|---------|----------------------------------------------------------|
| SELF    | `owner_id = me`                                          |
| TEAM    | `owner_id` in my teams                                   |
| BRANCH  | `branch_id = current branch`                             |
| COMPANY | `company_id = current company`                           |
| TENANT  | every row of this tenant                                 |

Another tenant never matches, even with the entity id.

## UPDATE shape

Only changed business fields are stored (bookkeeping and secrets stripped):

```json
{ "old_data": { "name": "Cafe Mộc" }, "new_data": { "name": "Cafe Mộc Premium" } }
```

CREATE keeps a snapshot in `new_data`. DELETE keeps a snapshot in `old_data`.
Replaying CREATE + UPDATEs answers “what changed, and who”.

## Copilot questions this table can already answer

| Question                         | Query                                                                 |
|----------------------------------|-----------------------------------------------------------------------|
| Who edited this customer?        | `entity_type=customer&entity_id=:id&action=UPDATE`                    |
| Who deleted this order?          | `entity_type=sales_order&entity_id=:id&action=DELETE`                 |
| Who approved a transaction?      | `action=APPROVE` (writer lands in Sprint 6 via `logAction`)           |
| History of customer KH001        | `entity_type=customer&entity_id=:id` ordered by `created_at`          |

## Explicitly not in this sprint

Workflow engine, event bus, feature toggles. `logAction()` and the varchar
action column are the extension points so those sprints do not reshape
tenant, organization, RBAC, or the scope engine.
