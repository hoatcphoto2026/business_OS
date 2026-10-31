import { Injectable, NotFoundException, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateTicketDto, ReplyTicketDto, AssignTicketDto } from './dto/ticket.dto';
import { SupportTicket } from './entities/support-ticket.entity';
import { TicketComment } from './entities/ticket-comment.entity';
import { TicketAttachment } from './entities/ticket-attachment.entity';
import { TicketStatus, TicketPriority } from './enums/ticket.enum';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { NotificationService } from '../notification/notification.service';

// moved to dto/ticket.dto.ts

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    @InjectRepository(SupportTicket)
    private readonly tickets: Repository<SupportTicket>,
    @InjectRepository(TicketComment)
    private readonly comments: Repository<TicketComment>,
    @InjectRepository(TicketAttachment)
    private readonly attachments: Repository<TicketAttachment>,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  private getTenantId(): string {
    const tid = this.tenantContext.getCurrentTenantId();
    if (!tid) throw new ForbiddenException('No tenant context');
    return tid;
  }

  private getUserId(): string {
    const uid = this.tenantContext.getCurrentUserId();
    if (!uid) throw new ForbiddenException('No user context');
    return uid;
  }

  async create(dto: CreateTicketDto): Promise<SupportTicket> {
    const tenantId = this.getTenantId();
    const requesterId = this.getUserId();

    const ticket = this.tickets.create({
      tenantId,
      subject: dto.subject,
      description: dto.description ?? null,
      priority: dto.priority ?? TicketPriority.MEDIUM,
      status: TicketStatus.OPEN,
      requesterId,
      createdBy: requesterId,
    });

    const saved = await this.tickets.save(ticket);

    try {
      await this.audit.logAction('support_ticket', saved.id, AuditAction.CREATE, {
        newData: { subject: saved.subject, priority: saved.priority },
      });
    } catch {
      this.logger.warn('Audit skipped on ticket create');
    }

    // Notify (in-app) – in production also email support team
    try {
      await this.notifications.send({
        userId: requesterId,
        title: 'Ticket created',
        body: `Your ticket "${saved.subject}" has been opened.`,
        eventType: 'TicketCreated',
        data: { ticketId: saved.id },
      });
    } catch {
      this.logger.warn('Notification skipped on ticket create');
    }

    return saved;
  }

  async list(status?: TicketStatus): Promise<SupportTicket[]> {
    const tenantId = this.getTenantId();
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.tickets.find({
      where,
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async get(id: string): Promise<SupportTicket> {
    const tenantId = this.getTenantId();
    const ticket = await this.tickets.findOne({
      where: { id, tenantId },
      relations: ['comments', 'attachments'],
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async assign(id: string, dto: AssignTicketDto): Promise<SupportTicket> {
    const ticket = await this.get(id);
    const userId = this.getUserId();

    ticket.assigneeId = dto.assigneeId;
    ticket.status = TicketStatus.IN_PROGRESS;
    ticket.updatedBy = userId;

    const saved = await this.tickets.save(ticket);

    try {
      await this.audit.logAction('support_ticket', id, AuditAction.UPDATE, {
        newData: { assigneeId: dto.assigneeId, status: TicketStatus.IN_PROGRESS },
      });
    } catch {}

    try {
      await this.notifications.send({
        userId: dto.assigneeId,
        title: 'Ticket assigned',
        body: `You have been assigned ticket: ${ticket.subject}`,
        eventType: 'TicketAssigned',
        data: { ticketId: id },
      });
    } catch {}

    return saved;
  }

  async reply(id: string, dto: ReplyTicketDto): Promise<TicketComment> {
    const ticket = await this.get(id);
    const authorId = this.getUserId();

    const comment = this.comments.create({
      tenantId: ticket.tenantId,
      ticketId: id,
      authorId,
      body: dto.body,
      isInternal: dto.isInternal ?? false,
      createdBy: authorId,
    });

    const saved = await this.comments.save(comment);

    // Auto-transition status
    if (ticket.status === TicketStatus.WAITING_CUSTOMER && !dto.isInternal) {
      ticket.status = TicketStatus.IN_PROGRESS;
      await this.tickets.save(ticket);
    }

    try {
      await this.audit.logAction('ticket_comment', saved.id, AuditAction.CREATE, {
        newData: { ticketId: id, isInternal: dto.isInternal },
      });
    } catch {}

    // Notify the other party
    const notifyUser = dto.isInternal ? null : (ticket.assigneeId || ticket.requesterId);
    if (notifyUser && notifyUser !== authorId) {
      try {
        await this.notifications.send({
          userId: notifyUser,
          title: 'New reply on ticket',
          body: dto.body.slice(0, 200),
          eventType: 'TicketReplied',
          data: { ticketId: id },
        });
      } catch {}
    }

    return saved;
  }

  async close(id: string): Promise<SupportTicket> {
    const ticket = await this.get(id);
    const userId = this.getUserId();

    ticket.status = TicketStatus.CLOSED;
    ticket.updatedBy = userId;

    const saved = await this.tickets.save(ticket);

    try {
      await this.audit.logAction('support_ticket', id, AuditAction.UPDATE, {
        newData: { status: TicketStatus.CLOSED },
      });
    } catch {}

    try {
      await this.notifications.send({
        userId: ticket.requesterId,
        title: 'Ticket closed',
        body: `Your ticket "${ticket.subject}" has been closed.`,
        eventType: 'TicketClosed',
        data: { ticketId: id },
      });
    } catch {}

    return saved;
  }

  async addAttachment(ticketId: string, filename: string, url: string, sizeBytes = 0, contentType?: string): Promise<TicketAttachment> {
    const ticket = await this.get(ticketId);
    const userId = this.getUserId();

    const att = this.attachments.create({
      tenantId: ticket.tenantId,
      ticketId,
      filename,
      url,
      sizeBytes,
      contentType: contentType ?? null,
      uploadedBy: userId,
      createdBy: userId,
    });

    return this.attachments.save(att);
  }
}
