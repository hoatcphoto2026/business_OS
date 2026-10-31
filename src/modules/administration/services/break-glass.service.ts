import { Injectable, Logger, ForbiddenException } from '@nestjs/common';

/**
 * P2 – Break-Glass Dual-Control
 * Emergency elevated access requiring two distinct admin approvals.
 * Sessions are short-lived and fully audited.
 */
export interface BreakGlassRequest {
  id: string;
  tenantId: string;
  requesterId: string;
  reason: string;
  approverId?: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  expiresAt: Date;
  createdAt: Date;
}

@Injectable()
export class BreakGlassService {
  private readonly logger = new Logger('BreakGlass');
  private readonly requests = new Map<string, BreakGlassRequest>();
  private readonly TTL_MS = 15 * 60 * 1000; // 15 minutes

  async request(tenantId: string, requesterId: string, reason: string): Promise<BreakGlassRequest> {
    const id = `bg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const req: BreakGlassRequest = {
      id,
      tenantId,
      requesterId,
      reason,
      status: 'pending',
      expiresAt: new Date(Date.now() + this.TTL_MS),
      createdAt: new Date(),
    };
    this.requests.set(id, req);
    this.logger.warn(`BREAK-GLASS REQUESTED id=${id} by=${requesterId} reason="${reason}"`);
    return req;
  }

  async approve(id: string, approverId: string): Promise<BreakGlassRequest> {
    const req = this.requests.get(id);
    if (!req || req.status !== 'pending' || Date.now() > req.expiresAt.getTime()) {
      throw new ForbiddenException('Invalid or expired break-glass request');
    }
    if (req.requesterId === approverId) {
      throw new ForbiddenException('Dual-control: approver must be different from requester');
    }
    req.status = 'approved';
    req.approverId = approverId;
    this.logger.warn(`BREAK-GLASS APPROVED id=${id} by=${approverId}`);
    return req;
  }

  async isActive(tenantId: string, userId: string): Promise<boolean> {
    for (const req of this.requests.values()) {
      if (
        req.tenantId === tenantId &&
        (req.requesterId === userId || req.approverId === userId) &&
        req.status === 'approved' &&
        Date.now() < req.expiresAt.getTime()
      ) {
        return true;
      }
    }
    return false;
  }

  listPending(tenantId: string): BreakGlassRequest[] {
    return Array.from(this.requests.values()).filter(
      (r) => r.tenantId === tenantId && r.status === 'pending' && Date.now() < r.expiresAt.getTime(),
    );
  }
}
