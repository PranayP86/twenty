import { GUARDS_METADATA } from '@nestjs/common/constants';

import { type Repository } from 'typeorm';

import { type UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { ApiKeyResolver } from 'src/engine/core-modules/api-key/api-key.resolver';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { PermissionsExceptionCode } from 'src/engine/metadata-modules/permissions/permissions.exception';
import { type RoleTargetService } from 'src/engine/metadata-modules/role-target/services/role-target.service';
import { type RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { RoleResolver } from 'src/engine/metadata-modules/role/role.resolver';
import { type RoleValidationService } from 'src/engine/metadata-modules/role-validation/services/role-validation.service';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const USER_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ROLE_ID = '33333333-3333-4333-8333-333333333333';
const MEMBER_ROLE_ID = '44444444-4444-4444-8444-444444444444';

describe('stock role-assignment protections', () => {
  it('keeps UserAuthGuard on the stock workspace-member role mutation', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      RoleResolver.prototype.updateWorkspaceMemberRole,
    ) as unknown[];

    expect(guards).toContain(UserAuthGuard);
  });

  it('keeps RequireAccessTokenGuard on the stock API-key role mutation', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      ApiKeyResolver.prototype.assignRoleToApiKey,
    ) as unknown[];

    expect(guards).toContain(RequireAccessTokenGuard);
  });

  it('keeps the stock last-human-Admin rejection in UserRoleService', async () => {
    const userWorkspaceRepository = {
      find: jest.fn().mockResolvedValue([{ id: USER_WORKSPACE_ID }]),
    } as unknown as Repository<UserWorkspaceEntity>;
    const roleValidationService = {
      validateRoleAssignableToUsersOrThrow: jest
        .fn()
        .mockResolvedValue(undefined),
    } as unknown as RoleValidationService;
    const roleTargetService = {
      createMany: jest.fn(),
    } as unknown as RoleTargetService;
    const service = new UserRoleService(
      {} as WorkspaceScopedRepository<any>,
      userWorkspaceRepository,
      {} as GlobalWorkspaceOrmManager,
      roleTargetService,
      {} as WorkspaceCacheService,
      roleValidationService,
    );
    const adminRole = {
      id: ADMIN_ROLE_ID,
      workspaceId: WORKSPACE_ID,
      universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
    } as RoleEntity;

    jest
      .spyOn(service, 'getRolesByUserWorkspaces')
      .mockResolvedValue(new Map([[USER_WORKSPACE_ID, [adminRole]]]));
    jest
      .spyOn(service, 'getWorkspaceMembersAssignedToRole')
      .mockResolvedValue([{ id: 'only-human-admin' }] as any);

    await expect(
      service.assignRoleToManyUserWorkspace({
        workspaceId: WORKSPACE_ID,
        userWorkspaceIds: [USER_WORKSPACE_ID],
        roleId: MEMBER_ROLE_ID,
      }),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.CANNOT_UNASSIGN_LAST_ADMIN,
    });
    expect(roleTargetService.createMany).not.toHaveBeenCalled();
  });
});
