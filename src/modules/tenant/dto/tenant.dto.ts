import {
  IsString,
  IsEnum,
  IsOptional,
  IsObject,
  IsBoolean,
  MaxLength,
  MinLength,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TenantPlan, TenantStatus } from '../entities/tenant.entity';

/**
 * Canonical Tenant Settings shape stored in jsonb.
 */
export class TenantSettingsDto {
  @IsString()
  @IsOptional()
  timezone?: string; // e.g. Asia/Ho_Chi_Minh

  @IsString()
  @IsOptional()
  currency?: string; // e. rep. VND

  @IsString()
  @IsOptional()
  language?: string; // vi | en

  @IsString()
  @IsOptional()
  dateFormat?: string; // dd/MM/yyyy

  @IsBoolean()
  @IsOptional()
  businessMode?: boolean;

  @IsBoolean()
  @IsOptional()
  accountingMode?: boolean;
}

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'code must be uppercase alphanumeric with underscores',
  })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be kebab-case (e.g. abc-trading)',
  })
  slug!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsEnum(TenantPlan)
  @IsOptional()
  plan?: TenantPlan;

  @IsEnum(TenantStatus)
  @IsOptional()
  status?: TenantStatus;

  @IsOptional()
  @ValidateNested()
  @Type(() => TenantSettingsDto)
  settings?: TenantSettingsDto;
}

export class UpdateTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  @IsOptional()
  name?: string;

  @IsEnum(TenantPlan)
  @IsOptional()
  plan?: TenantPlan;

  @IsEnum(TenantStatus)
  @IsOptional()
  status?: TenantStatus;

  @IsOptional()
  @ValidateNested()
  @Type(() => TenantSettingsDto)
  settings?: TenantSettingsDto;
}

export class TenantResponseDto {
  id!: string;
  code!: string;
  slug!: string;
  name!: string;
  plan!: TenantPlan;
  status!: TenantStatus;
  settings!: TenantSettingsDto;
  createdAt!: Date;
  updatedAt!: Date;
}
