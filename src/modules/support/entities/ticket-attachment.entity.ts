import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { SupportTicket } from './support-ticket.entity';

/**
 * TicketAttachment – file attached to a ticket.
 * Stores metadata only; actual file storage is external (S3 / local).
 */
@Entity('ticket_attachments')
@Index(['ticketId'])
export class TicketAttachment extends BaseTenantEntity {
  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId!: string;

  @ManyToOne(() => SupportTicket, (t) => t.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket!: SupportTicket;

  @Column({ type: 'varchar', length: 255 })
  filename!: string;

  @Column({ name: 'content_type', type: 'varchar', length: 100, nullable: true })
  contentType!: string | null;

  @Column({ name: 'size_bytes', type: 'int', default: 0 })
  sizeBytes!: number;

  /** Storage key / URL */
  @Column({ type: 'varchar', length: 500 })
  url!: string;

  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy!: string;
}
