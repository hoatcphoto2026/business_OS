import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../event-bus.service';
import { EventType, DomainEvent } from '../enums/event-type.enum';

/**
 * Demo subscribers – Phase 1.
 * Real side-effects (inventory, invoice, accounting) come in later sprints.
 * These prove the bus delivers events and can be observed in tests.
 */
@Injectable()
export class CustomerSubscriber implements OnModuleInit {
  private readonly logger = new Logger(CustomerSubscriber.name);
  readonly received: DomainEvent[] = [];

  constructor(private readonly bus: EventBus) {}

  onModuleInit() {
    this.bus.subscribe(EventType.CustomerCreated, (e) => this.onCreated(e));
    this.bus.subscribe(EventType.CustomerUpdated, (e) => this.onUpdated(e));
    this.bus.subscribe(EventType.CustomerDeleted, (e) => this.onDeleted(e));
  }

  private onCreated(event: DomainEvent) {
    this.received.push(event);
    this.logger.log(`CustomerSubscriber received ${event.eventType} ${event.aggregateId}`);
  }

  private onUpdated(event: DomainEvent) {
    this.received.push(event);
  }

  private onDeleted(event: DomainEvent) {
    this.received.push(event);
  }
}

@Injectable()
export class SalesSubscriber implements OnModuleInit {
  private readonly logger = new Logger(SalesSubscriber.name);
  readonly received: DomainEvent[] = [];

  constructor(private readonly bus: EventBus) {}

  onModuleInit() {
    this.bus.subscribe(EventType.SalesCreated, (e) => this.onCreated(e));
    this.bus.subscribe(EventType.SalesUpdated, (e) => this.onUpdated(e));
    this.bus.subscribe(EventType.SalesCancelled, (e) => this.onCancelled(e));
  }

  private onCreated(event: DomainEvent) {
    this.received.push(event);
    this.logger.log(`SalesSubscriber received ${event.eventType} ${event.aggregateId}`);
  }

  private onUpdated(event: DomainEvent) {
    this.received.push(event);
  }

  private onCancelled(event: DomainEvent) {
    this.received.push(event);
  }
}

@Injectable()
export class WorkflowSubscriber implements OnModuleInit {
  private readonly logger = new Logger(WorkflowSubscriber.name);
  readonly received: DomainEvent[] = [];

  constructor(private readonly bus: EventBus) {}

  onModuleInit() {
    this.bus.subscribe(EventType.WorkflowSubmitted, (e) => this.track(e));
    this.bus.subscribe(EventType.WorkflowApproved, (e) => this.track(e));
    this.bus.subscribe(EventType.WorkflowRejected, (e) => this.track(e));
    this.bus.subscribe(EventType.WorkflowPosted, (e) => this.track(e));
    this.bus.subscribe(EventType.WorkflowCancelled, (e) => this.track(e));
    this.bus.subscribe(EventType.WorkflowClosed, (e) => this.track(e));
  }

  private track(event: DomainEvent) {
    this.received.push(event);
    this.logger.log(`WorkflowSubscriber received ${event.eventType} ${event.aggregateId}`);
  }
}

@Injectable()
export class InvoiceSubscriber implements OnModuleInit {
  private readonly logger = new Logger(InvoiceSubscriber.name);
  readonly received: DomainEvent[] = [];

  constructor(private readonly bus: EventBus) {}

  onModuleInit() {
    this.bus.subscribe(EventType.InvoiceIssued, (e) => this.track(e));
    this.bus.subscribe(EventType.InvoiceCancelled, (e) => this.track(e));
  }

  private track(event: DomainEvent) {
    this.received.push(event);
    this.logger.log(`InvoiceSubscriber received ${event.eventType} ${event.aggregateId}`);
  }
}
