import { IsString, IsEmail, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartOnboardingDto {
  @ApiProperty({ example: 'ACME' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  code!: string;

  @ApiProperty({ example: 'acme' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  slug!: string;

  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: 'owner@acme.com' })
  @IsEmail()
  ownerEmail!: string;

  @ApiProperty({ example: 'Nguyễn Văn Owner' })
  @IsString()
  @MinLength(1)
  ownerFullName!: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(6)
  ownerPassword!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planCode?: string;
}
