import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { AuthorizationService } from './authorization.service';

@Injectable()
export class RbacService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async findAllRoles(tenantId: string) {
    return this.roleRepo.find({ where: { tenantId } });
  }

  async findAllPermissions() {
    return this.permissionRepo.find();
  }

  async getUserPermissions(userId: string) {
    const set = await this.authorizationService.getUserPermissions(userId);
    return Array.from(set);
  }
}
