import { Entity, Column } from 'typeorm';
import { BaseOrganizationEntity } from './base.entity';
import { WorkflowStatus } from '../../modules/workflow/enums/workflow-status.enum';

@Entity('invoices')
export class Invoice extends BaseOrganizationEntity {
  @Column({ type: 'varchar', length: 50, nullable: true })
  invoiceNumber!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  amount!: number;

  @Column({ type: 'varchar', length: 30, default: WorkflowStatus.DRAFT })
  status!: WorkflowStatus;
}