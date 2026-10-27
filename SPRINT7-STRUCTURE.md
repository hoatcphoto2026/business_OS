# Sprint 7 – Folder structure

```
src/modules/event/
├── event.module.ts
├── event-bus.service.ts          publish / subscribe / query + Event Store
├── entities/event-log.entity.ts
├── enums/event-type.enum.ts      registry of EventType + DomainEvent
└── subscribers/demo.subscribers.ts
    CustomerSubscriber
    SalesSubscriber
    WorkflowSubscriber
    InvoiceSubscriber

src/database/migrations/1735000000000-CreateEventLogs.ts
```

Publishers (Phase 1):
- CustomersService → CustomerCreated / Updated / Deleted
- SalesOrdersService → SalesCreated
- WorkflowEngineService → WorkflowSubmitted / Approved / Rejected / Posted / Cancelled / Closed

Audit remains independent. Event Bus does not replace Audit.
