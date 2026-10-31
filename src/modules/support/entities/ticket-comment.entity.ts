import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { SupportTicket } from './support-ticket.entity';

/**
 * TicketComment – reply / internal note on a ticket.
 */
@Entity('ticket_comments')
@Index(['ticketId'])
export class TicketComment extends BaseTenantEntity {
  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId!: string;

  @ManyToOne(() => SupportTicket, (t) => t.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket!: SupportTicket;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  @Column({ type: 'text' })
  body!: string;

  /** true = internal note (not visible to customer) */
  @Column({ name: 'is_internal', type: 'boolean', default: false })
  isInternal!: boolean;
}
