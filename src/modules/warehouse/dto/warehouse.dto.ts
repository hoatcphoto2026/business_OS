import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  WarehouseFactType,
  WarehousePeriod,
  WarehouseTrendMetric,
} from '../enums/warehouse.enum';

export class RunEtlDto {
  @ApiPropertyOptional({ description: 'Inclusive start date (default: -7 days)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive end date (default: today)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  refreshDimensions?: boolean;
}

export class GenerateWarehouseSnapshotDto {
  @ApiPropertyOptional({ enum: WarehousePeriod, default: WarehousePeriod.DAILY })
  @IsOptional()
  @IsEnum(WarehousePeriod)
  period?: WarehousePeriod;

  @ApiPropertyOptional({ description: 'Snapshot date (default: today)' })
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class WarehouseSnapshotQueryDto {
  @ApiPropertyOptional({ enum: WarehousePeriod })
  @IsOptional()
  @IsEnum(WarehousePeriod)
  period?: WarehousePeriod;

  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class WarehouseTrendsQueryDto {
  @ApiProperty({ enum: WarehouseTrendMetric })
  @IsEnum(WarehouseTrendMetric)
  metric!: WarehouseTrendMetric;

  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class WarehouseFactsQueryDto {
  @ApiProperty({ enum: WarehouseFactType })
  @IsEnum(WarehouseFactType)
  fact!: WarehouseFactType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sourceTenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  planCode?: string;

  @ApiPropertyOptional({ description: 'Usage metric filter (USAGE fact only)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  metric?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ default: 100, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
