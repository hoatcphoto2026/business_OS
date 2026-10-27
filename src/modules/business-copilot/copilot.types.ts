/**
 * Intent V1 – rule-based (Sprint 9).
 * Designed so Sprint 10 can replace this resolver with an LLM
 * without changing QueryEngine / InsightEngine / RecommendationEngine.
 */
export enum CopilotIntent {
  TOP_DEBT_CUSTOMER = 'top_debt_customer',
  MONTHLY_PROFIT = 'monthly_profit',
  PENDING_WORKFLOWS = 'pending_workflows',
  RECENT_EVENTS = 'recent_events',
  RECENT_AUDIT_LOGS = 'recent_audit_logs',
  WORKFLOW_REJECTIONS = 'workflow_rejections',
  INVENTORY_LOW_STOCK = 'inventory_low_stock',
  CUSTOMER_COUNT = 'customer_count',
  SALES_TODAY = 'sales_today',
  REVENUE_THIS_MONTH = 'revenue_this_month',
  USER_COUNT = 'user_count',
  ENABLED_FEATURES = 'enabled_features',
  TOP_LOGIN_USERS = 'top_login_users',
  UNKNOWN = 'unknown',
}

export interface CopilotResponse {
  intent: string;
  answer: Record<string, unknown>;
  recommendations: Array<{ type: string; message: string }>;
  generatedAt: string;
}
