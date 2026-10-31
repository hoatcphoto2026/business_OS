import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { TenantService } from './tenant.service';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  /**
   * Platform admin only in production.
   * For Sprint 1 we keep it open behind JWT for demo purposes.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateTenantDto) {
    // Tenant creation is via /onboarding/start. Direct create is platform-only.
    if (process.env.ALLOW_TENANT_CREATE !== 'true') {
      throw new ForbiddenException('Direct tenant creation is disabled');
    }
    return this.tenantService.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Req() req: any) {
    return this.tenantService.listForUser(req.user.userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, TenantGuard)
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    if (req.user?.tenantId && id !== req.user.tenantId) {
      throw new ForbiddenException('Cannot read another tenant');
    }
    return this.tenantService.findById(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, TenantGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
    @Req() req: any,
  ) {
    return this.tenantService.update(id, dto, req.user?.tenantId);
  }
}
