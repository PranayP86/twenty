import { MODULE_METADATA } from '@nestjs/common/constants';

import { type DataSource, type EntityManager } from 'typeorm';

import { ApiKeyEntity } from 'src/engine/core-modules/api-key/api-key.entity';
import { AnansiApiKeyAdminSafetyService } from 'src/engine/core-modules/api-key/services/anansi-api-key-admin-safety.service';
import { ApiKeyRoleService } from 'src/engine/core-modules/api-key/services/api-key-role.service';
import { ApiKeyService } from 'src/engine/core-modules/api-key/services/api-key.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { RoleTargetEntity } from 'src/engine/metadata-modules/role-target/role-target.entity';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ROLE_ID = '22222222-2222-4222-8222-222222222222';
const MEMBER_ROLE_ID = '33333333-3333-4333-8333-333333333333';
const API_KEY_ID = '44444444-4444-4444-8444-444444444444';
const STALE_API_KEY_ID = '66666666-6666-4666-8666-666666666666';
const USER_WORKSPACE_ID = '55555555-5555-4555-8555-555555555555';

const API_KEY_MUTATION_LOCK_SQL =
  'SELECT pg_advisory_xact_lock(hashtextextended($1::text, 886725144::bigint))';

const adminRole = {
  id: ADMIN_ROLE_ID,
  workspaceId: WORKSPACE_ID,
  label: 'Admin',
  universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
  canBeAssignedToApiKeys: true,
};
const memberRole = {
  id: MEMBER_ROLE_ID,
  workspaceId: WORKSPACE_ID,
  label: 'Member',
  universalIdentifier: '20202020-1c25-4d02-bf25-6aeccf7ea419',
};
const managedApiKey = {
  id: API_KEY_ID,
  workspaceId: WORKSPACE_ID,
  name: `Anansi Core (${WORKSPACE_ID})`,
  expiresAt: new Date('2099-01-01T00:00:00.000Z'),
  revokedAt: null,
};

const makeManager = ({
  activeHumanAdmins = 0,
  hasManagedAdminKey = true,
  managedApiKeyOverrides = {},
}: {
  activeHumanAdmins?: number;
  hasManagedAdminKey?: boolean;
  managedApiKeyOverrides?: Partial<ApiKeyEntity>;
} = {}) => {
  const currentManagedApiKey = {
    ...managedApiKey,
    ...managedApiKeyOverrides,
  };
  const humanRoleTargets = Array.from(
    { length: activeHumanAdmins },
    (_, index) => ({
      id: `aaaaaaaa-aaaa-4aaa-8aa${index}-aaaaaaaaaaa${index}`,
      workspaceId: WORKSPACE_ID,
      roleId: ADMIN_ROLE_ID,
      userWorkspaceId: USER_WORKSPACE_ID,
      apiKeyId: null,
    }),
  );
  const manager = {
    query: jest.fn().mockResolvedValue([]),
    find: jest.fn(async (entity: unknown, options?: Record<string, any>) => {
      const where = options?.where as Record<string, unknown> | undefined;

      if (entity === ApiKeyEntity) {
        return hasManagedAdminKey ? [currentManagedApiKey] : [];
      }
      if (entity === RoleTargetEntity) {
        if (where?.apiKeyId === API_KEY_ID) {
          return hasManagedAdminKey
            ? [
                {
                  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                  workspaceId: WORKSPACE_ID,
                  roleId: ADMIN_ROLE_ID,
                  apiKeyId: API_KEY_ID,
                  userWorkspaceId: null,
                },
              ]
            : [];
        }
        return humanRoleTargets;
      }
      if (entity === RoleEntity) return [adminRole];
      throw new Error('unexpected find');
    }),
    findOne: jest.fn(async (entity: unknown, options: Record<string, any>) => {
      const where = options.where as Record<string, unknown>;

      if (entity === WorkspaceEntity) {
        return { id: WORKSPACE_ID, deletedAt: null };
      }
      if (entity === ApiKeyEntity) {
        return hasManagedAdminKey ? currentManagedApiKey : null;
      }
      if (entity === RoleEntity) {
        if (where.id === MEMBER_ROLE_ID) return memberRole;
        return adminRole;
      }
      if (entity === RoleTargetEntity) {
        if (where.apiKeyId === API_KEY_ID) {
          return {
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            workspaceId: WORKSPACE_ID,
            roleId: ADMIN_ROLE_ID,
            apiKeyId: API_KEY_ID,
            userWorkspaceId: null,
          };
        }
        return humanRoleTargets[0] ?? null;
      }
      if (entity === UserWorkspaceEntity) {
        return {
          id: USER_WORKSPACE_ID,
          workspaceId: WORKSPACE_ID,
          userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          deletedAt: null,
        };
      }
      if (entity === UserEntity) {
        return {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          disabled: false,
          deletedAt: null,
        };
      }
      throw new Error('unexpected findOne');
    }),
  } as unknown as EntityManager;

  return manager;
};

const makeSafetyService = ({
  activeHumanAdmins = 0,
  hasManagedAdminKey = true,
  managedApiKeyOverrides = {},
}: {
  activeHumanAdmins?: number;
  hasManagedAdminKey?: boolean;
  managedApiKeyOverrides?: Partial<ApiKeyEntity>;
} = {}) => {
  const manager = makeManager({
    activeHumanAdmins,
    hasManagedAdminKey,
    managedApiKeyOverrides,
  });
  const dataSource = {
    transaction: jest.fn(
      async (
        _isolation: string,
        operation: (transactionManager: EntityManager) => Promise<unknown>,
      ) => operation(manager),
    ),
  } as unknown as DataSource;

  return {
    manager,
    service: new AnansiApiKeyAdminSafetyService(dataSource),
  };
};

const makeInactiveSameNamedKeyHarness = ({
  expiresAt,
  revokedAt,
}: {
  expiresAt: Date;
  revokedAt: Date | null;
}) => {
  const { manager, service } = makeSafetyService();
  const staleApiKey = {
    ...managedApiKey,
    id: STALE_API_KEY_ID,
    expiresAt,
    revokedAt,
  };
  const staleRoleTarget = {
    id: '77777777-7777-4777-8777-777777777777',
    workspaceId: WORKSPACE_ID,
    roleId: MEMBER_ROLE_ID,
    apiKeyId: STALE_API_KEY_ID,
    userWorkspaceId: null,
  };
  const find = manager.find as jest.Mock;
  const findOne = manager.findOne as jest.Mock;
  const baseFind = find.getMockImplementation();
  const baseFindOne = findOne.getMockImplementation();

  if (!baseFind || !baseFindOne) {
    throw new Error('test manager implementation missing');
  }

  find.mockImplementation(
    async (entity: unknown, options?: Record<string, any>) => {
      const where = options?.where as Record<string, unknown> | undefined;

      if (entity === ApiKeyEntity) {
        return [staleApiKey, managedApiKey];
      }
      if (entity === RoleTargetEntity && where?.apiKeyId === STALE_API_KEY_ID) {
        return [staleRoleTarget];
      }

      return baseFind(entity, options);
    },
  );
  findOne.mockImplementation(
    async (entity: unknown, options: Record<string, any>) => {
      const where = options.where as Record<string, unknown>;

      if (entity === ApiKeyEntity && where.id === STALE_API_KEY_ID) {
        return staleApiKey;
      }
      if (entity === RoleTargetEntity && where.apiKeyId === STALE_API_KEY_ID) {
        return staleRoleTarget;
      }

      return baseFindOne(entity, options);
    },
  );

  return { manager, service, staleApiKey };
};

describe('AnansiApiKeyAdminSafetyService', () => {
  it('serializes stock API-key mutations with a workspace-scoped advisory lock', async () => {
    const { manager, service } = makeSafetyService();
    const operation = jest.fn().mockResolvedValue('done');

    await expect(
      service.runWithWorkspaceMutationLock(WORKSPACE_ID, operation),
    ).resolves.toBe('done');
    expect(manager.query).toHaveBeenCalledWith(API_KEY_MUTATION_LOCK_SQL, [
      WORKSPACE_ID,
    ]);
    expect(manager.findOne).toHaveBeenCalledWith(WorkspaceEntity, {
      where: { id: WORKSPACE_ID },
    });
    expect(operation).toHaveBeenCalledWith(manager);
  });

  it('rejects a new canonical Admin API key after the last human Admin is gone', async () => {
    const { manager, service } = makeSafetyService();

    await expect(
      service.assertCanCreateApiKey({
        manager,
        workspaceId: WORKSPACE_ID,
        roleId: ADMIN_ROLE_ID,
      }),
    ).rejects.toThrow('Admin API-key mutation refused');
  });

  it('allows canonical Admin API-key creation while an active human Admin remains', async () => {
    const { manager, service } = makeSafetyService({ activeHumanAdmins: 1 });

    await expect(
      service.assertCanCreateApiKey({
        manager,
        workspaceId: WORKSPACE_ID,
        roleId: ADMIN_ROLE_ID,
      }),
    ).resolves.toBeUndefined();
  });

  it('preserves stock Admin API-key creation in an unmanaged workspace', async () => {
    const { manager, service } = makeSafetyService({
      hasManagedAdminKey: false,
    });

    await expect(
      service.assertCanCreateApiKey({
        manager,
        workspaceId: WORKSPACE_ID,
        roleId: ADMIN_ROLE_ID,
      }),
    ).resolves.toBeUndefined();
  });

  it('does not treat an expired managed key as an active managed state', async () => {
    const { manager, service } = makeSafetyService({
      managedApiKeyOverrides: {
        expiresAt: new Date('2000-01-01T00:00:00.000Z'),
      },
    });

    await expect(
      service.assertCanCreateApiKey({
        manager,
        workspaceId: WORKSPACE_ID,
        roleId: ADMIN_ROLE_ID,
      }),
    ).resolves.toBeUndefined();
  });

  it('does not treat a revoked managed key as an active managed state', async () => {
    const { manager, service } = makeSafetyService({
      managedApiKeyOverrides: {
        revokedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    await expect(
      service.assertCanCreateApiKey({
        manager,
        workspaceId: WORKSPACE_ID,
        roleId: ADMIN_ROLE_ID,
      }),
    ).resolves.toBeUndefined();
  });

  it('allows a non-Admin role change on an expired same-named key', async () => {
    const { manager, service, staleApiKey } = makeInactiveSameNamedKeyHarness({
      expiresAt: new Date('2000-01-01T00:00:00.000Z'),
      revokedAt: null,
    });

    await expect(
      service.assertCanChangeApiKeyRole({
        manager,
        workspaceId: WORKSPACE_ID,
        apiKey: staleApiKey as ApiKeyEntity,
        role: memberRole as RoleEntity,
      }),
    ).resolves.toBeUndefined();
  });

  it('allows metadata cleanup on a revoked same-named non-Admin key', async () => {
    const { manager, service, staleApiKey } = makeInactiveSameNamedKeyHarness({
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      revokedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(
      service.assertCanUpdateApiKey({
        manager,
        workspaceId: WORKSPACE_ID,
        apiKey: staleApiKey as ApiKeyEntity,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects changing any key to canonical Admin after the last human Admin is gone', async () => {
    const { manager, service } = makeSafetyService();

    await expect(
      service.assertCanChangeApiKeyRole({
        manager,
        workspaceId: WORKSPACE_ID,
        apiKey: { ...managedApiKey, name: 'Other key' } as ApiKeyEntity,
        role: adminRole as RoleEntity,
      }),
    ).rejects.toThrow('Admin API-key mutation refused');
  });

  it('rejects weakening the managed key after the last human Admin is gone', async () => {
    const { manager, service } = makeSafetyService();

    await expect(
      service.assertCanChangeApiKeyRole({
        manager,
        workspaceId: WORKSPACE_ID,
        apiKey: managedApiKey as ApiKeyEntity,
        role: memberRole as RoleEntity,
      }),
    ).rejects.toThrow('Admin API-key mutation refused');
    await expect(
      service.assertCanUpdateApiKey({
        manager,
        workspaceId: WORKSPACE_ID,
        apiKey: managedApiKey as ApiKeyEntity,
      }),
    ).rejects.toThrow('Admin API-key mutation refused');
  });
});

describe('stock API-key mutation coordination', () => {
  const manager = {} as EntityManager;
  const safetyService = {
    runWithWorkspaceMutationLock: jest.fn(
      async (
        _workspaceId: string,
        operation: (manager: EntityManager) => unknown,
      ) => operation(manager),
    ),
    assertCanCreateApiKey: jest.fn(),
    assertCanUpdateApiKey: jest.fn(),
    assertCanChangeApiKeyRole: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers the safety dependency beside the duplicate API-key role service', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      PermissionsModule,
    ) as unknown[];

    expect(providers).toContain(AnansiApiKeyAdminSafetyService);
  });

  it('wraps stock API-key creation and update in the shared workspace lock', async () => {
    const apiKeyRepository = {
      insertAndReturnOne: jest.fn().mockResolvedValue({
        ...managedApiKey,
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        revokedAt: null,
      }),
      findOne: jest.fn().mockResolvedValue(managedApiKey),
      update: jest.fn(),
    };
    const roleTargetService = { create: jest.fn() };
    const workspaceCacheService = { invalidateAndRecompute: jest.fn() };
    const service = new ApiKeyService(
      apiKeyRepository as any,
      {} as any,
      roleTargetService as any,
      workspaceCacheService as any,
      safetyService as any,
    );

    await service.create({
      workspaceId: WORKSPACE_ID,
      roleId: ADMIN_ROLE_ID,
      name: managedApiKey.name,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      revokedAt: null,
    });
    await service.update(API_KEY_ID, WORKSPACE_ID, { name: 'updated' });

    expect(safetyService.runWithWorkspaceMutationLock).toHaveBeenCalledTimes(2);
    expect(safetyService.assertCanCreateApiKey).toHaveBeenCalledWith({
      manager,
      workspaceId: WORKSPACE_ID,
      roleId: ADMIN_ROLE_ID,
    });
    expect(safetyService.assertCanUpdateApiKey).toHaveBeenCalledWith({
      manager,
      workspaceId: WORKSPACE_ID,
      apiKey: managedApiKey,
    });
  });

  it('wraps stock API-key role assignment in the shared workspace lock', async () => {
    const roleTargetService = { create: jest.fn() };
    const service = new ApiKeyRoleService(
      { findOne: jest.fn() } as any,
      { findOne: jest.fn().mockResolvedValue(adminRole) } as any,
      { findOne: jest.fn().mockResolvedValue(managedApiKey) } as any,
      {} as any,
      roleTargetService as any,
      safetyService as any,
    );

    await service.assignRoleToApiKey({
      apiKeyId: API_KEY_ID,
      roleId: ADMIN_ROLE_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(safetyService.runWithWorkspaceMutationLock).toHaveBeenCalledTimes(1);
    expect(safetyService.assertCanChangeApiKeyRole).toHaveBeenCalledWith({
      manager,
      workspaceId: WORKSPACE_ID,
      apiKey: managedApiKey,
      role: adminRole,
    });
    expect(roleTargetService.create).toHaveBeenCalled();
  });
});
