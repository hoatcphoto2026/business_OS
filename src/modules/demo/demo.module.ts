import { Module } from '@nestjs/common';
import { DemoController } from './demo.controller';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [RbacModule, TenantModule],
  controllers: [DemoController],
})
export class DemoModule {}
