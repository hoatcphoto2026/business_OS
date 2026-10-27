import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

/**
 * Copilot-ready history API.
 *
 * Examples:
 *   GET /audit-logs?entity_type=customer&entity_id=<uuid>
 *   GET /audit-logs?entity_type=sales_order&entity_id=<uuid>&action=DELETE
 *   GET /audit-logs?action=APPROVE&from_date=2026-01-01&to_date=2026-01-31
 *   GET /audit-logs?performed_by=<user uuid>
 *
 * Scope (Sprint 4) is applied inside AuditService. A sales user with SELF
 * only receives rows whose owner_id they are allowed to see.
 */
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermission('audit.view')
  findAll(@Query() query: QueryAuditLogDto) {
    return this.auditService.query(query);
  }
}
