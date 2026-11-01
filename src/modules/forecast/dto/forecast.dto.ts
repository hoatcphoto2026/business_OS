import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  FORECAST_HORIZONS,
  ForecastMethod,
  ForecastMetric,
  ForecastRunStatus,
} from '../enums/forecast.enum';

export class RunForecastDto {
  @ApiPropertyOptional({
    enum: ForecastMetric,
    isArray: true,
    description: 'Defaults to all five metrics',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ForecastMetric, { each: true })
  metrics?: ForecastMetric[];

  @ApiPropertyOptional({
    enum: ForecastMethod,
    isArray: true,
    description: 'Defaults to all three methods',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ForecastMethod, { each: true })
  methods?: ForecastMethod[];

  @ApiPropertyOptional({
    enum: FORECAST_HORIZONS,
    isArray: true,
    description: 'Defaults to 30, 90 and 365 days',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(FORECAST_HORIZONS, { each: true })
  horizons?: number[];

  @ApiPropertyOptional({ default: 90, minimum: 14, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(14)
  @Max(365)
  lookbackDays?: number;
}

export class ForecastQueryDto {
  @ApiPropertyOptional({ enum: ForecastMetric })
  @IsOptional()
  @IsEnum(ForecastMetric)
  metric?: ForecastMetric;

  @ApiPropertyOptional({ enum: ForecastMethod })
  @IsOptional()
  @IsEnum(ForecastMethod)
  method?: ForecastMethod;

  @ApiPropertyOptional({ enum: FORECAST_HORIZONS })
  @IsOptional()
  @Type(() => Number)
  @IsIn(FORECAST_HORIZONS)
  horizon?: number;

  @ApiPropertyOptional({ description: 'Specific run id (defaults to latest COMPLETED run)' })
  @IsOptional()
  @IsUUID()
  runId?: string;
}

export class ForecastHistoryQueryDto {
  @ApiPropertyOptional({ enum: ForecastMetric })
  @IsOptional()
  @IsEnum(ForecastMetric)
  metric?: ForecastMetric;

  @ApiPropertyOptional({ enum: ForecastMethod })
  @IsOptional()
  @IsEnum(ForecastMethod)
  method?: ForecastMethod;

  @ApiPropertyOptional({ enum: ForecastRunStatus })
  @IsOptional()
  @IsEnum(ForecastRunStatus)
  status?: ForecastRunStatus;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 10000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  offset?: number;
}
