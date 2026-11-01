import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AdoptionDimension,
  FeatureKey,
} from '../enums/product-analytics.enum';

export class FeatureUsageWindowDto {
  @ApiPropertyOptional({ default: 30, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class FeatureTrendQueryDto extends FeatureUsageWindowDto {
  @ApiPropertyOptional({ enum: FeatureKey })
  @IsOptional()
  @IsEnum(FeatureKey)
  feature?: FeatureKey;
}

export class FeatureAdoptionQueryDto {
  @ApiPropertyOptional({ enum: AdoptionDimension, default: AdoptionDimension.TENANT })
  @IsOptional()
  @IsEnum(AdoptionDimension)
  dimension?: AdoptionDimension;

  @ApiPropertyOptional({ description: 'YYYY-MM (defaults to the current month)' })
  @IsOptional()
  @IsString()
  period?: string;
}

export class TrackFeatureUsageDto {
  @ApiProperty({ enum: FeatureKey })
  @IsEnum(FeatureKey)
  featureKey!: FeatureKey;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
