import { Injectable } from '@nestjs/common';
import { CopilotIntent } from './copilot.types';

/**
 * Rule-based IntentResolver – Sprint 9 V1.
 * Keyword / phrase matching. No LLM.
 */
@Injectable()
export class IntentResolver {
  resolve(question: string): CopilotIntent {
    const q = (question || '').toLowerCase().trim();

    if (this.match(q, ['nợ nhiều nhất', 'top debt', 'nợ lớn nhất', 'khách nợ'])) {
      return CopilotIntent.TOP_DEBT_CUSTOMER;
    }
    if (this.match(q, ['doanh thu tháng', 'revenue this month', 'lợi nhuận tháng', 'monthly profit'])) {
      return CopilotIntent.REVENUE_THIS_MONTH;
    }
    if (this.match(q, ['chờ duyệt', 'pending workflow', 'đang chờ', 'pending'])) {
      return CopilotIntent.PENDING_WORKFLOWS;
    }
    if (this.match(q, ['sự kiện', 'event', 'recent events', 'salescreated'])) {
      return CopilotIntent.RECENT_EVENTS;
    }
    if (this.match(q, ['audit', 'ai sửa', 'ai xóa', 'ai vừa', 'nhật ký'])) {
      return CopilotIntent.RECENT_AUDIT_LOGS;
    }
    if (this.match(q, ['từ chối', 'rejected', 'rejection'])) {
      return CopilotIntent.WORKFLOW_REJECTIONS;
    }
    if (this.match(q, ['tồn kho', 'low stock', 'inventory', 'hết hàng'])) {
      return CopilotIntent.INVENTORY_LOW_STOCK;
    }
    if (this.match(q, ['bao nhiêu khách', 'customer count', 'số khách'])) {
      return CopilotIntent.CUSTOMER_COUNT;
    }
    if (this.match(q, ['hôm nay', 'sales today', 'doanh thu hôm nay', 'đơn hôm nay'])) {
      return CopilotIntent.SALES_TODAY;
    }
    if (this.match(q, ['lợi nhuận', 'profit'])) {
      return CopilotIntent.MONTHLY_PROFIT;
    }

    if (this.match(q, ['bao nhiêu người dùng', 'user count', 'số user', 'người dùng'])) {
      return CopilotIntent.USER_COUNT;
    }
    if (this.match(q, ['feature nào', 'tính năng', 'enabled feature', 'đang bật'])) {
      return CopilotIntent.ENABLED_FEATURES;
    }
    if (this.match(q, ['đăng nhập nhiều nhất', 'top login', 'login nhiều'])) {
      return CopilotIntent.TOP_LOGIN_USERS;
    }

    return CopilotIntent.UNKNOWN;
  }

  private match(q: string, phrases: string[]): boolean {
    return phrases.some((p) => q.includes(p));
  }
}
