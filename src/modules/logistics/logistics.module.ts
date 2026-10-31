import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogisticsController } from './logistics.controller';
import { DeliveryOrderService } from './delivery-order.service';
import { TrackingService } from './tracking.service';
import { CarrierService } from './carrier.service';
import { CodService } from './cod.service';
import { MockCarrierProvider } from './providers/mock.provider';
import { DeliveryOrder } from './entities/delivery-order.entity';
import { DeliveryTrackingEvent } from './entities/delivery-tracking-event.entity';
import { Carrier } from './entities/carrier.entity';
import { CodSettlement } from './entities/cod-settlement.entity';
import { EventModule } from '../event/event.module';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeliveryOrder, DeliveryTrackingEvent, Carrier, CodSettlement]),
    EventModule,
    TenantModule,
    RbacModule,
  ],
  controllers: [LogisticsController],
  providers: [
    DeliveryOrderService,
    TrackingService,
    CarrierService,
    CodService,
    MockCarrierProvider,
    TenantGuard,
  ],
  exports: [DeliveryOrderService, CodService],
})
export class LogisticsModule {}
