import { Injectable } from '@nestjs/common';
import { QueryEngine } from './query-engine';
import { CopilotIntent } from './copilot.types';

/**
 * InsightEngine – business health metrics aggregated from
 * Sales, Workflow, Audit, Event (Sprint 9).
 */
@Injectable()
export class InsightEngine {
  constructor(private readonly queryEngine: QueryEngine) {}

  async analyze(analysisType: string): Promise<Record<string, unknown>> {
    if (analysisType === 'business-health' || !analysisType) {
      const revenue = await this.queryEngine.execute(CopilotIntent.REVENUE_THIS_MONTH);
      const pending = await this.queryEngine.execute(CopilotIntent.PENDING_WORKFLOWS);
      const events = await this.queryEngine.execute(CopilotIntent.RECENT_EVENTS);
      const audit = await this.queryEngine.execute(CopilotIntent.RECENT_AUDIT_LOGS);
      const today = await this.queryEngine.execute(CopilotIntent.SALES_TODAY);

      const rev = Number(revenue.revenue ?? 0);
      return {
        revenueTrend: rev > 0 ? 'UP' : 'FLAT',
        revenueThisMonth: rev,
        pendingWorkflows: pending.pendingWorkflows ?? 0,
        recentEvents: events.recentEvents ?? 0,
        recentAuditActivities: audit.recentAuditActivities ?? 0,
        salesToday: today.salesToday ?? 0,
        revenueToday: today.revenueToday ?? 0,
      };
    }
    return { message: `Unknown analysisType: ${analysisType}` };
  }

  async dashboard(): Promise<Record<string, unknown>> {
    const health = await this.analyze('business-health');
    const customers = await this.queryEngine.execute(CopilotIntent.CUSTOMER_COUNT);
    return {
      ...health,
      customerCount: customers.customerCount ?? 0,
      topCustomers: [],
    };
  }
}
