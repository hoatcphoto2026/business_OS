import { Injectable } from '@nestjs/common';
import { AIProvider } from './ai-provider.interface';

/**
 * MockProvider – deterministic, no network.
 * Used for tests and local demo. Mirrors the keyword rules
 * so Sprint 9 cases keep passing while going through the LLM path.
 */
@Injectable()
export class MockProvider implements AIProvider {
  readonly name = 'mock';

  async classifyIntent(question: string, allowedIntents: string[]) {
    const q = (question || '').toLowerCase();
    const rules: Array<[string[], string]> = [
      [['nợ nhiều nhất', 'top debt', 'nợ lớn nhất', 'khách nợ'], 'top_debt_customer'],
      [['doanh thu tháng', 'revenue this month', 'lợi nhuận tháng'], 'revenue_this_month'],
      [['chờ duyệt', 'pending workflow', 'đang chờ', 'pending'], 'pending_workflows'],
      [['sự kiện', 'event', 'recent events'], 'recent_events'],
      [['audit', 'ai sửa', 'ai xóa', 'ai vừa', 'nhật ký'], 'recent_audit_logs'],
      [['từ chối', 'rejected'], 'workflow_rejections'],
      [['tồn kho', 'low stock', 'inventory'], 'inventory_low_stock'],
      [['bao nhiêu khách', 'customer count', 'số khách'], 'customer_count'],
      [['hôm nay', 'sales today', 'doanh thu hôm nay'], 'sales_today'],
      [['lợi nhuận', 'profit'], 'monthly_profit'],
    ];

    let intent = 'unknown';
    for (const [phrases, code] of rules) {
      if (phrases.some((p) => q.includes(p)) && allowedIntents.includes(code)) {
        intent = code;
        break;
      }
    }

    return { intent, confidence: intent === 'unknown' ? 0.2 : 0.95, tokens: 12 };
  }

  async summarize(context: Record<string, unknown>, instruction: string) {
    const text = `[Mock] ${instruction} → ${JSON.stringify(context).slice(0, 280)}`;
    return { text, tokens: 30 };
  }

  async generateInsights(metrics: Record<string, unknown>) {
    const insights: string[] = [];
    const rev = Number(metrics.revenueThisMonth ?? metrics.revenue ?? 0);
    if (rev > 0) insights.push(`Doanh thu tháng này đạt ${rev.toLocaleString('vi-VN')}.`);
    const pending = Number(metrics.pendingWorkflows ?? 0);
    if (pending > 0) insights.push(`Có ${pending} workflow đang chờ duyệt.`);
    const events = Number(metrics.recentEvents ?? 0);
    if (events > 0) insights.push(`24h qua có ${events} sự kiện nghiệp vụ.`);
    if (insights.length === 0) insights.push('Chưa đủ dữ liệu để tạo insight.');
    return { insights, tokens: 40 };
  }

  async generateRecommendations(signals: Record<string, unknown>) {
    const recs: Array<{ type: string; message: string }> = [];
    const pending = Number(signals.pendingWorkflows ?? 0);
    if (pending > 10) {
      recs.push({
        type: 'workflow',
        message: `Có ${pending} giao dịch đang chờ duyệt. Đề nghị xử lý để tránh chậm trễ.`,
      });
    } else if (pending > 0) {
      recs.push({
        type: 'workflow',
        message: `Có ${pending} giao dịch đang chờ duyệt.`,
      });
    }
    if (signals.accountingEnabled === false) {
      recs.push({
        type: 'feature',
        message: 'Đề nghị bật Accounting Module để tự động hóa báo cáo tài chính.',
      });
    }
    if (recs.length === 0) {
      recs.push({
        type: 'general',
        message: 'Mọi thứ đang ổn. Tiếp tục theo dõi doanh thu và workflow.',
      });
    }
    return { recommendations: recs, tokens: 25 };
  }
}
