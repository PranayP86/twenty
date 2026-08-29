import { type EntityManager } from 'typeorm';

const API_KEY_MUTATION_LOCK_HASH =
  'hashtextextended($1::text, 886725144::bigint)';

export const lockAnansiApiKeyMutations = async (
  manager: EntityManager,
  workspaceId: string,
): Promise<void> => {
  await manager.query(
    `SELECT pg_advisory_xact_lock(${API_KEY_MUTATION_LOCK_HASH})`,
    [workspaceId],
  );
};
