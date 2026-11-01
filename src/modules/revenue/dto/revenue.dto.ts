import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ForecastHorizon,
  RevenueDimension,
  RevenueSnapshotPeriod,
} from '../enums/revenue.enum';

export class GenerateRevenueSnapshotDto {
  @ApiPropertyOptional({ enum: RevenueSnapshotPeriod, default: RevenueSnapshotPeriod.MONTHLY })
  @IsOptional()
  @IsEnum(RevenueSnapshotPeriod)
  period?: RevenueSnapshotPeriod;
}

export class RevenueSnapshotQueryDto {
  @ApiPropertyOptional({ enum: RevenueSnapshotPeriod })
  @IsOptional()
  @IsEnum(RevenueSnapshotPeriod)
  period?: RevenueSnapshotPeriod;

  @ApiPropertyOptional({ default: 30, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class TopCustomersQueryDto {
  @ApiPropertyOptional({ default: 10, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class RevenueForecastQueryDto {
  @ApiPropertyOptional({ enum: ForecastHorizon })
  @IsOptional()
  @IsEnum(ForecastHorizon)
  horizon?: ForecastHorizon;
}

export class RevenueTrendsQueryDto {
  @ApiPropertyOptional({ default: 6, maximum: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months?: number;
}

export class RevenueSegmentQueryDto {
  @ApiPropertyOptional({ enum: RevenueDimension })
  @IsOptional()
  @IsEnum(RevenueDimension)
  dimension?: RevenueDimension;

  @ApiPropertyOptional({ description: 'YYYY-MM period (defaults to current month)' })
  @IsOptional()
  period?: string;
}
