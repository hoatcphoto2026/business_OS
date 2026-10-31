import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EnterpriseOrgService } from './enterprise-org.service';
import {
  AssignUserDto,
  CreateCostCenterDto,
  CreateEnterpriseDepartmentDto,
  CreateEnterpriseOrgDto,
  CreateEnterpriseTeamDto,
  CreateOrgMembershipDto,
  MoveOrgUserDto,
} from './dto/enterprise-org.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@ApiTags('Enterprise Organization')
@ApiBearerAuth()
@Controller('org')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('admin.access')
export class EnterpriseOrgController {
  constructor(private readonly orgs: EnterpriseOrgService) {}

  @Post('organizations')
  @ApiOperation({ summary: 'Create an organization. parentId builds a multi-level org tree' })
  createOrganization(@Body() dto: CreateEnterpriseOrgDto) {
    return this.orgs.createOrganization(dto);
  }

  @Get('organizations')
  @ApiOperation({ summary: 'List organizations in the current tenant' })
  listOrganizations() {
    return this.orgs.listOrganizations();
  }

  @Post('departments')
  @ApiOperation({ summary: 'Create a department, optionally under another department' })
  createDepartment(@Body() dto: CreateEnterpriseDepartmentDto) {
    return this.orgs.createDepartment(dto);
  }

  @Post('teams')
  @ApiOperation({ summary: 'Create a team under a department' })
  createTeam(@Body() dto: CreateEnterpriseTeamDto) {
    return this.orgs.createTeam(dto);
  }

  @Post('cost-centers')
  @ApiOperation({ summary: 'Create a cost center' })
  createCostCenter(@Body() dto: CreateCostCenterDto) {
    return this.orgs.createCostCenter(dto);
  }

  @Get('cost-centers/report')
  @ApiOperation({ summary: 'Cost center reporting for one organization' })
  costCenterReport(@Query('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.orgs.costCenterReport(organizationId);
  }

  @Post('memberships')
  @ApiOperation({ summary: 'Add a user as organization admin, department manager, team lead, or member' })
  addMembership(@Body() dto: CreateOrgMembershipDto) {
    return this.orgs.addMembership(dto);
  }

  @Post('memberships/:id/move')
  @ApiOperation({ summary: 'Move a user to another department or team inside the same organization' })
  moveUser(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveOrgUserDto) {
    return this.orgs.moveUser(id, dto);
  }

  @Post('departments/:id/manager')
  @ApiOperation({ summary: 'Assign a department manager' })
  assignManager(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignUserDto) {
    return this.orgs.assignDepartmentManager(id, dto);
  }

  @Post('teams/:id/lead')
  @ApiOperation({ summary: 'Assign a team lead' })
  assignLead(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignUserDto) {
    return this.orgs.assignTeamLead(id, dto);
  }

  @Get('tree')
  @ApiOperation({ summary: 'Organization tree: nested organizations, departments, teams, and users' })
  tree(@Query('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.orgs.tree(organizationId);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Organization statistics, including child organizations' })
  statistics(@Query('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.orgs.statistics(organizationId);
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus metrics for organization management' })
  metrics() {
    return this.orgs.metrics();
  }
}
