# Sprint 9 – Business Copilot Runtime Foundation

Rule-based runtime. No LLM.

```
src/modules/business-copilot/
├── business-copilot.module.ts
├── copilot.controller.ts          POST /copilot/ask|analyze|recommend, GET /copilot/dashboard
├── copilot.service.ts
├── intent-resolver.ts             keyword → CopilotIntent
├── query-engine.ts                intent → scoped SQL (tenant + scope)
├── insight-engine.ts              business-health + dashboard
├── recommendation-engine.ts       workflow / feature suggestions
├── copilot.types.ts
└── dto/copilot.dto.ts
```

Protected by `@RequireFeature('business_copilot')`.

Intent V1: top_debt_customer, monthly_profit, pending_workflows, recent_events,
recent_audit_logs, workflow_rejections, inventory_low_stock, customer_count,
sales_today, revenue_this_month.

Sprint 10 can replace IntentResolver with an LLM without touching QueryEngine,
InsightEngine, or RecommendationEngine.
