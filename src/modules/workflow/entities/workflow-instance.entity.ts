import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkflowStatus } from '../enums/workflow-status.enum';

/**
 * WorkflowInstance – one per business entity that enters a workflow.
 * Generic via entityType + entityId so it can be reused for
 * SalesOrder, Invoice, PurchaseOrder, Payment, etc.
 */
@Entity('workflow_instances')
@Index(['tenantId', 'entityType', 'entityId'], { unique: true })
export class WorkflowInstance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid', nullable: false })
  tenantId!: string;

  @Index()
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId!: string | null;

  @Index()
  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId!: string | null;

  @Column({ name: 'entity_type', type: 'varchar', length: 100, nullable: false })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'uuid', nullable: false })
  entityId!: string;

  @Column({
    name: 'current_status',
    type: 'varchar',
    length: 30,
    default: WorkflowStatus.DRAFT,
  })
  currentStatus!: WorkflowStatus;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
