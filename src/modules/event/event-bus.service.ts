import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventLog } from './entities/event-log.entity';
import { DomainEvent, EventHandler, EventType } from './enums/event-type.enum';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { v4 as uuid } from 'uuid';

/**
 * EventBus – in-process Event Bus (Sprint 7 Phase 1).
 *
 * Responsibilities:
 * - publish / publishBatch
 * - subscribe / unsubscribe
 * - persist every event to event_logs (Event Store)
 * - tenant-scoped by construction (payload is stamped from context)
 *
 * Not an Event Sourcing store. Not RabbitMQ/Kafka.
 * Future: can be swapped for an outbox + broker without changing publishers.
 */
@Injectable()
export class EventBus {
  private readonly logger = new Logger(EventBus.name);
  private readonly handlers = new Map<EventType, Set<EventHandler>>();

  constructor(
    @InjectRepository(EventLog)
    private readonly eventLogs: Repository<EventLog>,
    private readonly tenantContext: TenantContextService,
  ) {}

  subscribe(eventType: EventType, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
    return () => this.unsubscribe(eventType, handler);
  }

  unsubscribe(eventType: EventType, handler: EventHandler): void {
    this.handlers.get(eventType)?.delete(handler);
  }

  async publish(
    eventType: EventType,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown> = {},
    overrides?: {
      tenantId?: string;
      companyId?: string | null;
      branchId?: string | null;
    },
  ): Promise<DomainEvent> {
    const ctx = this.tenantContext.getContext();
    const tenantId = overrides?.tenantId ?? ctx?.tenantId;
    if (!tenantId) {
      throw new Error('EventBus.publish: tenantId required');
    }

    const event: DomainEvent = {
      eventId: uuid(),
      tenantId,
      companyId: overrides?.companyId ?? ctx?.companyId ?? null,
      branchId: overrides?.branchId ?? ctx?.branchId ?? null,
      eventType,
      aggregateType,
      aggregateId,
      payload,
      createdAt: new Date(),
    };

    // Persist first (Event Store)
    await this.eventLogs.save(
      this.eventLogs.create({
        id: event.eventId,
        tenantId: event.tenantId,
        companyId: event.companyId,
        branchId: event.branchId,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload,
        createdAt: event.createdAt,
      }),
    );

    // Then notify in-process subscribers (fire-and-forget safe)
    await this.dispatch(event);

    this.logger.log(
      `Published ${event.eventType} ${aggregateType}:${aggregateId} tenant=${tenantId}`,
    );
    return event;
  }

  async publishBatch(
    events: Array<{
      eventType: EventType;
      aggregateType: string;
      aggregateId: string;
      payload?: Record<string, unknown>;
    }>,
  ): Promise<DomainEvent[]> {
    const results: DomainEvent[] = [];
    for (const e of events) {
      results.push(
        await this.publish(e.eventType, e.aggregateType, e.aggregateId, e.payload ?? {}),
      );
    }
    return results;
  }

  async query(filters: {
    eventType?: EventType;
    aggregateType?: string;
    aggregateId?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    tenantId?: string;
  }): Promise<EventLog[]> {
    const ctx = this.tenantContext.getContext();
    const tenantId = filters.tenantId ?? ctx?.tenantId;
    if (!tenantId) return [];

    const qb = this.eventLogs
      .createQueryBuilder('e')
      .where('e.tenant_id = :tenantId', { tenantId });

    if (filters.eventType) {
      qb.andWhere('e.event_type = :eventType', { eventType: filters.eventType });
    }
    if (filters.aggregateType) {
      qb.andWhere('e.aggregate_type = :aggregateType', {
        aggregateType: filters.aggregateType,
      });
    }
    if (filters.aggregateId) {
      qb.andWhere('e.aggregate_id = :aggregateId', { aggregateId: filters.aggregateId });
    }
    if (filters.from) {
      qb.andWhere('e.created_at >= :from', { from: filters.from });
    }
    if (filters.to) {
      qb.andWhere('e.created_at <= :to', { to: filters.to });
    }

    qb.orderBy('e.created_at', 'ASC').take(filters.limit ?? 200);
    return qb.getMany();
  }

  private async dispatch(event: DomainEvent): Promise<void> {
    const set = this.handlers.get(event.eventType);
    if (!set || set.size === 0) return;

    const tasks = Array.from(set).map(async (handler) => {
      try {
        await handler(event);
      } catch (err) {
        this.logger.error(
          `Subscriber failed for ${event.eventType}: ${(err as Error).message}`,
        );
      }
    });
    await Promise.all(tasks);
  }
}
