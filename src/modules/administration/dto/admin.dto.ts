import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsArray,
  IsUrl,
  Length,
  Min,
  Max,
  IsIn,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { MembershipStatus } from '../../tenant/entities/tenant-user.entity';

export enum MembershipRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MANAGER = 'manager',
  SALES = 'sales',
  CASHIER = 'cashier',
  WAREHOUSE = 'warehouse',
  ACCOUNTANT = 'accountant',
  AUDITOR = 'auditor',
  MEMBER = 'member',
}

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(1, 255)
  fullName!: string;

  @IsString()
  @Length(8, 72)
  password!: string;

  @IsOptional()
  @IsEnum(MembershipRole)
  role?: MembershipRole;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  fullName?: string;

  @IsOptional()
  @IsEnum(MembershipRole)
  role?: MembershipRole;

  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;
}

export class CreateRoleDto {
  @IsString()
  @Length(2, 50)
  code!: string;

  @IsString()
  @Length(2, 100)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;
}

export class AssignPermissionDto {
  @IsUUID()
  permissionId!: string;
}

export class CreateTeamDto {
  @IsString()
  @Length(2, 50)
  code!: string;

  @IsString()
  @Length(2, 100)
  name!: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;
}

export class CreateWebhookDto {
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsUrl({ protocols: ['https'], require_protocol: true })
  url!: string;

  @IsArray()
  @IsString({ each: true })
  events!: string[];
}

export class UpdateWebhookDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: string;
}

export class CreateApiKeyDto {
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  timezone?: string;

  @IsOptional()
  @IsString()
  @Length(3, 10)
  currency?: string;

  @IsOptional()
  @IsString()
  @Length(2, 10)
  language?: string;

  @IsOptional()
  @IsString()
  @Length(2, 20)
  dateFormat?: string;

  @IsOptional()
  @IsString()
  @Length(2, 20)
  businessMode?: string;

  @IsOptional()
  @IsString()
  @Length(2, 20)
  accountingMode?: string;

  @IsOptional()
  @IsBoolean()
  copilotEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  notificationEnabled?: boolean;
}

export class UpdateCopilotSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['mock', 'openai', 'azure'])
  provider?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(8192)
  maxTokens?: number;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  systemPrompt?: string;
}

export class StepUpInitiateDto {
  @IsString()
  @Length(2, 64)
  action!: string;

  @IsOptional()
  @IsIn(['totp', 'email_otp', 'password'])
  method?: 'totp' | 'email_otp' | 'password';
}

export class StepUpVerifyDto {
  @IsUUID()
  sessionId!: string;

  @IsString()
  @Length(4, 12)
  code!: string;
}
