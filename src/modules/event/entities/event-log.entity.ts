import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/**
 * EventLog – immutable store of every published domain event.
 * Separate from audit_logs:
 * - Audit = who did what (governance)
 * - EventLog = what happened (business facts for Copilot / subscribers)
 */
@Entity('event_logs')
export class EventLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid', nullable: false })
  tenantId!: string;

  @Index()
  @Column({ name: 'event_type', type: 'varchar', length: 100, nullable: false })
  eventType!: string;

  @Index()
  @Column({ name: 'aggregate_type', type: 'varchar', length: 100, nullable: false })
  aggregateType!: string;

  @Index()
  @Column({ name: 'aggregate_id', type: 'uuid', nullable: false })
  aggregateId!: string;

  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @Index()
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId!: string | null;

  @Index()
  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
