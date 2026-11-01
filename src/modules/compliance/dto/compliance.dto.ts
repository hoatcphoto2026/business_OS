import { Type } from 'class-transformer';
import {
  IsArray,
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
  AccessReviewScope,
  EvidenceCategory,
  EvidenceSource,
  EvidenceStatus,
  RiskSeverity,
  RiskStatus,
} from '../enums/compliance.enum';

export class CreateEvidenceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(60)
  code!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiProperty({ enum: EvidenceCategory })
  @IsEnum(EvidenceCategory)
  category!: EvidenceCategory;

  @ApiPropertyOptional({ enum: EvidenceSource })
  @IsOptional()
  @IsEnum(EvidenceSource)
  source?: EvidenceSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CollectEvidenceDto {
  @ApiPropertyOptional({ enum: EvidenceCategory, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(EvidenceCategory, { each: true })
  categories?: EvidenceCategory[];
}

export class CreateAccessReviewDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ enum: AccessReviewScope })
  @IsOptional()
  @IsEnum(AccessReviewScope)
  scope?: AccessReviewScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  periodEnd?: string;
}

export class CompleteAccessReviewDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  reviewerId?: string;
}

export class CreateRiskDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(40)
  category!: string;

  @ApiProperty({ enum: RiskSeverity })
  @IsEnum(RiskSeverity)
  severity!: RiskSeverity;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  likelihood?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  impact?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  mitigation?: string;
}

export class UpdateRiskDto {
  @ApiPropertyOptional({ enum: RiskStatus })
  @IsOptional()
  @IsEnum(RiskStatus)
  status?: RiskStatus;

  @ApiPropertyOptional({ enum: RiskSeverity })
  @IsOptional()
  @IsEnum(RiskSeverity)
  severity?: RiskSeverity;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  likelihood?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  impact?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  mitigation?: string;
}

export class RiskQueryDto {
  @ApiPropertyOptional({ enum: RiskStatus })
  @IsOptional()
  @IsEnum(RiskStatus)
  status?: RiskStatus;

  @ApiPropertyOptional({ enum: RiskSeverity })
  @IsOptional()
  @IsEnum(RiskSeverity)
  severity?: RiskSeverity;
}

export class ExportQueryDto {
  @ApiPropertyOptional({ enum: ['csv', 'excel', 'pdf'], default: 'csv' })
  @IsOptional()
  @IsEnum(['csv', 'excel', 'pdf'])
  format?: 'csv' | 'excel' | 'pdf';

  @ApiPropertyOptional({ enum: EvidenceCategory })
  @IsOptional()
  @IsEnum(EvidenceCategory)
  category?: EvidenceCategory;
}

export class VerifyEvidenceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class EvidenceQueryDto {
  @ApiPropertyOptional({ enum: EvidenceCategory })
  @IsOptional()
  @IsEnum(EvidenceCategory)
  category?: EvidenceCategory;

  @ApiPropertyOptional({ enum: EvidenceStatus })
  @IsOptional()
  @IsEnum(EvidenceStatus)
  status?: EvidenceStatus;
}

export class SnapshotQueryDto {
  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
