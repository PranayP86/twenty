import { type DataSource, type EntityManager } from 'typeorm';

import { WorkspaceFlatRoleTargetMapCacheService } from 'src/engine/metadata-modules/flat-role-target/services/workspace-flat-role-target-map-cache.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceUserWorkspaceRoleMapCacheService } from 'src/engine/metadata-modules/role-target/services/workspace-user-workspace-role-map-cache.service';
import {
  lockAnansiRoleCacheWrites,
  withAnansiRoleCacheReadFence,
} from 'src/engine/metadata-modules/role/services/anansi-role-cache-fence';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const READ_LOCK_SQL =
  'SELECT pg_advisory_xact_lock_shared(hashtextextended($1::text, 1597842731::bigint))';
const WRITE_LOCK_SQL =
  'SELECT pg_advisory_xact_lock(hashtextextended($1::text, 1597842731::bigint))';

describe('Anansi role-cache fence', () => {
  it('holds a workspace-scoped shared transaction lock through cache computation', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const manager = { query } as unknown as EntityManager;
    const transaction = jest.fn(
      async (
        _isolation: string,
        operation: (manager: EntityManager) => Promise<unknown>,
      ) => operation(manager),
    );
    const dataSource = { transaction } as unknown as DataSource;
    const operation = jest.fn().mockResolvedValue('computed');

    await expect(
      withAnansiRoleCacheReadFence(dataSource, WORKSPACE_ID, operation),
    ).resolves.toBe('computed');
    expect(transaction).toHaveBeenCalledWith(
      'READ COMMITTED',
      expect.any(Function),
    );
    expect(manager.query).toHaveBeenCalledWith(READ_LOCK_SQL, [WORKSPACE_ID]);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(query.mock.invocationCallOrder[0]).toBeLessThan(
      operation.mock.invocationCallOrder[0],
    );
  });

  it('uses the matching exclusive transaction lock for role changes', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([]),
    } as unknown as EntityManager;

    await lockAnansiRoleCacheWrites(manager, WORKSPACE_ID);

    expect(manager.query).toHaveBeenCalledWith(WRITE_LOCK_SQL, [WORKSPACE_ID]);
  });

  it('holds the shared fence until computed authorization data is published', async () => {
    let transactionCompleted = false;
    const manager = {
      query: jest.fn().mockResolvedValue([]),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(
        async (
          _isolation: string,
          operation: (manager: EntityManager) => Promise<unknown>,
        ) => {
          const result = await operation(manager);

          transactionCompleted = true;

          return result;
        },
      ),
    } as unknown as DataSource;
    const roleTargetRepository = { find: jest.fn().mockResolvedValue([]) };
    const provider = new WorkspaceUserWorkspaceRoleMapCacheService(
      roleTargetRepository as any,
      dataSource,
    );
    const cacheStorage = {
      mdel: jest.fn().mockResolvedValue(undefined),
      mset: jest.fn().mockImplementation(async () => {
        expect(transactionCompleted).toBe(false);
      }),
    };
    const cacheMetricsService = {
      recordRecompute: jest.fn(),
      recordRedisWrite: jest.fn(),
    };
    const workspaceCacheService = new WorkspaceCacheService(
      cacheStorage as any,
      {} as any,
      {} as any,
      cacheMetricsService as any,
      { get: jest.fn().mockReturnValue(300) } as any,
    );

    (workspaceCacheService as any).workspaceCacheProviders.set(
      'userWorkspaceRoleMap',
      provider,
    );

    await workspaceCacheService.invalidateAndRecompute(WORKSPACE_ID, [
      'userWorkspaceRoleMap',
    ]);

    expect(cacheStorage.mset).toHaveBeenCalledTimes(1);
    expect(transactionCompleted).toBe(true);
  });

  it('holds the shared fence through role hash validation and cached data reads', async () => {
    let transactionActive = false;
    const redis = new Map<string, unknown>([
      [
        `userWorkspaceRoleMap:${WORKSPACE_ID}:data`,
        { 'user-workspace-id': 'member-role-id' },
      ],
      [`userWorkspaceRoleMap:${WORKSPACE_ID}:hash`, 'member-hash'],
    ]);
    const manager = {
      query: jest.fn().mockResolvedValue([]),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(
        async (
          _isolation: string,
          operation: (manager: EntityManager) => Promise<unknown>,
        ) => {
          transactionActive = true;

          try {
            return await operation(manager);
          } finally {
            transactionActive = false;
          }
        },
      ),
    } as unknown as DataSource;
    const provider = new WorkspaceUserWorkspaceRoleMapCacheService(
      { find: jest.fn() } as any,
      dataSource,
    );
    const cacheStorage = {
      mget: jest.fn(async (keys: string[]) => {
        expect(transactionActive).toBe(true);

        return keys.map((key) => redis.get(key));
      }),
    };
    const workspaceCacheService = new WorkspaceCacheService(
      cacheStorage as any,
      {} as any,
      {} as any,
      {
        recordRedisRead: jest.fn(),
      } as any,
      { get: jest.fn().mockReturnValue(300) } as any,
    );

    (workspaceCacheService as any).workspaceCacheProviders.set(
      'userWorkspaceRoleMap',
      provider,
    );

    await expect(
      workspaceCacheService.getOrRecompute(WORKSPACE_ID, [
        'userWorkspaceRoleMap',
      ]),
    ).resolves.toEqual({
      userWorkspaceRoleMap: {
        'user-workspace-id': 'member-role-id',
      },
    });
    expect(transactionActive).toBe(false);
  });

  it('does not serve memoized authorization after another server replaces or flushes a role hash', async () => {
    const redis = new Map<string, unknown>();
    const manager = {
      query: jest.fn().mockResolvedValue([]),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(
        async (
          _isolation: string,
          operation: (manager: EntityManager) => Promise<unknown>,
        ) => operation(manager),
      ),
    } as unknown as DataSource;
    const roleTargetRepository = {
      find: jest
        .fn()
        .mockResolvedValue([
          { userWorkspaceId: 'user-workspace-id', roleId: 'admin-role-id' },
        ]),
    };
    const provider = new WorkspaceUserWorkspaceRoleMapCacheService(
      roleTargetRepository as any,
      dataSource,
    );
    const cacheStorage = {
      mget: jest.fn(async (keys: string[]) =>
        keys.map((key) => redis.get(key)),
      ),
      mset: jest.fn(async (entries: Array<{ key: string; value: unknown }>) => {
        for (const { key, value } of entries) {
          redis.set(key, value);
        }
      }),
    };
    const cacheMetricsService = {
      recordRecompute: jest.fn(),
      recordRedisRead: jest.fn(),
      recordRedisWrite: jest.fn(),
    };
    const workspaceCacheService = new WorkspaceCacheService(
      cacheStorage as any,
      {} as any,
      {} as any,
      cacheMetricsService as any,
      { get: jest.fn().mockReturnValue(300) } as any,
    );

    (workspaceCacheService as any).workspaceCacheProviders.set(
      'userWorkspaceRoleMap',
      provider,
    );

    await expect(
      workspaceCacheService.getOrRecompute(WORKSPACE_ID, [
        'userWorkspaceRoleMap',
      ]),
    ).resolves.toEqual({
      userWorkspaceRoleMap: {
        'user-workspace-id': 'admin-role-id',
      },
    });

    redis.set(`userWorkspaceRoleMap:${WORKSPACE_ID}:data`, {
      'user-workspace-id': 'member-role-id',
    });
    redis.set(
      `userWorkspaceRoleMap:${WORKSPACE_ID}:hash`,
      'remote-member-hash',
    );

    await expect(
      workspaceCacheService.getOrRecompute(WORKSPACE_ID, [
        'userWorkspaceRoleMap',
      ]),
    ).resolves.toEqual({
      userWorkspaceRoleMap: {
        'user-workspace-id': 'member-role-id',
      },
    });

    redis.clear();
    roleTargetRepository.find.mockResolvedValue([
      { userWorkspaceId: 'user-workspace-id', roleId: 'new-member-role-id' },
    ]);

    await expect(
      workspaceCacheService.getOrRecompute(WORKSPACE_ID, [
        'userWorkspaceRoleMap',
      ]),
    ).resolves.toEqual({
      userWorkspaceRoleMap: {
        'user-workspace-id': 'new-member-role-id',
      },
    });
  });

  it('offers matching shared publication fences from both role authorization providers', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([]),
    } as unknown as EntityManager;
    const transaction = jest.fn(
      async (
        _isolation: string,
        operation: (manager: EntityManager) => Promise<unknown>,
      ) => operation(manager),
    );
    const dataSource = { transaction } as unknown as DataSource;
    const emptyRepository = { find: jest.fn().mockResolvedValue([]) };
    const flatRoleTargetProvider = new WorkspaceFlatRoleTargetMapCacheService(
      emptyRepository as any,
      emptyRepository as any,
      emptyRepository as any,
      emptyRepository as any,
      dataSource,
    );
    const userWorkspaceRoleProvider =
      new WorkspaceUserWorkspaceRoleMapCacheService(
        emptyRepository as any,
        dataSource,
      );

    await flatRoleTargetProvider.withCachePublicationFence(WORKSPACE_ID, () =>
      flatRoleTargetProvider.computeForCache(WORKSPACE_ID),
    );
    await userWorkspaceRoleProvider.withCachePublicationFence(
      WORKSPACE_ID,
      () => userWorkspaceRoleProvider.computeForCache(WORKSPACE_ID),
    );

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(manager.query).toHaveBeenNthCalledWith(1, READ_LOCK_SQL, [
      WORKSPACE_ID,
    ]);
    expect(manager.query).toHaveBeenNthCalledWith(2, READ_LOCK_SQL, [
      WORKSPACE_ID,
    ]);
  });
});
