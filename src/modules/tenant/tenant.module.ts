import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantUser } from './entities/tenant-user.entity';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, TenantUser])],
  controllers: [TenantController],
  providers: [TenantService, TenantGuard],
  exports: [TenantService, TypeOrmModule, TenantGuard],
})
export class TenantModule {}
