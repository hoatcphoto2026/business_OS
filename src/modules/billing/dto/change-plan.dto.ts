import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingCycle, PlanCode } from '../enums/billing.enum';

export class ChangePlanDto {
  @ApiPropertyOptional({ enum: PlanCode, description: 'Plan code to switch to' })
  @IsOptional()
  @IsEnum(PlanCode)
  planCode?: PlanCode;

  @ApiPropertyOptional({ description: 'Plan UUID' })
  @IsOptional()
  @IsUUID()
  planId?: string;

  @ApiProperty({ enum: BillingCycle, default: BillingCycle.MONTHLY })
  @IsEnum(BillingCycle)
  billingCycle!: BillingCycle;
}
