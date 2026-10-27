import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository, SelectQueryBuilder } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

/**
 * Persistence port for audit_logs.
 * Tenant filtering is applied by AuditService on every read.
 * This repository does not expose an unscoped find().
 */
@Injectable()
export class AuditLogRepository {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repository: Repository<AuditLog>,
  ) {}

  create(data: DeepPartial<AuditLog>): AuditLog {
    return this.repository.create(data);
  }

  save(entity: AuditLog): Promise<AuditLog> {
    return this.repository.save(entity);
  }

  queryBuilder(alias = 'audit'): SelectQueryBuilder<AuditLog> {
    return this.repository.createQueryBuilder(alias);
  }
}
