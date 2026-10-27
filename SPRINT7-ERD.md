# Sprint 7 – Event Bus Foundation – ERD

## event_logs

| Column          | Type         | Notes                                      |
|-----------------|--------------|--------------------------------------------|
| id              | uuid PK      | = eventId                                  |
| tenant_id       | uuid FK      | → tenants.id (CASCADE)                     |
| event_type      | varchar(100) | CustomerCreated, SalesCreated, WorkflowApproved, … |
| aggregate_type  | varchar(100) | customer, sales_order, invoice, …          |
| aggregate_id    | uuid         | ID of the business aggregate               |
| payload         | jsonb        | event-specific data                        |
| company_id      | uuid FK      | optional                                   |
| branch_id       | uuid FK      | optional                                   |
| created_at      | timestamptz  |                                            |

**Indexes:** tenant, event_type, (aggregate_type, aggregate_id), created_at, (tenant, event_type, created_at)

## Separation of concerns

| System     | Answers                          | Table        |
|------------|----------------------------------|--------------|
| Audit Log  | Who did what (governance)        | audit_logs   |
| Event Log  | What happened (business facts)   | event_logs   |

## Flow

```
Service (create / approve / …)
  → EventBus.publish()
       → persist event_logs
       → in-process subscribers (CustomerSubscriber, SalesSubscriber, WorkflowSubscriber, InvoiceSubscriber)
```

Phase 1 is in-process only. No RabbitMQ / Kafka / Event Sourcing.
