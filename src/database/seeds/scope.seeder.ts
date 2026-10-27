import { DataSource } from 'typeorm';
import { Role } from '../../modules/rbac/entities/role.entity';
import { RoleScope } from '../../modules/scope/entities/role-scope.entity';
import { DataScope } from '../../modules/scope/enums/data-scope.enum';
import { Team } from '../../modules/team/entities/team.entity';
import { TeamMember } from '../../modules/team/entities/team-member.entity';

/**
 * Seed role scopes for Sprint 4 demo.
 *
 * Assumes roles already seeded by rbac.seeder.ts
 * (sales, manager, director, owner, etc.)
 */
export async function seedScopes(dataSource: DataSource, tenantId: string) {
  const roleRepo = dataSource.getRepository(Role);
  const scopeRepo = dataSource.getRepository(RoleScope);
  const teamRepo = dataSource.getRepository(Team);
  const memberRepo = dataSource.getRepository(TeamMember);

  const roles = await roleRepo.find({ where: { tenantId } });
  const roleByCode = Object.fromEntries(roles.map((r) => [r.code, r]));

  const resources = ['customer', 'sales_order', 'product', 'audit', 'supplier', 'warehouse', 'bank-account', 'tax', 'payment-term', 'currency', 'unit-of-measure'];

  const scopeMap: Record<string, DataScope> = {
    sales: DataScope.SELF,
    manager: DataScope.TEAM,
    branch_manager: DataScope.BRANCH,
    director: DataScope.COMPANY,
    admin: DataScope.TENANT,
    owner: DataScope.TENANT,
  };

  for (const [code, scope] of Object.entries(scopeMap)) {
    const role = roleByCode[code];
    if (!role) continue;

    for (const resource of resources) {
      const exists = await scopeRepo.findOne({
        where: { roleId: role.id, resource },
      });
      if (!exists) {
        await scopeRepo.save(
          scopeRepo.create({
            roleId: role.id,
            resource,
            scope,
          }),
        );
      }
    }
  }

  // Demo team + members
  let team = await teamRepo.findOne({ where: { tenantId, code: 'SALES-A' } });
  if (!team) {
    team = await teamRepo.save(
      teamRepo.create({
        tenantId,
        code: 'SALES-A',
        name: 'Sales Team A',
        status: 'active',
      }),
    );
  }

  // Add hcm.user and manager into the team so TEAM scope works
  const userRepo = dataSource.getRepository('User');
  const hcmUser = await userRepo.findOne({ where: { email: 'hcm.user@abctrading.vn' } });
  const mgrUser = await userRepo.findOne({ where: { email: 'manager@abctrading.vn' } });

  async function ensureMember(userId: string, isManager = false) {
    if (!userId || !team) return;
    const exists = await memberRepo.findOne({ where: { teamId: team.id, userId } });
    if (!exists) {
      await memberRepo.save(
        memberRepo.create({ teamId: team.id, userId, isManager }),
      );
    }
  }

  if (hcmUser) await ensureMember(hcmUser.id, false);
  if (mgrUser) await ensureMember(mgrUser.id, true);

  console.log('Scope & Team seed completed for tenant', tenantId);
}
