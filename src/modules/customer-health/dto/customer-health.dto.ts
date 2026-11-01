import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AtRiskQueryDto {
  @ApiPropertyOptional({ enum: ['true', 'false'], description: 'Only churn candidates' })
  @IsOptional()
  @IsIn(['true', 'false'])
  churnOnly?: 'true' | 'false';

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class HealthTrendsQueryDto {
  @ApiPropertyOptional({ description: 'Limit the series to one customer tenant' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ default: 30, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;
}
