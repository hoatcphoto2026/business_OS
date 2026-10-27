import { ForbiddenException } from '@nestjs/common';
import { AdminOnlyGuard } from './admin-only.guard';

function ctx(user: any) {
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as any;
}

describe('AdminOnlyGuard', () => {
  const userRoles = { find: jest.fn() };
  const rolePerms = { find: jest.fn() };
  let guard: AdminOnlyGuard;

  beforeEach(() => {
    userRoles.find.mockReset();
    rolePerms.find.mockReset();
    guard = new AdminOnlyGuard(userRoles as any, rolePerms as any);
  });

  it('rejects when there is no user', async () => {
    await expect(guard.canActivate(ctx(undefined))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an RBAC admin in the current tenant and ignores JWT.role', async () => {
    userRoles.find.mockResolvedValue([
      { roleId: 'r1', role: { tenantId: 't1', code: 'admin' } },
    ]);
    const ok = await guard.canActivate(ctx({ userId: 'u1', tenantId: 't1', role: 'member' }));
    expect(ok).toBe(true);
  });

  it('blocks a JWT admin who has no RBAC admin role in this tenant', async () => {
    userRoles.find.mockResolvedValue([
      { roleId: 'r2', role: { tenantId: 't1', code: 'sales' } },
    ]);
    rolePerms.find.mockResolvedValue([]);
    await expect(
      guard.canActivate(ctx({ userId: 'u2', tenantId: 't1', role: 'admin' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows admin.access permission even without owner/admin role code', async () => {
    userRoles.find.mockResolvedValue([
      { roleId: 'r3', role: { tenantId: 't1', code: 'manager' } },
    ]);
    rolePerms.find.mockResolvedValue([{ permission: { code: 'admin.access' } }]);
    const ok = await guard.canActivate(ctx({ userId: 'u3', tenantId: 't1', role: 'member' }));
    expect(ok).toBe(true);
  });

  it('ignores roles from another tenant', async () => {
    userRoles.find.mockResolvedValue([
      { roleId: 'r4', role: { tenantId: 'other', code: 'admin' } },
    ]);
    await expect(
      guard.canActivate(ctx({ userId: 'u4', tenantId: 't1', role: 'admin' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
