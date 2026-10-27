import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() role!: string;
  @ApiProperty() status!: string;
  @ApiProperty() createdAt!: Date;
}

export class ApiKeyCreatedResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Returned only once' }) plainKey!: string;
  @ApiPropertyOptional() expiresAt?: Date;
}

export class StepUpInitiateResponseDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty() method!: string;
  @ApiProperty() expiresIn!: number;
  @ApiPropertyOptional() challenge?: string;
}

export class StepUpVerifyResponseDto {
  @ApiProperty() stepUpToken!: string;
  @ApiProperty() expiresIn!: number;
}

export class AdminMetricsResponseDto {
  @ApiProperty() windowSeconds!: number;
  @ApiProperty() requests!: number;
  @ApiProperty() denied!: number;
  @ApiProperty() errors!: number;
  @ApiProperty() mutations!: number;
  @ApiProperty() deniedRatio!: number;
  @ApiProperty() alerts!: number;
}
