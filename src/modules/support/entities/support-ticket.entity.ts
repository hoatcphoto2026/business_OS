import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { TicketStatus, TicketPriority } from '../enums/ticket.enum';
import { TicketComment } from './ticket-comment.entity';
import { TicketAttachment } from './ticket-attachment.entity';

/**
 * SupportTicket – customer support ticket.
 */
@Entity('support_tickets')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'priority'])
export class SupportTicket extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 255 })
  subject!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: TicketStatus.OPEN,
  })
  status!: TicketStatus;

  @Column({
    type: 'varchar',
    length: 20,
    default: TicketPriority.MEDIUM,
  })
  priority!: TicketPriority;

  /** Customer user who opened the ticket */
  @Index()
  @Column({ name: 'requester_id', type: 'uuid' })
  requesterId!: string;

  /** Support agent assigned to the ticket */
  @Column({ name: 'assignee_id', type: 'uuid', nullable: true })
  assigneeId!: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @OneToMany(() => TicketComment, (c) => c.ticket, { cascade: true })
  comments!: TicketComment[];

  @OneToMany(() => TicketAttachment, (a) => a.ticket, { cascade: true })
  attachments!: TicketAttachment[];
}
