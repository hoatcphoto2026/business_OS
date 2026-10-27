import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from './entities/company.entity';
import { Branch } from './entities/branch.entity';
import { Department } from './entities/department.entity';
import { UserCompany } from './entities/user-company.entity';
import { UserBranch } from './entities/user-branch.entity';
import { UserDepartment } from './entities/user-department.entity';
import { OrganizationService } from './organization.service';
import { OrganizationController } from './organization.controller';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TenantModule, // provides TenantGuard + Tenant/TenantUser repositories
    TypeOrmModule.forFeature([
      Company,
      Branch,
      Department,
      UserCompany,
      UserBranch,
      UserDepartment,
    ]),
  ],
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService, TypeOrmModule],
})
export class OrganizationModule {}
