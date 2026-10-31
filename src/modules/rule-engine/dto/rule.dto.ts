import { IsString, IsEnum, IsOptional, IsBoolean, IsArray, ValidateNested, IsInt, Min, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConditionType, RuleOperator, ActionType } from '../enums/rule.enum';

export class RuleConditionDto {
  @ApiProperty({ enum: ConditionType })
  @IsEnum(ConditionType)
  conditionType!: ConditionType;

  @ApiProperty({ enum: RuleOperator })
  @IsEnum(RuleOperator)
  operator!: RuleOperator;

  @ApiProperty({ example: '80' })
  @IsString()
  value!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class RuleActionDto {
  @ApiProperty({ enum: ActionType })
  @IsEnum(ActionType)
  actionType!: ActionType;

  @ApiPropertyOptional()
  @IsOptional()
  config?: Record<string, unknown>;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateRuleDto {
  @ApiProperty({ example: 'USAGE_WARNING' })
  @IsString()
  code!: string;

  @ApiProperty({ example: 'Usage > 80% Warning' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ type: [RuleConditionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  conditions?: RuleConditionDto[];

  @ApiPropertyOptional({ type: [RuleActionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleActionDto)
  actions?: RuleActionDto[];
}

export class EvaluateRuleDto {
  @ApiPropertyOptional({ description: 'Specific rule code to evaluate; omit to evaluate all enabled' })
  @IsOptional()
  @IsString()
  ruleCode?: string;

  @ApiProperty({ description: 'Context data for evaluation', example: { usagePercent: 85, subscriptionStatus: 'ACTIVE' } })
  @IsObject()
  input!: Record<string, unknown>;
}
