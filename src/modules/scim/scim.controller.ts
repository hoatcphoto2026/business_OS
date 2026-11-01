import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ScimAuthGuard } from './scim-auth.guard';
import { ScimUsersService } from './scim-users.service';
import { ScimGroupsService } from './scim-groups.service';
import { ScimBulkService } from './scim-bulk.service';
import { ScimContext } from './scim.types';
import {
  SCIM_ENTERPRISE_USER,
  SCIM_GROUP_EXT,
  SCIM_GROUP_SCHEMA,
  SCIM_SP_CONFIG,
  SCIM_USER_SCHEMA,
} from './enums/scim.enum';

/**
 * SCIM 2.0 provisioning endpoints (RFC 7643 / 7644).
 * Authentication = per-tenant bearer token (ScimAuthGuard); no JWT / ALS.
 */
@ApiExcludeController()
@Controller('scim/v2')
@UseGuards(ScimAuthGuard)
export class ScimController {
  constructor(
    private readonly users: ScimUsersService,
    private readonly groups: ScimGroupsService,
    private readonly bulkService: ScimBulkService,
  ) {}

  private ctx(req: any): ScimContext {
    return {
      endpoint: req.scimEndpoint,
      traceId: req.headers?.['x-request-id'],
      ipAddress: req.ip ?? null,
      userAgent: req.headers?.['user-agent'] ?? null,
    };
  }

  // ─── Discovery ────────────────────────────────────────────────

  @Get('ServiceProviderConfig')
  serviceProviderConfig() {
    return {
      schemas: [SCIM_SP_CONFIG],
      documentationUri: 'https://www.rfc-editor.org/rfc/rfc7644',
      patch: { supported: true },
      bulk: { supported: true, maxOperations: 100, maxPayloadSize: 1048576 },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: true },
      etag: { supported: false },
      authenticationSchemes: [
        {
          type: 'oauthbearertoken',
          name: 'Bearer Token',
          description: 'Tenant-scoped SCIM bearer token',
          primary: true,
        },
      ],
    };
  }

  @Get('ResourceTypes')
  resourceTypes() {
    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: 2,
      Resources: [
        {
          id: 'User',
          name: 'User',
          endpoint: '/scim/v2/Users',
          schema: SCIM_USER_SCHEMA,
          meta: { resourceType: 'ResourceType', location: '/scim/v2/ResourceTypes/User' },
        },
        {
          id: 'Group',
          name: 'Group',
          endpoint: '/scim/v2/Groups',
          schema: SCIM_GROUP_SCHEMA,
          meta: { resourceType: 'ResourceType', location: '/scim/v2/ResourceTypes/Group' },
        },
      ],
    };
  }

  @Get('Schemas')
  schemas() {
    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: 3,
      Resources: [
        { id: SCIM_USER_SCHEMA, name: 'User' },
        { id: SCIM_GROUP_SCHEMA, name: 'Group' },
        { id: SCIM_ENTERPRISE_USER, name: 'EnterpriseUser' },
        { id: SCIM_GROUP_EXT, name: 'BusinessOS Group Extension' },
      ],
    };
  }

  // ─── Users ────────────────────────────────────────────────────

  @Get('Users')
  listUsers(@Req() req: any, @Query() query: Record<string, string>) {
    return this.users.list(this.ctx(req), query);
  }

  @Post('Users')
  createUser(@Req() req: any, @Body() body: Record<string, any>) {
    return this.users.create(this.ctx(req), body);
  }

  @Get('Users/:id')
  getUser(@Req() req: any, @Param('id') id: string) {
    return this.users.get(this.ctx(req), id);
  }

  @Put('Users/:id')
  replaceUser(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.users.replace(this.ctx(req), id, body);
  }

  @Patch('Users/:id')
  patchUser(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.users.patch(this.ctx(req), id, body);
  }

  @Delete('Users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUser(@Req() req: any, @Param('id') id: string) {
    return this.users.remove(this.ctx(req), id);
  }

  // ─── Groups ───────────────────────────────────────────────────

  @Get('Groups')
  listGroups(@Req() req: any, @Query() query: Record<string, string>) {
    return this.groups.list(this.ctx(req), query);
  }

  @Post('Groups')
  createGroup(@Req() req: any, @Body() body: Record<string, any>) {
    return this.groups.create(this.ctx(req), body);
  }

  @Get('Groups/:id')
  getGroup(@Req() req: any, @Param('id') id: string) {
    return this.groups.get(this.ctx(req), id);
  }

  @Put('Groups/:id')
  replaceGroup(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.groups.replace(this.ctx(req), id, body);
  }

  @Patch('Groups/:id')
  patchGroup(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.groups.patch(this.ctx(req), id, body);
  }

  @Delete('Groups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteGroup(@Req() req: any, @Param('id') id: string) {
    return this.groups.remove(this.ctx(req), id);
  }

  @Post('Bulk')
  @HttpCode(HttpStatus.OK)
  bulk(@Req() req: any, @Body() body: Record<string, any>) {
    return this.bulkService.process(this.ctx(req), body);
  }
}
