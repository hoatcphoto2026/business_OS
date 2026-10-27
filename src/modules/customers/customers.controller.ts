import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { Audited } from '../audit/decorators/audited.decorator';

@Controller('customers')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermission('customer.view')
  findAll() {
    return this.customersService.findAll();
  }

  @Get(':id')
  @RequirePermission('customer.view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.findById(id);
  }

  @Post()
  @Audited({ entityType: 'customer' })
  @RequirePermission('customer.create')
  create(@Body() body: CreateCustomerDto) {
    return this.customersService.create(body);
  }

  @Patch(':id')
  @Audited({ entityType: 'customer' })
  @RequirePermission('customer.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCustomerDto,
  ) {
    return this.customersService.update(id, body);
  }

  @Delete(':id')
  @Audited({ entityType: 'customer' })
  @RequirePermission('customer.delete')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.remove(id);
  }
}
