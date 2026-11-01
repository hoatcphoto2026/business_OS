import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExecutiveMetricCode, SnapshotPeriod } from '../enums/executive.enum';

export class GenerateSnapshotDto {
  @ApiPropertyOptional({ enum: SnapshotPeriod, default: SnapshotPeriod.DAILY })
  @IsOptional()
  @IsEnum(SnapshotPeriod)
  period?: SnapshotPeriod;
}

export class MetricHistoryQueryDto {
  @ApiPropertyOptional({ enum: ExecutiveMetricCode })
  @IsOptional()
  @IsEnum(ExecutiveMetricCode)
  code?: ExecutiveMetricCode;

  @ApiPropertyOptional({ enum: SnapshotPeriod })
  @IsOptional()
  @IsEnum(SnapshotPeriod)
  period?: SnapshotPeriod;

  @ApiPropertyOptional({ description: 'ISO date/time lower bound' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date/time upper bound' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 120, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class SnapshotListQueryDto {
  @ApiPropertyOptional({ enum: SnapshotPeriod })
  @IsOptional()
  @IsEnum(SnapshotPeriod)
  period?: SnapshotPeriod;

  @ApiPropertyOptional({ default: 30, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
