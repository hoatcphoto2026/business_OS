import { IsEnum, IsOptional, IsString, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AutoNotifyEvent, NotifyChannel } from '../enums/auto-notify.enum';

export class TriggerAutoNotifyDto {
  @ApiProperty({ enum: AutoNotifyEvent })
  @IsEnum(AutoNotifyEvent)
  event!: AutoNotifyEvent;

  @ApiProperty({ example: 'user@example.com' })
  @IsString()
  recipient!: string;

  @ApiPropertyOptional({ enum: NotifyChannel, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(NotifyChannel, { each: true })
  channels?: NotifyChannel[];

  @ApiPropertyOptional()
  @IsOptional()
  variables?: Record<string, string | number>;
}
