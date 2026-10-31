import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IdentityProviderType } from '../enums/identity.enum';

export class CreateIdentityProviderDto {
  @ApiProperty()
  @IsString()
  @MaxLength(50)
  code!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ enum: IdentityProviderType })
  @IsEnum(IdentityProviderType)
  type!: IdentityProviderType;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  clientId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(16)
  @MaxLength(500)
  clientSecret!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  redirectUri!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  issuer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entraTenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultRole?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rbacRoleCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  samlEntityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  samlAcsUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class IdentityCallbackDto {
  @ApiProperty()
  @IsString()
  state!: string;

  @ApiPropertyOptional({ description: 'Verified OIDC id_token (HS256 with the provider client secret)' })
  @IsOptional()
  @IsString()
  idToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;
}
