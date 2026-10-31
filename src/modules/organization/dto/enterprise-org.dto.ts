import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrgMembershipRole, OrgUnitStatus } from '../enums/enterprise-org.enum';

export class CreateEnterpriseOrgDto {
  @ApiProperty()
  @IsString()
  @MaxLength(50)
  code!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class CreateEnterpriseDepartmentDto {
  @ApiProperty()
  @IsUUID()
  organizationId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(50)
  code!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  managerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  costCenterId?: string;
}

export class CreateEnterpriseTeamDto {
  @ApiProperty()
  @IsUUID()
  departmentId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(50)
  code!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  leadId?: string;
}

export class CreateCostCenterDto {
  @ApiProperty()
  @IsUUID()
  organizationId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(50)
  code!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}

export class CreateOrgMembershipDto {
  @ApiProperty()
  @IsUUID()
  organizationId!: string;

  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: OrgMembershipRole })
  @IsEnum(OrgMembershipRole)
  role!: OrgMembershipRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  teamId?: string;
}

export class MoveOrgUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  teamId?: string;
}

export class AssignUserDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;
}

/** PATCH payload – only the provided fields change. */
export class UpdateOrgUnitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ enum: OrgUnitStatus })
  @IsOptional()
  @IsEnum(OrgUnitStatus)
  status?: OrgUnitStatus;
}

export class UpdateEnterpriseOrgDto extends UpdateOrgUnitDto {
  @ApiPropertyOptional({ description: 'Move the node under another organization' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class UpdateEnterpriseDepartmentDto extends UpdateOrgUnitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  costCenterId?: string;
}

export class UpdateEnterpriseTeamDto extends UpdateOrgUnitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ description: 'Move the team to another department' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}

export class UpdateCostCenterDto extends UpdateOrgUnitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}

