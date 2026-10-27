import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../../rbac/entities/permission.entity';

@Injectable()
export class PermissionManagementService {
  constructor(
    @InjectRepository(Permission) private readonly permissions: Repository<Permission>,
  ) {}

  async list() {
    return this.permissions.find({ order: { module: 'ASC', code: 'ASC' } });
  }
}
