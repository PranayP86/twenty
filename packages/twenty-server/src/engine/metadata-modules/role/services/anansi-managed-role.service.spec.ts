import { ForbiddenException } from '@nestjs/common';

import { type DataSource, type EntityManager } from 'typeorm';

import { ApiKeyEntity } from 'src/engine/core-modules/api-key/api-key.entity';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { RoleTargetEntity } from 'src/engine/metadata-modules/role-target/role-target.entity';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { AnansiManagedRoleService } from 'src/engine/metadata-modules/role/services/anansi-managed-role.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_WORKSPACE_ID = '99999999-9999-4999-8999-999999999999';
const MEMBER_ROLE_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ROLE_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_ROLE_ID = '44444444-4444-4444-8444-444444444444';
const USER_WORKSPACE_ID = '55555555-5555-4555-8555-555555555555';
const API_KEY_ID = '66666666-6666-4666-8666-666666666666';
const TARGET_EMAIL = 'friend@example.com';

const role = ({
  id,
  workspaceId = WORKSPACE_ID,
  label,
  universalIdentifier,
}: {
  id: string;
  workspaceId?: string;
  label: string;
  universalIdentifier: string;
}) => ({ id, workspaceId, label, universalIdentifier });

type FakeStore = {
  workspaces: Array<{
    id: string;
    defaultRoleId: string | null;
    deletedAt: Date | null;
  }>;
  roles: Array<{
    id: string;
    workspaceId: string;
    label: string;
    universalIdentifier: string;
  }>;
  userWorkspaces: Array<{
    id: string;
    workspaceId: string;
    userId: string;
    deletedAt: Date | null;
    user: {
      id: string;
      email: string;
      disabled: boolean;
      deletedAt: Date | null;
    };
  }>;
  apiKeys: Array<{
    id: string;
    workspaceId: string;
    name: string;
    expiresAt: Date;
    revokedAt: Date | null;
  }>;
  roleTargets: Array<{
    id: string;
    workspaceId: string;
    roleId: string;
    userWorkspaceId: string | null;
    apiKeyId: string | null;
  }>;
};

class FakeDataSource {
  readonly transactionIsolations: string[] = [];
  readonly workspaceLockModes: string[] = [];
  readonly lockedEntityNames: string[] = [];
  readonly executedQueries: string[] = [];
  beforeUserRoleTargetLock?: () => void;
  updateCount = 0;
  maxActiveTransactions = 0;

  private activeTransactions = 0;
  private transactionTail: Promise<void> = Promise.resolve();

  constructor(readonly store: FakeStore) {}

  async transaction<T>(
    isolation: string,
    operation: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    this.transactionIsolations.push(isolation);

    const prior = this.transactionTail;
    let releaseTransaction: () => void = () => undefined;

    this.transactionTail = new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });

    await prior;
    this.activeTransactions += 1;
    this.maxActiveTransactions = Math.max(
      this.maxActiveTransactions,
      this.activeTransactions,
    );
    const storeSnapshot = structuredClone(this.store);
    const updateCountSnapshot = this.updateCount;

    try {
      return await operation(this.createManager());
    } catch (error) {
      Object.assign(this.store, storeSnapshot);
      this.updateCount = updateCountSnapshot;
      throw error;
    } finally {
      this.activeTransactions -= 1;
      releaseTransaction();
    }
  }

  private createManager(): EntityManager {
    return {
      query: async (sql: string) => {
        this.executedQueries.push(sql);
        return [];
      },
      findOne: async (entity: unknown, options: Record<string, any>) => {
        const where = options.where as Record<string, unknown>;

        if (options.lock?.mode) {
          this.lockedEntityNames.push(
            (entity as { name?: string }).name ?? 'unknown',
          );
        }

        if (entity === WorkspaceEntity) {
          if (options.lock?.mode) {
            this.workspaceLockModes.push(options.lock.mode);
          }

          return (
            this.store.workspaces.find(
              (workspace) =>
                workspace.id === where.id && workspace.deletedAt === null,
            ) ?? null
          );
        }

        if (entity === UserWorkspaceEntity) {
          return (
            this.store.userWorkspaces.find(
              (userWorkspace) =>
                userWorkspace.id === where.id &&
                userWorkspace.workspaceId === where.workspaceId &&
                userWorkspace.deletedAt === null,
            ) ?? null
          );
        }

        if (entity === UserEntity) {
          return (
            this.store.userWorkspaces
              .map((userWorkspace) => userWorkspace.user)
              .find(
                (user) => user.id === where.id && user.deletedAt === null,
              ) ?? null
          );
        }

        if (entity === ApiKeyEntity) {
          return (
            this.store.apiKeys.find(
              (apiKey) =>
                apiKey.id === where.id &&
                apiKey.workspaceId === where.workspaceId &&
                (where.name === undefined || apiKey.name === where.name),
            ) ?? null
          );
        }

        if (entity === RoleEntity) {
          return (
            this.store.roles.find(
              (candidate) =>
                candidate.id === where.id &&
                candidate.workspaceId === where.workspaceId,
            ) ?? null
          );
        }

        if (entity === RoleTargetEntity) {
          if (where.userWorkspaceId !== undefined) {
            this.beforeUserRoleTargetLock?.();
          }

          const target = this.store.roleTargets.find(
            (candidate) =>
              candidate.workspaceId === where.workspaceId &&
              (where.id === undefined || candidate.id === where.id) &&
              (where.roleId === undefined ||
                candidate.roleId === where.roleId) &&
              (where.apiKeyId === undefined ||
                candidate.apiKeyId === where.apiKeyId) &&
              (where.userWorkspaceId === undefined ||
                candidate.userWorkspaceId === where.userWorkspaceId),
          );

          if (!target) {
            return null;
          }

          return {
            ...target,
            role:
              this.store.roles.find(
                (candidate) =>
                  candidate.id === target.roleId &&
                  candidate.workspaceId === target.workspaceId,
              ) ?? null,
          };
        }

        throw new Error('Unexpected findOne entity');
      },
      find: async (entity: unknown, options: Record<string, any>) => {
        const where = options.where as Record<string, unknown>;

        if (entity === UserWorkspaceEntity) {
          return this.store.userWorkspaces.filter(
            (userWorkspace) =>
              userWorkspace.workspaceId === where.workspaceId &&
              userWorkspace.deletedAt === null,
          );
        }

        if (entity === ApiKeyEntity) {
          return this.store.apiKeys.filter(
            (apiKey) =>
              apiKey.workspaceId === where.workspaceId &&
              apiKey.name === where.name,
          );
        }

        if (entity === RoleTargetEntity) {
          return this.store.roleTargets.filter(
            (candidate) =>
              candidate.workspaceId === where.workspaceId &&
              (where.roleId === undefined ||
                candidate.roleId === where.roleId) &&
              (where.userWorkspaceId === undefined ||
                candidate.userWorkspaceId !== null) &&
              (where.apiKeyId === undefined || candidate.apiKeyId !== null),
          );
        }

        throw new Error('Unexpected find entity');
      },
      update: async (
        entity: unknown,
        criteria: Record<string, unknown>,
        update: Record<string, unknown>,
      ) => {
        if (entity !== RoleTargetEntity) {
          throw new Error('Unexpected update entity');
        }

        const target = this.store.roleTargets.find(
          (candidate) =>
            candidate.id === criteria.id &&
            candidate.workspaceId === criteria.workspaceId &&
            candidate.userWorkspaceId === criteria.userWorkspaceId,
        );

        if (!target || typeof update.roleId !== 'string') {
          return { affected: 0 };
        }

        target.roleId = update.roleId;
        this.updateCount += 1;

        return { affected: 1 };
      },
    } as unknown as EntityManager;
  }
}

const makeStore = (): FakeStore => ({
  workspaces: [
    { id: WORKSPACE_ID, defaultRoleId: MEMBER_ROLE_ID, deletedAt: null },
    {
      id: OTHER_WORKSPACE_ID,
      defaultRoleId: OTHER_ROLE_ID,
      deletedAt: null,
    },
  ],
  roles: [
    role({
      id: MEMBER_ROLE_ID,
      label: 'Member',
      universalIdentifier: '77777777-7777-4777-8777-777777777777',
    }),
    role({
      id: ADMIN_ROLE_ID,
      label: 'Admin',
      universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
    }),
    role({
      id: OTHER_ROLE_ID,
      workspaceId: OTHER_WORKSPACE_ID,
      label: 'Member',
      universalIdentifier: '88888888-8888-4888-8888-888888888888',
    }),
  ],
  userWorkspaces: [
    {
      id: USER_WORKSPACE_ID,
      workspaceId: WORKSPACE_ID,
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      deletedAt: null,
      user: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        email: TARGET_EMAIL,
        disabled: false,
        deletedAt: null,
      },
    },
  ],
  apiKeys: [
    {
      id: API_KEY_ID,
      workspaceId: WORKSPACE_ID,
      name: `Anansi Core (${WORKSPACE_ID})`,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      revokedAt: null,
    },
  ],
  roleTargets: [
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      workspaceId: WORKSPACE_ID,
      roleId: ADMIN_ROLE_ID,
      userWorkspaceId: USER_WORKSPACE_ID,
      apiKeyId: null,
    },
    {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      workspaceId: WORKSPACE_ID,
      roleId: ADMIN_ROLE_ID,
      userWorkspaceId: null,
      apiKeyId: API_KEY_ID,
    },
  ],
});

const input = {
  workspaceId: WORKSPACE_ID,
  targetEmail: TARGET_EMAIL,
  memberRoleId: MEMBER_ROLE_ID,
};

describe('AnansiManagedRoleService', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      ANANSI_OWNER_EMAIL: 'owner@example.com',
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  const makeHarness = (
    store = makeStore(),
    options: { flushError?: Error; invalidationError?: Error } = {},
  ) => {
    const dataSource = new FakeDataSource(store);
    const invalidations: Array<{ workspaceId: string; keys: string[] }> = [];
    const flushes: Array<{ workspaceId: string; keys: string[] }> = [];
    const workspaceCacheService = {
      flush: async (workspaceId: string, keys: string[]) => {
        flushes.push({ workspaceId, keys });
        if (options.flushError) throw options.flushError;
      },
      invalidateAndRecompute: async (workspaceId: string, keys: string[]) => {
        invalidations.push({ workspaceId, keys });
        if (options.invalidationError) throw options.invalidationError;
      },
    };
    const service = new AnansiManagedRoleService(
      dataSource as unknown as DataSource,
      workspaceCacheService as unknown as WorkspaceCacheService,
    );

    return { service, dataSource, store, invalidations, flushes };
  };

  const expectGenericRefusal = async (promise: Promise<unknown>) => {
    await expect(promise).rejects.toEqual(
      new ForbiddenException('Managed role assignment refused'),
    );
  };

  it('demotes the sole human Admin when the exact active Anansi key remains Admin', async () => {
    const { service, dataSource, store, invalidations, flushes } =
      makeHarness();

    await expect(service.assignManagedMemberRole(input)).resolves.toEqual({
      assigned: true,
      already: false,
    });
    expect(
      store.roleTargets.find(
        (target) => target.userWorkspaceId === USER_WORKSPACE_ID,
      )?.roleId,
    ).toBe(MEMBER_ROLE_ID);
    expect(dataSource.transactionIsolations).toEqual(['READ COMMITTED']);
    expect(dataSource.workspaceLockModes).toEqual(['pessimistic_write']);
    expect(dataSource.executedQueries).toEqual([
      'SELECT pg_advisory_xact_lock(hashtextextended($1::text, 886725144::bigint))',
      'SELECT pg_advisory_xact_lock(hashtextextended($1::text, 1597842731::bigint))',
      'LOCK TABLE "core"."apiKey" IN SHARE MODE',
      'LOCK TABLE "core"."roleTarget" IN SHARE ROW EXCLUSIVE MODE',
    ]);
    expect(dataSource.lockedEntityNames).toEqual([
      'WorkspaceEntity',
      'RoleEntity',
      'UserWorkspaceEntity',
      'UserEntity',
      'ApiKeyEntity',
      'RoleTargetEntity',
      'RoleEntity',
      'RoleTargetEntity',
    ]);
    expect(flushes).toEqual([
      {
        workspaceId: WORKSPACE_ID,
        keys: ['flatRoleTargetMaps', 'userWorkspaceRoleMap'],
      },
    ]);
    expect(invalidations).toEqual([
      {
        workspaceId: WORKSPACE_ID,
        keys: ['flatRoleTargetMaps', 'userWorkspaceRoleMap'],
      },
    ]);
  });

  it('rolls back the demotion when pre-commit cache eviction fails', async () => {
    const store = makeStore();
    const { service, dataSource, invalidations, flushes } = makeHarness(store, {
      flushError: new Error('cache unavailable'),
    });

    await expect(service.assignManagedMemberRole(input)).rejects.toThrow();
    expect(
      store.roleTargets.find(
        (target) => target.userWorkspaceId === USER_WORKSPACE_ID,
      )?.roleId,
    ).toBe(ADMIN_ROLE_ID);
    expect(dataSource.updateCount).toBe(0);
    expect(flushes).toHaveLength(1);
    expect(invalidations).toEqual([]);
  });

  it('evicts role caches again when post-commit recomputation fails', async () => {
    const store = makeStore();
    const { service, invalidations, flushes } = makeHarness(store, {
      invalidationError: new Error('cache recompute unavailable'),
    });

    await expect(service.assignManagedMemberRole(input)).rejects.toThrow();
    expect(
      store.roleTargets.find(
        (target) => target.userWorkspaceId === USER_WORKSPACE_ID,
      )?.roleId,
    ).toBe(MEMBER_ROLE_ID);
    expect(flushes).toHaveLength(2);
    expect(invalidations).toHaveLength(1);
  });

  it('rechecks managed key expiry immediately before the demotion', async () => {
    const store = makeStore();
    const { service, dataSource } = makeHarness(store);

    dataSource.beforeUserRoleTargetLock = () => {
      store.apiKeys[0].expiresAt = new Date('2000-01-01T00:00:00.000Z');
    };

    await expectGenericRefusal(service.assignManagedMemberRole(input));
    expect(dataSource.updateCount).toBe(0);
  });

  it('returns an idempotent replay without rewriting the role target', async () => {
    const store = makeStore();
    const target = store.roleTargets.find(
      (candidate) => candidate.userWorkspaceId === USER_WORKSPACE_ID,
    );

    if (!target) {
      throw new Error('test target missing');
    }
    target.roleId = MEMBER_ROLE_ID;

    const { service, dataSource } = makeHarness(store);

    await expect(service.assignManagedMemberRole(input)).resolves.toEqual({
      assigned: true,
      already: true,
    });
    expect(dataSource.updateCount).toBe(0);
  });

  it('refuses a replay when another active human Admin exists', async () => {
    const store = makeStore();
    const target = store.roleTargets.find(
      (candidate) => candidate.userWorkspaceId === USER_WORKSPACE_ID,
    );
    const secondUserWorkspaceId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

    if (!target) {
      throw new Error('test target missing');
    }
    target.roleId = MEMBER_ROLE_ID;
    store.userWorkspaces.push({
      id: secondUserWorkspaceId,
      workspaceId: WORKSPACE_ID,
      userId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      deletedAt: null,
      user: {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        email: 'second-admin@example.com',
        disabled: false,
        deletedAt: null,
      },
    });
    store.roleTargets.push({
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      workspaceId: WORKSPACE_ID,
      roleId: ADMIN_ROLE_ID,
      userWorkspaceId: secondUserWorkspaceId,
      apiKeyId: null,
    });

    const { service, dataSource } = makeHarness(store);

    await expectGenericRefusal(service.assignManagedMemberRole(input));
    expect(dataSource.updateCount).toBe(0);
  });

  it('serializes concurrent replays so exactly one request performs the demotion', async () => {
    const { service, dataSource } = makeHarness();

    const results = await Promise.all([
      service.assignManagedMemberRole(input),
      service.assignManagedMemberRole(input),
    ]);

    expect(results).toEqual([
      { assigned: true, already: false },
      { assigned: true, already: true },
    ]);
    expect(dataSource.updateCount).toBe(1);
    expect(dataSource.maxActiveTransactions).toBe(1);
  });

  it('refuses the exception when another active human Admin exists', async () => {
    const store = makeStore();
    const secondUserWorkspaceId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

    store.userWorkspaces.push({
      id: secondUserWorkspaceId,
      workspaceId: WORKSPACE_ID,
      userId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      deletedAt: null,
      user: {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        email: 'second-admin@example.com',
        disabled: false,
        deletedAt: null,
      },
    });
    store.roleTargets.push({
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      workspaceId: WORKSPACE_ID,
      roleId: ADMIN_ROLE_ID,
      userWorkspaceId: secondUserWorkspaceId,
      apiKeyId: null,
    });

    const { service, dataSource } = makeHarness(store);

    await expectGenericRefusal(service.assignManagedMemberRole(input));
    expect(dataSource.updateCount).toBe(0);
  });

  it('refuses when any other active API key has canonical Admin', async () => {
    const store = makeStore();
    const secondApiKeyId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

    store.apiKeys.push({
      id: secondApiKeyId,
      workspaceId: WORKSPACE_ID,
      name: 'Other Admin key',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      revokedAt: null,
    });
    store.roleTargets.push({
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      workspaceId: WORKSPACE_ID,
      roleId: ADMIN_ROLE_ID,
      userWorkspaceId: null,
      apiKeyId: secondApiKeyId,
    });

    const { service, dataSource } = makeHarness(store);

    await expectGenericRefusal(service.assignManagedMemberRole(input));
    expect(dataSource.updateCount).toBe(0);
  });

  it.each([
    {
      name: 'unknown workspace',
      mutate: (_store: FakeStore) => undefined,
      request: { ...input, workspaceId: OTHER_ROLE_ID },
    },
    {
      name: 'email absent from the workspace',
      mutate: (_store: FakeStore) => undefined,
      request: { ...input, targetEmail: 'missing@example.com' },
    },
    {
      name: 'Member role from another workspace',
      mutate: (_store: FakeStore) => undefined,
      request: { ...input, memberRoleId: OTHER_ROLE_ID },
    },
    {
      name: 'target membership from another workspace',
      mutate: (store: FakeStore) => {
        store.userWorkspaces[0].workspaceId = OTHER_WORKSPACE_ID;
      },
      request: input,
    },
    {
      name: 'API-key role target from another workspace',
      mutate: (store: FakeStore) => {
        const keyTarget = store.roleTargets.find(
          (target) => target.apiKeyId === API_KEY_ID,
        );
        if (keyTarget) keyTarget.workspaceId = OTHER_WORKSPACE_ID;
      },
      request: input,
    },
  ])(
    'rejects $name with the same generic error',
    async ({ mutate, request }) => {
      const store = makeStore();
      mutate(store);
      const { service, dataSource } = makeHarness(store);

      await expectGenericRefusal(service.assignManagedMemberRole(request));
      expect(dataSource.updateCount).toBe(0);
    },
  );

  it.each([
    {
      name: 'wrong API-key name',
      mutate: (store: FakeStore) => {
        store.apiKeys[0].name = 'Anansi Core';
      },
    },
    {
      name: 'expired API key',
      mutate: (store: FakeStore) => {
        store.apiKeys[0].expiresAt = new Date('2000-01-01T00:00:00.000Z');
      },
    },
    {
      name: 'revoked API key',
      mutate: (store: FakeStore) => {
        store.apiKeys[0].revokedAt = new Date('2026-01-01T00:00:00.000Z');
      },
    },
    {
      name: 'API key assigned Member instead of Admin',
      mutate: (store: FakeStore) => {
        const keyTarget = store.roleTargets.find(
          (target) => target.apiKeyId === API_KEY_ID,
        );
        if (keyTarget) keyTarget.roleId = MEMBER_ROLE_ID;
      },
    },
    {
      name: 'two active API keys with the managed name',
      mutate: (store: FakeStore) => {
        store.apiKeys.push({
          ...store.apiKeys[0],
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        });
      },
    },
  ])('rejects $name', async ({ mutate }) => {
    const store = makeStore();
    mutate(store);
    const { service, dataSource } = makeHarness(store);

    await expectGenericRefusal(service.assignManagedMemberRole(input));
    expect(dataSource.updateCount).toBe(0);
  });

  it('rejects the configured Anansi owner email after normalization', async () => {
    process.env.ANANSI_OWNER_EMAIL = ' Owner@Example.COM ';
    const store = makeStore();
    store.userWorkspaces[0].user.email = 'owner@example.com';
    const { service, dataSource } = makeHarness(store);

    await expectGenericRefusal(
      service.assignManagedMemberRole({
        ...input,
        targetEmail: 'owner@example.com',
      }),
    );
    expect(dataSource.updateCount).toBe(0);
  });

  it('fails closed when the Anansi owner email is not configured', async () => {
    delete process.env.ANANSI_OWNER_EMAIL;
    const { service, dataSource } = makeHarness();

    await expectGenericRefusal(service.assignManagedMemberRole(input));
    expect(dataSource.updateCount).toBe(0);
  });

  it('rejects a target whose soft-deleted user relation is unavailable', async () => {
    const store = makeStore();
    store.userWorkspaces[0].user =
      null as unknown as FakeStore['userWorkspaces'][number]['user'];
    const { service, dataSource } = makeHarness(store);

    await expectGenericRefusal(service.assignManagedMemberRole(input));
    expect(dataSource.updateCount).toBe(0);
  });

  it('rejects a disabled user as an inactive workspace member', async () => {
    const store = makeStore();
    store.userWorkspaces[0].user.disabled = true;
    const { service, dataSource } = makeHarness(store);

    await expectGenericRefusal(service.assignManagedMemberRole(input));
    expect(dataSource.updateCount).toBe(0);
  });

  it('rejects a non-unique target member email', async () => {
    const store = makeStore();
    store.userWorkspaces.push({
      ...store.userWorkspaces[0],
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      user: {
        ...store.userWorkspaces[0].user,
        id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      },
    });
    const { service, dataSource } = makeHarness(store);

    await expectGenericRefusal(service.assignManagedMemberRole(input));
    expect(dataSource.updateCount).toBe(0);
  });

  it('rejects a role labeled Member that is not the workspace managed default role', async () => {
    const store = makeStore();
    store.workspaces[0].defaultRoleId = OTHER_ROLE_ID;
    const { service, dataSource } = makeHarness(store);

    await expectGenericRefusal(service.assignManagedMemberRole(input));
    expect(dataSource.updateCount).toBe(0);
  });

  it('rejects a target role whose label is not exact managed Member', async () => {
    const store = makeStore();
    const memberRole = store.roles.find(
      (candidate) => candidate.id === MEMBER_ROLE_ID,
    );
    if (memberRole) memberRole.label = 'member';
    const { service, dataSource } = makeHarness(store);

    await expectGenericRefusal(service.assignManagedMemberRole(input));
    expect(dataSource.updateCount).toBe(0);
  });

  it('rejects a first request unless the target currently has the stock Admin role', async () => {
    const store = makeStore();
    const target = store.roleTargets.find(
      (candidate) => candidate.userWorkspaceId === USER_WORKSPACE_ID,
    );
    if (target) target.roleId = OTHER_ROLE_ID;
    const { service, dataSource } = makeHarness(store);

    await expectGenericRefusal(service.assignManagedMemberRole(input));
    expect(dataSource.updateCount).toBe(0);
  });
});
