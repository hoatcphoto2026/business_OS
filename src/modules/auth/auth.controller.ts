import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { IsEmail, IsString, MinLength, IsOptional, IsUUID } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { extractRequestMeta } from '../audit/audit.serializer';

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  /** Optional: tenant code or slug when user has multiple memberships */
  @IsOptional()
  @IsString()
  tenant?: string;
}

class SwitchTenantDto {
  @IsUUID()
  tenantId!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Req() req: any) {
    const meta = extractRequestMeta(req);
    return this.authService.validateAndLogin(
      dto.email,
      dto.password,
      dto.tenant,
      meta,
    );
  }

  /**
   * Switch active tenant for a multi-tenant user.
   * Requires a valid JWT (any current tenant).
   */
  @Post('switch-tenant')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async switchTenant(@Req() req: any, @Body() dto: SwitchTenantDto) {
    const meta = extractRequestMeta(req);
    return this.authService.switchTenant(req.user.userId, dto.tenantId, meta);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: any) {
    const meta = extractRequestMeta(req);
    return this.authService.logout(req.user, meta);
  }
}
