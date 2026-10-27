import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/**
 * CopilotLog – AI audit trail (Sprint 10).
 * Separate from audit_logs (governance) and event_logs (business facts).
 */
@Entity('copilot_logs')
export class CopilotLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid', nullable: false })
  tenantId!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'text', nullable: false })
  question!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  intent!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  response!: Record<string, unknown> | null;

  @Column({ type: 'int', default: 0 })
  tokens!: number;

  @Column({ type: 'varchar', length: 30, nullable: true })
  provider!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
