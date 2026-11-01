import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ExecutiveAlertSeverity,
  ExecutiveAlertType,
} from './executive-dashboard.enums';

export class ExecutiveDashboardQueryDto {
  @ApiPropertyOptional({ description: 'ISO date/time lower bound (default: -30 days)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date/time upper bound (default: now)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ExecutiveWidgetsQueryDto extends ExecutiveDashboardQueryDto {
  @ApiPropertyOptional({
    description: 'Comma separated widget keys (REVENUE,GROWTH,...)',
    example: 'REVENUE,SECURITY',
  })
  @IsOptional()
  @IsString()
  widgets?: string;
}

export class ExecutiveAlertsQueryDto extends ExecutiveDashboardQueryDto {
  @ApiPropertyOptional({ enum: ExecutiveAlertSeverity })
  @IsOptional()
  @IsEnum(ExecutiveAlertSeverity)
  severity?: ExecutiveAlertSeverity;

  @ApiPropertyOptional({ enum: ExecutiveAlertType })
  @IsOptional()
  @IsEnum(ExecutiveAlertType)
  type?: ExecutiveAlertType;
}
