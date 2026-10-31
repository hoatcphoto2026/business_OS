import { IsString, IsOptional, IsArray, IsEnum, IsObject, MinLength } from 'class-validator';
import { AutomationWorkflowStatus } from '../enums/automation-workflow.enum';

export class CreateDefinitionDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  triggerEvent!: string;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsArray()
  steps!: Array<{
    type: string;
    config: Record<string, unknown>;
    onError?: string;
  }>;

  @IsOptional()
  @IsEnum(AutomationWorkflowStatus)
  status?: AutomationWorkflowStatus;
}

export class UpdateDefinitionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  triggerEvent?: string;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  steps?: Array<{
    type: string;
    config: Record<string, unknown>;
    onError?: string;
  }>;

  @IsOptional()
  @IsEnum(AutomationWorkflowStatus)
  status?: AutomationWorkflowStatus;
}
