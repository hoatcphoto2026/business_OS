import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Controller('organization')
@UseGuards(JwtAuthGuard, TenantGuard)
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  @Get('companies')
  findCompanies() {
    return this.orgService.findCompanies();
  }

  @Get('companies/:id')
  findCompany(@Param('id') id: string) {
    return this.orgService.findCompanyById(id);
  }

  @Get('branches')
  findBranches(@Query('companyId') companyId?: string) {
    return this.orgService.findBranches(companyId);
  }

  @Get('departments')
  findDepartments(@Query('branchId') branchId?: string) {
    return this.orgService.findDepartments(branchId);
  }

  @Get('me/assignments')
  async myAssignments() {
    // In real app, get userId from context
    // Placeholder – actual implementation uses TenantContextService
    return { message: 'Use /organization/me/context after login' };
  }
}
