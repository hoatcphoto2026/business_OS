# Sprint 6 – Workflow Engine Foundation – ERD

## workflow_instances

| Column          | Type         | Notes                                      |
|-----------------|--------------|--------------------------------------------|
| id              | uuid PK      |                                            |
| tenant_id       | uuid FK      | → tenants.id (CASCADE)                     |
| company_id      | uuid FK      | → companies.id (SET NULL)                  |
| branch_id       | uuid FK      | → branches.id (SET NULL)                   |
| entity_type     | varchar(100) | e.g. `sales_order`, `invoice`              |
| entity_id       | uuid         | ID of the business entity                  |
| current_status  | varchar(30)  | DRAFT / PENDING / APPROVED / …             |
| created_by      | uuid FK      | → users.id                                 |
| created_at      | timestamptz  |                                            |
| updated_at      | timestamptz  |                                            |

**Unique:** (tenant_id, entity_type, entity_id)

## workflow_histories

| Column                 | Type         | Notes                               |
|------------------------|--------------|-------------------------------------|
| id                     | uuid PK      |                                     |
| workflow_instance_id   | uuid FK      | → workflow_instances.id (CASCADE)   |
| from_status            | varchar(30)  | nullable (null on creation)         |
| to_status              | varchar(30)  |                                     |
| action                 | varchar(30)  | SUBMIT / APPROVE / REJECT / …       |
| comment                | text         | optional                            |
| performed_by           | uuid FK      | → users.id                          |
| performed_at           | timestamptz  |                                     |

## Status flow (default Phase 1)

```
DRAFT ──SUBMIT──► PENDING ──APPROVE──► APPROVED ──POST──► POSTED ──CLOSE──► CLOSED
  │                  │                     │
  └──CANCEL──► CANCELLED ◄──CANCEL─────────┘
                     ▲
                     └──REJECT── (from PENDING)
```

## Integration points

- **RBAC**: action + entityType → permission code (sales.approve, invoice.issue, …)
- **Audit**: every action writes to `audit_logs` via AuditService.logAction
- **Generic**: no SalesWorkflow / InvoiceWorkflow classes – only entity_type + entity_id
