import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { IsNull, Not, type DataSource, type EntityManager } from 'typeorm';

import { ApiKeyEntity } from 'src/engine/core-modules/api-key/api-key.entity';
import { lockAnansiApiKeyMutations } from 'src/engine/core-modules/api-key/services/anansi-api-key-mutation-lock';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { RoleTargetEntity } from 'src/engine/metadata-modules/role-target/role-target.entity';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

@Injectable()
export class AnansiApiKeyAdminSafetyService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async runWithWorkspaceMutationLock<T>(
    workspaceId: string,
    operation: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await lockAnansiApiKeyMutations(manager, workspaceId);

      const workspace = await manager.findOne(WorkspaceEntity, {
        where: { id: workspaceId },
      });

      if (!workspace || workspace.deletedAt) {
        this.refuse();
      }

      return operation(manager);
    });
  }

  async assertCanCreateApiKey({
    manager,
    workspaceId,
    roleId,
  }: {
    manager: EntityManager;
    workspaceId: string;
    roleId: string;
  }): Promise<void> {
    const role = await manager.findOne(RoleEntity, {
      where: { id: roleId, workspaceId },
      lock: { mode: 'pessimistic_read' },
    });

    if (!role) {
      this.refuse();
    }

    if (
      this.isCanonicalAdminRole(role) &&
      !(await this.hasActiveHumanAdmin(manager, workspaceId, role.id)) &&
      (await this.hasManagedAdminKey(manager, workspaceId))
    ) {
      this.refuse();
    }
  }

  async assertCanChangeApiKeyRole({
    manager,
    workspaceId,
    apiKey,
    role,
  }: {
    manager: EntityManager;
    workspaceId: string;
    apiKey: ApiKeyEntity;
    role: RoleEntity;
  }): Promise<void> {
    if (
      apiKey.workspaceId !== workspaceId ||
      role.workspaceId !== workspaceId
    ) {
      this.refuse();
    }

    const activeManagedApiKey =
      apiKey.name === this.managedApiKeyName(workspaceId) &&
      this.isActiveApiKey(apiKey);

    if (
      (activeManagedApiKey || this.isCanonicalAdminRole(role)) &&
      !(await this.hasActiveHumanAdminForWorkspace(manager, workspaceId)) &&
      (await this.hasManagedAdminKey(manager, workspaceId))
    ) {
      this.refuse();
    }
  }

  async assertCanUpdateApiKey({
    manager,
    workspaceId,
    apiKey,
  }: {
    manager: EntityManager;
    workspaceId: string;
    apiKey: ApiKeyEntity;
  }): Promise<void> {
    if (apiKey.workspaceId !== workspaceId) {
      this.refuse();
    }

    const activeManagedApiKey =
      apiKey.name === this.managedApiKeyName(workspaceId) &&
      this.isActiveApiKey(apiKey);
    const canonicalAdminApiKey = await this.isCanonicalAdminApiKey(
      manager,
      workspaceId,
      apiKey.id,
    );

    if (
      (activeManagedApiKey || canonicalAdminApiKey) &&
      !(await this.hasActiveHumanAdminForWorkspace(manager, workspaceId)) &&
      (await this.hasManagedAdminKey(manager, workspaceId))
    ) {
      this.refuse();
    }
  }

  private async hasManagedAdminKey(
    manager: EntityManager,
    workspaceId: string,
  ): Promise<boolean> {
    const expectedName = this.managedApiKeyName(workspaceId);
    const candidates = await manager.find(ApiKeyEntity, {
      where: { workspaceId, name: expectedName },
      order: { id: 'ASC' },
    });

    for (const candidate of candidates) {
      const apiKey = await manager.findOne(ApiKeyEntity, {
        where: { id: candidate.id, workspaceId, name: expectedName },
        lock: { mode: 'pessimistic_read' },
      });

      if (!apiKey || !this.isActiveApiKey(apiKey)) {
        continue;
      }

      const roleTargets = await manager.find(RoleTargetEntity, {
        where: { workspaceId, apiKeyId: apiKey.id },
        order: { id: 'ASC' },
      });

      for (const roleTarget of roleTargets) {
        const lockedTarget = await manager.findOne(RoleTargetEntity, {
          where: { id: roleTarget.id, workspaceId, apiKeyId: apiKey.id },
          lock: { mode: 'pessimistic_read' },
        });

        if (!lockedTarget) {
          continue;
        }

        const role = await manager.findOne(RoleEntity, {
          where: { id: lockedTarget.roleId, workspaceId },
          lock: { mode: 'pessimistic_read' },
        });

        if (role && this.isCanonicalAdminRole(role)) {
          return true;
        }
      }
    }

    return false;
  }

  private async isCanonicalAdminApiKey(
    manager: EntityManager,
    workspaceId: string,
    apiKeyId: string,
  ): Promise<boolean> {
    const candidates = await manager.find(RoleTargetEntity, {
      where: { workspaceId, apiKeyId },
      order: { id: 'ASC' },
    });

    for (const candidate of candidates) {
      const lockedTarget = await manager.findOne(RoleTargetEntity, {
        where: { id: candidate.id, workspaceId, apiKeyId },
        lock: { mode: 'pessimistic_read' },
      });

      if (!lockedTarget) {
        continue;
      }

      const role = await manager.findOne(RoleEntity, {
        where: { id: lockedTarget.roleId, workspaceId },
        lock: { mode: 'pessimistic_read' },
      });

      if (role && this.isCanonicalAdminRole(role)) {
        return true;
      }
    }

    return false;
  }

  private async hasActiveHumanAdminForWorkspace(
    manager: EntityManager,
    workspaceId: string,
  ): Promise<boolean> {
    const adminRoles = await manager.find(RoleEntity, {
      where: {
        workspaceId,
        label: 'Admin',
        universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
      },
      order: { id: 'ASC' },
    });

    if (adminRoles.length !== 1) {
      return false;
    }

    return this.hasActiveHumanAdmin(manager, workspaceId, adminRoles[0].id);
  }

  private async hasActiveHumanAdmin(
    manager: EntityManager,
    workspaceId: string,
    adminRoleId: string,
  ): Promise<boolean> {
    const candidates = await manager.find(RoleTargetEntity, {
      where: {
        workspaceId,
        roleId: adminRoleId,
        userWorkspaceId: Not(IsNull()),
      },
      order: { id: 'ASC' },
    });

    for (const candidate of candidates) {
      const lockedTarget = await manager.findOne(RoleTargetEntity, {
        where: { id: candidate.id, workspaceId, roleId: adminRoleId },
        lock: { mode: 'pessimistic_read' },
      });

      if (!lockedTarget?.userWorkspaceId) {
        continue;
      }

      const userWorkspace = await manager.findOne(UserWorkspaceEntity, {
        where: { id: lockedTarget.userWorkspaceId, workspaceId },
        lock: { mode: 'pessimistic_read' },
      });

      if (!userWorkspace || userWorkspace.deletedAt) {
        continue;
      }

      const user = await manager.findOne(UserEntity, {
        where: { id: userWorkspace.userId },
        lock: { mode: 'pessimistic_read' },
      });

      if (user && !user.deletedAt && !user.disabled) {
        return true;
      }
    }

    return false;
  }

  private isActiveApiKey(apiKey: ApiKeyEntity): boolean {
    return !apiKey.revokedAt && apiKey.expiresAt.getTime() > Date.now();
  }

  private isCanonicalAdminRole(role: RoleEntity): boolean {
    return (
      role.label === 'Admin' &&
      role.universalIdentifier === STANDARD_ROLE.admin.universalIdentifier
    );
  }

  private managedApiKeyName(workspaceId: string): string {
    return `Anansi Core (${workspaceId})`;
  }

  private refuse(): never {
    throw new ForbiddenException('Admin API-key mutation refused');
  }
}
