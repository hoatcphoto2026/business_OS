import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class StartOffboardingDto {
  @ApiPropertyOptional({ description: 'Reason for offboarding' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  exportData?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  deactivateUsers?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  revokeApiKeys?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  cancelSubscription?: boolean;
}
