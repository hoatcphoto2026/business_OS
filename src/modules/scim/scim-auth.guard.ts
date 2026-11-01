import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { ScimEndpoint } from './entities/scim-endpoint.entity';
import { scimError } from './scim.errors';

@Injectable()
export class ScimAuthGuard implements CanActivate {
  constructor(
    @InjectRepository(ScimEndpoint)
    private readonly endpoints: Repository<ScimEndpoint>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers?.authorization as string | undefined;
    const token = header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      scimError(401, 'Bearer token is required');
    }
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const endpoint = await this.endpoints.findOne({ where: { tokenHash, enabled: true } });
    if (!endpoint) {
      scimError(401, 'Bearer token is invalid');
    }
    request.scimEndpoint = endpoint;
    // Track usage without slowing the request path.
    void this.endpoints
      .update({ id: endpoint.id }, { lastUsedAt: new Date() })
      .catch(() => undefined);
    return true;
  }
}
