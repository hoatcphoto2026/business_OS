import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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
  ReportChannel,
  ReportFormat,
  ReportFrequency,
  ReportType,
} from '../enums/reporting.enum';

export class ReportPeriodDto {
  @ApiPropertyOptional({ description: 'ISO date/time lower bound' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date/time upper bound' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ExportReportQueryDto extends ReportPeriodDto {
  @ApiPropertyOptional({ enum: [ReportFormat.CSV, ReportFormat.EXCEL, ReportFormat.PDF] })
  @IsOptional()
  @IsEnum([ReportFormat.CSV, ReportFormat.EXCEL, ReportFormat.PDF])
  format?: ReportFormat;
}

export class RunReportDto extends ReportPeriodDto {
  @ApiPropertyOptional({ enum: ReportFormat, default: ReportFormat.PDF })
  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat;

  @ApiPropertyOptional({ enum: ReportChannel, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(ReportChannel, { each: true })
  channels?: ReportChannel[];

  @ApiPropertyOptional({ type: [String], example: ['cfo@abctrading.vn'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipients?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  webhookIds?: string[];
}

export class CreateReportScheduleDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ enum: ReportType })
  @IsEnum(ReportType)
  reportType!: ReportType;

  @ApiPropertyOptional({ enum: ReportFormat, default: ReportFormat.PDF })
  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat;

  @ApiPropertyOptional({ enum: ReportFrequency, default: ReportFrequency.WEEKLY })
  @IsOptional()
  @IsEnum(ReportFrequency)
  frequency?: ReportFrequency;

  @ApiPropertyOptional({ enum: ReportChannel, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(ReportChannel, { each: true })
  deliveryChannels?: ReportChannel[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipients?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  webhookIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateReportScheduleDto {
  @ApiPropertyOptional({ enum: ReportFormat })
  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat;

  @ApiPropertyOptional({ enum: ReportFrequency })
  @IsOptional()
  @IsEnum(ReportFrequency)
  frequency?: ReportFrequency;

  @ApiPropertyOptional({ enum: ReportChannel, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(ReportChannel, { each: true })
  deliveryChannels?: ReportChannel[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipients?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  webhookIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class RunHistoryQueryDto {
  @ApiPropertyOptional({ enum: ReportType })
  @IsOptional()
  @IsEnum(ReportType)
  reportType?: ReportType;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
