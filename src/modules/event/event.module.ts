import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventLog } from './entities/event-log.entity';
import { EventBus } from './event-bus.service';
import {
  CustomerSubscriber,
  SalesSubscriber,
  WorkflowSubscriber,
  InvoiceSubscriber,
} from './subscribers/demo.subscribers';

@Module({
  imports: [TypeOrmModule.forFeature([EventLog])],
  providers: [
    EventBus,
    CustomerSubscriber,
    SalesSubscriber,
    WorkflowSubscriber,
    InvoiceSubscriber,
  ],
  exports: [EventBus],
})
export class EventModule {}
