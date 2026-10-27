import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AskDto {
  @IsString()
  @MaxLength(2000)
  question!: string;
}

export class AnalyzeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  analysisType?: string;
}
