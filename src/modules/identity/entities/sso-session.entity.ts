import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { SsoSessionStatus } from '../enums/identity.enum';

@Entity('sso_sessions')
export class SSOSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  state!: string;

  @Column({ type: 'varchar', length: 128 })
  nonce!: string;

  @Column({ type: 'varchar', length: 20, default: SsoSessionStatus.PENDING })
  status!: SsoSessionStatus;

  @Column({ name: 'external_subject', type: 'varchar', length: 255, nullable: true })
  externalSubject!: string | null;

  @Column({ name: 'trace_id', type: 'varchar', length: 128, nullable: true })
  traceId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'authenticated_at', type: 'timestamptz', nullable: true })
  authenticatedAt!: Date | null;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;
}
