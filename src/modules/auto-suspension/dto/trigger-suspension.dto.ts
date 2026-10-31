import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SuspensionTrigger } from '../enums/suspension.enum';

export class TriggerSuspensionDto {
  @ApiProperty({ enum: SuspensionTrigger })
  @IsEnum(SuspensionTrigger)
  trigger!: SuspensionTrigger;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
