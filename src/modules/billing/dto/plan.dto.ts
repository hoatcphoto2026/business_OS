import { ApiProperty } from '@nestjs/swagger';
import { PlanFeatureCode } from '../enums/billing.enum';

export class PlanFeatureDto {
  @ApiProperty({ enum: PlanFeatureCode })
  featureCode!: PlanFeatureCode;

  @ApiProperty({ nullable: true })
  limitValue!: number | null;

  @ApiProperty()
  isUnlimited!: boolean;
}

export class PlanDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty()
  monthlyPrice!: string;

  @ApiProperty()
  yearlyPrice!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  trialDays!: number;

  @ApiProperty({ type: [PlanFeatureDto] })
  features!: PlanFeatureDto[];
}
