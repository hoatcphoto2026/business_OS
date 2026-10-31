import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutoInvoice } from './entities/auto-invoice.entity';
import { AutoInvoiceItem } from './entities/auto-invoice-item.entity';
import { AutoInvoiceService } from './auto-invoice.service';
import { AutoInvoiceController } from './auto-invoice.controller';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AutoInvoice, AutoInvoiceItem]),
    TenantModule,
    RbacModule,
    AuditModule,
  ],
  controllers: [AutoInvoiceController],
  providers: [AutoInvoiceService],
  exports: [AutoInvoiceService],
})
export class AutoInvoiceModule {}
