import { HttpException, Injectable } from '@nestjs/common';
import { ScimUsersService } from './scim-users.service';
import { ScimGroupsService } from './scim-groups.service';
import { ScimContext } from './scim.types';
import { scimError } from './scim.errors';
import { SCIM_BULK_RESPONSE } from './enums/scim.enum';
import { MetricsService } from '../../common/metrics/metrics.service';

const MAX_OPERATIONS = 100;
const BULK_PATH = /^\/(Users|Groups)(?:\/([0-9a-fA-F-]{36}))?\/?$/;

type ScimBody = Record<string, any>;

/** RFC 7644 §3.7 bulk operations (sequential, per-operation status). */
@Injectable()
export class ScimBulkService {
  constructor(
    private readonly users: ScimUsersService,
    private readonly groups: ScimGroupsService,
    private readonly metrics: MetricsService,
  ) {}

  async process(ctx: ScimContext, body: ScimBody): Promise<Record<string, unknown>> {
    if (!Array.isArray(body?.Operations) || body.Operations.length === 0) {
      scimError(400, 'BulkRequest requires a non-empty Operations array', 'invalidValue');
    }
    const operations = body.Operations as ScimBody[];
    if (operations.length > MAX_OPERATIONS) {
      scimError(
        413,
        `A bulk request supports at most ${MAX_OPERATIONS} operations`,
        'tooMany',
      );
    }

    const failOnErrors = Number(body.failOnErrors ?? 0);
    const results: Record<string, unknown>[] = [];
    let errors = 0;

    for (const operation of operations) {
      try {
        results.push(await this.execute(ctx, operation));
      } catch (error) {
        errors += 1;
        results.push(this.errorResult(operation, error));
        if (failOnErrors > 0 && errors >= failOnErrors) break;
      }
    }

    this.metrics.inc('scim_bulk_operations_total', {}, results.length);
    return { schemas: [SCIM_BULK_RESPONSE], Operations: results };
  }

  private async execute(
    ctx: ScimContext,
    operation: ScimBody,
  ): Promise<Record<string, unknown>> {
    const method = String(operation?.method ?? 'POST').toUpperCase();
    const path = String(operation?.path ?? '');
    const bulkId = operation?.bulkId as string | undefined;
    const data = (operation?.data ?? {}) as ScimBody;
    const base = { method, ...(bulkId ? { bulkId } : {}) };

    const match = BULK_PATH.exec(path);
    if (!match) {
      scimError(400, `Unsupported bulk path: ${path}`, 'invalidPath');
    }
    const [, resource, id] = match;

    if (method === 'POST') {
      if (resource === 'Users') {
        const resourceBody = await this.users.create(ctx, data);
        return {
          ...base,
          status: 201,
          location: `/scim/v2/Users/${resourceBody.id}`,
          response: resourceBody,
        };
      }
      const resourceBody = await this.groups.create(ctx, data);
      return {
        ...base,
        status: 201,
        location: `/scim/v2/Groups/${resourceBody.id}`,
        response: resourceBody,
      };
    }

    if (!id) {
      scimError(400, `${method} /${resource} requires a resource id`, 'invalidPath');
    }

    if (resource === 'Users') {
      if (method === 'PUT') {
        return {
          ...base,
          status: 200,
          location: `/scim/v2/Users/${id}`,
          response: await this.users.replace(ctx, id, data),
        };
      }
      if (method === 'PATCH') {
        return {
          ...base,
          status: 200,
          location: `/scim/v2/Users/${id}`,
          response: await this.users.patch(ctx, id, data),
        };
      }
      if (method === 'DELETE') {
        await this.users.remove(ctx, id);
        return { ...base, status: 204, location: `/scim/v2/Users/${id}` };
      }
    } else {
      if (method === 'PUT') {
        return {
          ...base,
          status: 200,
          location: `/scim/v2/Groups/${id}`,
          response: await this.groups.replace(ctx, id, data),
        };
      }
      if (method === 'PATCH') {
        return {
          ...base,
          status: 200,
          location: `/scim/v2/Groups/${id}`,
          response: await this.groups.patch(ctx, id, data),
        };
      }
      if (method === 'DELETE') {
        await this.groups.remove(ctx, id);
        return { ...base, status: 204, location: `/scim/v2/Groups/${id}` };
      }
    }

    scimError(400, `Unsupported bulk method: ${method}`, 'invalidValue');
  }

  private errorResult(
    operation: ScimBody,
    error: unknown,
  ): Record<string, unknown> {
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const response =
      error instanceof HttpException
        ? error.getResponse()
        : { schemas: [], detail: 'Internal error' };
    const bulkId = operation?.bulkId as string | undefined;
    return {
      method: String(operation?.method ?? '').toUpperCase(),
      ...(bulkId ? { bulkId } : {}),
      status,
      response,
    };
  }
}
