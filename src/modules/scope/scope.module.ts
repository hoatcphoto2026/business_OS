import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleScope } from './entities/role-scope.entity';
import { UserRole } from '../rbac/entities/user-role.entity';
import { Team } from '../team/entities/team.entity';
import { TeamMember } from '../team/entities/team-member.entity';
import { ScopeService } from './scope.service';
import { TenantContextModule } from '../../common/tenant-context/tenant-context.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RoleScope, UserRole, Team, TeamMember]),
    TenantContextModule,
  ],
  providers: [ScopeService],
  exports: [ScopeService, TypeOrmModule],
})
export class ScopeModule {}
