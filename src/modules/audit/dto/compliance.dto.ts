import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AuditCategory,
  AuditExportFormat,
  ComplianceReportType,
  RetentionPolicyCode,
} from '../enums/audit-category.enum';

export class SearchAuditEventDto {
  @ApiPropertyOptional({ enum: AuditCategory })
  @IsOptional()
  @IsEnum(AuditCategory)
  category?: AuditCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resourceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resourceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ description: 'Matches action, resource type, or actor email' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class ExportAuditEventDto extends SearchAuditEventDto {
  @ApiProperty({ enum: AuditExportFormat })
  @IsEnum(AuditExportFormat)
  format!: AuditExportFormat;
}

export class ComplianceReportQueryDto {
  @ApiProperty({ enum: ComplianceReportType })
  @IsEnum(ComplianceReportType)
  type!: ComplianceReportType;
}

export class RetentionQueryDto {
  @ApiPropertyOptional({ enum: RetentionPolicyCode })
  @IsOptional()
  @IsEnum(RetentionPolicyCode)
  activate?: RetentionPolicyCode;

  @ApiPropertyOptional({ description: 'Sets the custom policy length in days' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  customDays?: number;
}
