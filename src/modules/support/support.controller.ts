import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { SupportService } from './support.service';
import { CreateTicketDto, ReplyTicketDto, AssignTicketDto, AddAttachmentDto } from './dto/ticket.dto';
import { TicketStatus } from './enums/ticket.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@ApiTags('Customer Support')
@ApiBearerAuth()
@Controller('support/tickets')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('admin.access')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a support ticket' })
  @ApiResponse({ status: 201, description: 'Ticket created' })
  create(@Body() dto: CreateTicketDto) {
    return this.support.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List tickets for current tenant' })
  @ApiQuery({ name: 'status', required: false, enum: TicketStatus })
  list(@Query('status') status?: TicketStatus) {
    return this.support.list(status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ticket with comments and attachments' })
  @ApiParam({ name: 'id', description: 'Ticket UUID' })
  get(@Param('id') id: string) {
    return this.support.get(id);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign ticket to a support agent' })
  assign(@Param('id') id: string, @Body() dto: AssignTicketDto) {
    return this.support.assign(id, dto);
  }

  @Post(':id/reply')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Reply to a ticket (or add internal note)' })
  reply(@Param('id') id: string, @Body() dto: ReplyTicketDto) {
    return this.support.reply(id, dto);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close a ticket' })
  close(@Param('id') id: string) {
    return this.support.close(id);
  }

  @Post(':id/attachments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add attachment metadata to a ticket' })
  addAttachment(
    @Param('id') id: string,
    @Body() body: AddAttachmentDto,
  ) {
    return this.support.addAttachment(id, body.filename, body.url, body.sizeBytes, body.contentType);
  }
}
