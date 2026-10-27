import { IsOptional, IsString, MaxLength } from 'class-validator';

export class WorkflowActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class CreateWorkflowDto {
  @IsString()
  @MaxLength(100)
  entityType!: string;

  @IsString()
  entityId!: string;
}
