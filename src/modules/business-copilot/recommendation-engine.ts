import { Injectable } from '@nestjs/common';
import { QueryEngine } from './query-engine';
import { FeatureService } from '../feature/feature.service';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { CopilotIntent } from './copilot.types';

export interface Recommendation {
  type: string;
  message: string;
}

/**
 * RecommendationEngine – rule-based business suggestions (Sprint 9).
 */
@Injectable()
export class RecommendationEngine {
  constructor(
    private readonly queryEngine: QueryEngine,
    private readonly featureService: FeatureService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async recommend(): Promise<Recommendation[]> {
    const recs: Recommendation[] = [];
    const tenantId = this.tenantContext.getContext()?.tenantId;

    const pending = await this.queryEngine.execute(CopilotIntent.PENDING_WORKFLOWS);
    const pendingCount = Number(pending.pendingWorkflows ?? 0);
    if (pendingCount > 10) {
      recs.push({
        type: 'workflow',
        message: `Có ${pendingCount} giao dịch đang chờ duyệt. Đề nghị xử lý để tránh chậm trễ.`,
      });
    } else if (pendingCount > 0) {
      recs.push({
        type: 'workflow',
        message: `Có ${pendingCount} giao dịch đang chờ duyệt.`,
      });
    }

    const inventory = await this.queryEngine.execute(CopilotIntent.INVENTORY_LOW_STOCK);
    if (Array.isArray((inventory as any).items) && (inventory as any).items.length > 0) {
      recs.push({
        type: 'inventory',
        message: 'Có mặt hàng tồn kho thấp. Đề nghị nhập thêm.',
      });
    }

    if (tenantId) {
      const accountingOn = await this.featureService.isEnabled(tenantId, 'accounting');
      if (!accountingOn) {
        recs.push({
          type: 'feature',
          message: 'Đề nghị bật Accounting Module để tự động hóa báo cáo tài chính.',
        });
      }
    }

    if (recs.length === 0) {
      recs.push({
        type: 'general',
        message: 'Mọi thứ đang ổn. Tiếp tục theo dõi doanh thu và workflow.',
      });
    }

    return recs;
  }
}
