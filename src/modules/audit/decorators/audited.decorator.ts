import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '../enums/audit-action.enum';

export const AUDITED_KEY = 'audit:options';

export interface AuditedOptions {
  /** Stable name stored in audit_logs.entity_type. e.g. "customer". */
  entityType: string;
  /**
   * Optional explicit action. When omitted, the interceptor maps
   * POST → CREATE, PUT/PATCH → UPDATE, DELETE → DELETE.
   */
  action?: AuditAction;
}

/**
 * Marks a controller handler for the AuditInterceptor.
 * Business services stay free of manual audit calls.
 */
export const Audited = (options: AuditedOptions) =>
  SetMetadata(AUDITED_KEY, options);
