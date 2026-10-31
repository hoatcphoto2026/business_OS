import { IsString, IsEnum, IsOptional, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScheduleType, JobType } from '../enums/scheduled-job.enum';

export class CreateScheduledJobDto {
  @ApiProperty({ example: 'Daily Invoice Generation' })
  @IsString()
  name!: string;

  @ApiProperty({ enum: JobType })
  @IsEnum(JobType)
  jobType!: JobType;

  @ApiPropertyOptional({ enum: ScheduleType, default: ScheduleType.DAILY })
  @IsOptional()
  @IsEnum(ScheduleType)
  scheduleType?: ScheduleType;

  @ApiPropertyOptional({ example: '0 2 * * *' })
  @IsOptional()
  @IsString()
  cronExpression?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ default: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxRetries?: number;

  @ApiPropertyOptional()
  @IsOptional()
  config?: Record<string, unknown>;
}
