import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { IsNull, Not, type DataSource, type EntityManager } from 'typeorm';

import { ApiKeyEntity } from 'src/engine/core-modules/api-key/api-key.entity';
import { lockAnansiApiKeyMutations } from 'src/engine/core-modules/api-key/services/anansi-api-key-mutation-lock';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { MEMBER_ROLE_LABEL } from 'src/engine/metadata-modules/permissions/constants/member-role-label.constants';
import { RoleTargetEntity } from 'src/engine/metadata-modules/role-target/role-target.entity';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { lockAnansiRoleCacheWrites } from 'src/engine/metadata-modules/role/services/anansi-role-cache-fence';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

type AssignManagedMemberRoleInput = {
  workspaceId: string;
  targetEmail: string;
  memberRoleId: string;
};

type AssignManagedMemberRoleResult = {
  assigned: true;
  already: boolean;
};

const ROLE_CACHE_KEYS = ['flatRoleTargetMaps', 'userWorkspaceRoleMap'] as const;

@Injectable()
export class AnansiManagedRoleService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {}

  async assignManagedMemberRole({
    workspaceId,
    targetEmail,
    memberRoleId,
  }: AssignManagedMemberRoleInput): Promise<AssignManagedMemberRoleResult> {
    const normalizedOwnerEmail =
      process.env.ANANSI_OWNER_EMAIL?.trim().toLowerCase();

    if (
      !normalizedOwnerEmail ||
      targetEmail !== targetEmail.trim().toLowerCase() ||
      targetEmail === normalizedOwnerEmail
    ) {
      this.refuse();
    }

    const already = await this.dataSource.transaction(
      'READ COMMITTED',
      async (manager) => {
        // Take the shared API-key mutation lock before the workspace row. Stock
        // key writes hold this advisory lock from a separate repository runner.
        await lockAnansiApiKeyMutations(manager, workspaceId);

        const workspace = await manager.findOne(WorkspaceEntity, {
          where: { id: workspaceId },
          lock: { mode: 'pessimistic_write' },
        });

        if (
          !workspace ||
          workspace.deletedAt ||
          workspace.defaultRoleId !== memberRoleId
        ) {
          this.refuse();
        }

        // Cache providers take the matching shared advisory lock. Waiting here
        // drains old in-flight computations; new ones wait until this commits.
        await lockAnansiRoleCacheWrites(manager, workspaceId);

        // Stock API-key and role-target writes take ROW EXCLUSIVE table locks.
        // SHARE freezes API keys. SHARE ROW EXCLUSIVE freezes role targets and
        // avoids a SHARE-to-write upgrade deadlock between different workspaces.
        await manager.query('LOCK TABLE "core"."apiKey" IN SHARE MODE');
        await manager.query(
          'LOCK TABLE "core"."roleTarget" IN SHARE ROW EXCLUSIVE MODE',
        );

        const memberRole = await manager.findOne(RoleEntity, {
          where: { id: memberRoleId, workspaceId },
          lock: { mode: 'pessimistic_read' },
        });

        if (!memberRole || memberRole.label !== MEMBER_ROLE_LABEL) {
          this.refuse();
        }

        const matchingUserWorkspaces = (
          await manager.find(UserWorkspaceEntity, {
            where: { workspaceId },
            relations: { user: true },
          })
        ).filter(
          (userWorkspace) =>
            !userWorkspace.deletedAt &&
            userWorkspace.user !== null &&
            userWorkspace.user !== undefined &&
            !userWorkspace.user.deletedAt &&
            !userWorkspace.user.disabled &&
            userWorkspace.user.email === targetEmail,
        );

        if (matchingUserWorkspaces.length !== 1) {
          this.refuse();
        }

        const targetUserWorkspace = matchingUserWorkspaces[0];
        const lockedUserWorkspace = await manager.findOne(UserWorkspaceEntity, {
          where: { id: targetUserWorkspace.id, workspaceId },
          lock: { mode: 'pessimistic_read' },
        });

        if (
          !lockedUserWorkspace ||
          lockedUserWorkspace.deletedAt ||
          lockedUserWorkspace.userId !== targetUserWorkspace.userId
        ) {
          this.refuse();
        }

        const lockedUser = await manager.findOne(UserEntity, {
          where: { id: lockedUserWorkspace.userId },
          lock: { mode: 'pessimistic_read' },
        });

        if (
          !lockedUser ||
          lockedUser.deletedAt ||
          lockedUser.disabled ||
          lockedUser.email !== targetEmail
        ) {
          this.refuse();
        }

        const expectedApiKeyName = `Anansi Core (${workspaceId})`;
        const activeApiKeys = (
          await manager.find(ApiKeyEntity, {
            where: { workspaceId, name: expectedApiKeyName },
          })
        ).filter((apiKey) => this.isActiveApiKey(apiKey));

        if (activeApiKeys.length !== 1) {
          this.refuse();
        }

        const lockedApiKey = await manager.findOne(ApiKeyEntity, {
          where: {
            id: activeApiKeys[0].id,
            workspaceId,
            name: expectedApiKeyName,
          },
          lock: { mode: 'pessimistic_read' },
        });

        this.assertActiveApiKey(lockedApiKey);

        const apiKeyRoleTarget = await manager.findOne(RoleTargetEntity, {
          where: {
            workspaceId,
            apiKeyId: lockedApiKey.id,
          },
          lock: { mode: 'pessimistic_read' },
        });

        if (!apiKeyRoleTarget) {
          this.refuse();
        }

        const adminRole = await manager.findOne(RoleEntity, {
          where: { id: apiKeyRoleTarget.roleId, workspaceId },
          lock: { mode: 'pessimistic_read' },
        });

        if (
          !adminRole ||
          adminRole.label !== 'Admin' ||
          adminRole.universalIdentifier !==
            STANDARD_ROLE.admin.universalIdentifier
        ) {
          this.refuse();
        }

        await this.assertOnlyManagedAdminApiKey({
          manager,
          workspaceId,
          adminRoleId: adminRole.id,
          managedApiKey: lockedApiKey,
          managedRoleTarget: apiKeyRoleTarget,
        });

        const userRoleTarget = await manager.findOne(RoleTargetEntity, {
          where: {
            workspaceId,
            userWorkspaceId: targetUserWorkspace.id,
          },
          lock: { mode: 'pessimistic_write' },
        });

        if (!userRoleTarget) {
          this.refuse();
        }

        if (userRoleTarget.roleId === memberRoleId) {
          await this.assertHumanAdminInvariant({
            manager,
            workspaceId,
            adminRoleId: adminRole.id,
            targetRoleTarget: userRoleTarget,
            targetUserWorkspace: lockedUserWorkspace,
            targetUser: lockedUser,
            targetAlreadyMember: true,
          });
          this.assertActiveApiKey(lockedApiKey);
          await this.flushRoleCaches(workspaceId);
          this.assertActiveApiKey(lockedApiKey);

          return true;
        }

        if (userRoleTarget.roleId !== adminRole.id) {
          this.refuse();
        }

        await this.assertHumanAdminInvariant({
          manager,
          workspaceId,
          adminRoleId: adminRole.id,
          targetRoleTarget: userRoleTarget,
          targetUserWorkspace: lockedUserWorkspace,
          targetUser: lockedUser,
        });

        // Time can advance while the locked invariants are inspected. Check the
        // managed credential at the last possible points before update/commit.
        this.assertActiveApiKey(lockedApiKey);

        const updateResult = await manager.update(
          RoleTargetEntity,
          {
            id: userRoleTarget.id,
            workspaceId,
            userWorkspaceId: targetUserWorkspace.id,
          },
          { roleId: memberRoleId },
        );

        if (updateResult.affected !== 1) {
          this.refuse();
        }

        // Evict the old Admin mapping before commit. A cache failure therefore
        // aborts the database transaction instead of committing stale privilege.
        await this.flushRoleCaches(workspaceId);
        this.assertActiveApiKey(lockedApiKey);

        return false;
      },
    );

    try {
      await this.workspaceCacheService.invalidateAndRecompute(workspaceId, [
        ...ROLE_CACHE_KEYS,
      ]);
    } catch (error) {
      // Pre-commit eviction already removed stale privilege. Evict once more in
      // case a concurrent read repopulated old data before the commit became
      // visible, then let the caller retry deterministic recomputation.
      await this.flushRoleCaches(workspaceId);
      throw error;
    }

    return { assigned: true, already };
  }

  private async assertOnlyManagedAdminApiKey({
    manager,
    workspaceId,
    adminRoleId,
    managedApiKey,
    managedRoleTarget,
  }: {
    manager: EntityManager;
    workspaceId: string;
    adminRoleId: string;
    managedApiKey: ApiKeyEntity;
    managedRoleTarget: RoleTargetEntity;
  }): Promise<void> {
    const candidates = await manager.find(RoleTargetEntity, {
      where: {
        workspaceId,
        roleId: adminRoleId,
        apiKeyId: Not(IsNull()),
      },
      order: { id: 'ASC' },
    });
    const activeAdminApiKeyIds = new Set<string>();

    for (const candidate of candidates) {
      const lockedTarget =
        candidate.id === managedRoleTarget.id
          ? managedRoleTarget
          : await manager.findOne(RoleTargetEntity, {
              where: { id: candidate.id, workspaceId, roleId: adminRoleId },
              lock: { mode: 'pessimistic_read' },
            });

      if (
        !lockedTarget ||
        lockedTarget.roleId !== adminRoleId ||
        !lockedTarget.apiKeyId
      ) {
        continue;
      }

      const lockedCandidateApiKey =
        lockedTarget.apiKeyId === managedApiKey.id
          ? managedApiKey
          : await manager.findOne(ApiKeyEntity, {
              where: { id: lockedTarget.apiKeyId, workspaceId },
              lock: { mode: 'pessimistic_read' },
            });

      if (lockedCandidateApiKey && this.isActiveApiKey(lockedCandidateApiKey)) {
        activeAdminApiKeyIds.add(lockedCandidateApiKey.id);
      }
    }

    if (
      activeAdminApiKeyIds.size !== 1 ||
      !activeAdminApiKeyIds.has(managedApiKey.id)
    ) {
      this.refuse();
    }
  }

  private async assertHumanAdminInvariant({
    manager,
    workspaceId,
    adminRoleId,
    targetRoleTarget,
    targetUserWorkspace,
    targetUser,
    targetAlreadyMember = false,
  }: {
    manager: EntityManager;
    workspaceId: string;
    adminRoleId: string;
    targetRoleTarget: RoleTargetEntity;
    targetUserWorkspace: UserWorkspaceEntity;
    targetUser: UserEntity;
    targetAlreadyMember?: boolean;
  }): Promise<void> {
    const candidates = await manager.find(RoleTargetEntity, {
      where: {
        workspaceId,
        roleId: adminRoleId,
        userWorkspaceId: Not(IsNull()),
      },
      order: { id: 'ASC' },
    });
    const activeHumanAdminTargetIds = new Set<string>();

    for (const candidate of candidates) {
      const lockedTarget =
        candidate.id === targetRoleTarget.id
          ? targetRoleTarget
          : await manager.findOne(RoleTargetEntity, {
              where: { id: candidate.id, workspaceId, roleId: adminRoleId },
              lock: { mode: 'pessimistic_read' },
            });

      if (
        !lockedTarget ||
        lockedTarget.roleId !== adminRoleId ||
        !lockedTarget.userWorkspaceId
      ) {
        continue;
      }

      const lockedCandidateUserWorkspace =
        lockedTarget.userWorkspaceId === targetUserWorkspace.id
          ? targetUserWorkspace
          : await manager.findOne(UserWorkspaceEntity, {
              where: { id: lockedTarget.userWorkspaceId, workspaceId },
              lock: { mode: 'pessimistic_read' },
            });

      if (
        !lockedCandidateUserWorkspace ||
        lockedCandidateUserWorkspace.deletedAt
      ) {
        continue;
      }

      const lockedCandidateUser =
        lockedCandidateUserWorkspace.userId === targetUser.id
          ? targetUser
          : await manager.findOne(UserEntity, {
              where: { id: lockedCandidateUserWorkspace.userId },
              lock: { mode: 'pessimistic_read' },
            });

      if (
        lockedCandidateUser &&
        !lockedCandidateUser.deletedAt &&
        !lockedCandidateUser.disabled
      ) {
        activeHumanAdminTargetIds.add(lockedTarget.id);
      }
    }

    if (targetAlreadyMember) {
      if (activeHumanAdminTargetIds.size !== 0) {
        this.refuse();
      }

      return;
    }

    if (
      activeHumanAdminTargetIds.size !== 1 ||
      !activeHumanAdminTargetIds.has(targetRoleTarget.id)
    ) {
      this.refuse();
    }
  }

  private isActiveApiKey(apiKey: ApiKeyEntity): boolean {
    return !apiKey.revokedAt && apiKey.expiresAt.getTime() > Date.now();
  }

  private assertActiveApiKey(
    apiKey: ApiKeyEntity | null,
  ): asserts apiKey is ApiKeyEntity {
    if (!apiKey || !this.isActiveApiKey(apiKey)) {
      this.refuse();
    }
  }

  private async flushRoleCaches(workspaceId: string): Promise<void> {
    await this.workspaceCacheService.flush(workspaceId, [...ROLE_CACHE_KEYS]);
  }

  private refuse(): never {
    throw new ForbiddenException('Managed role assignment refused');
  }
}
