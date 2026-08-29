import { type DataSource, type EntityManager } from 'typeorm';

const ROLE_CACHE_FENCE_HASH = 'hashtextextended($1::text, 1597842731::bigint)';

export const lockAnansiRoleCacheWrites = async (
  manager: EntityManager,
  workspaceId: string,
): Promise<void> => {
  await manager.query(
    `SELECT pg_advisory_xact_lock(${ROLE_CACHE_FENCE_HASH})`,
    [workspaceId],
  );
};

export const withAnansiRoleCacheReadFence = async <T>(
  dataSource: DataSource,
  workspaceId: string,
  operation: () => Promise<T>,
): Promise<T> =>
  dataSource.transaction('READ COMMITTED', async (manager) => {
    await manager.query(
      `SELECT pg_advisory_xact_lock_shared(${ROLE_CACHE_FENCE_HASH})`,
      [workspaceId],
    );

    return operation();
  });
