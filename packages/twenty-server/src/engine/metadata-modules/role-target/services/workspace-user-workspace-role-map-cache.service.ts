import { Injectable } from '@nestjs/common';

import { InjectDataSource } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { type DataSource, IsNull, Not } from 'typeorm';

import { WorkspaceCacheProvider } from 'src/engine/workspace-cache/interfaces/workspace-cache-provider.service';

import { RoleTargetEntity } from 'src/engine/metadata-modules/role-target/role-target.entity';
import { UserWorkspaceRoleMap } from 'src/engine/metadata-modules/role-target/types/user-workspace-role-map';
import { withAnansiRoleCacheReadFence } from 'src/engine/metadata-modules/role/services/anansi-role-cache-fence';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { WorkspaceCache } from 'src/engine/workspace-cache/decorators/workspace-cache.decorator';

@Injectable()
@WorkspaceCache('userWorkspaceRoleMap', { packingPonderation: 1 })
export class WorkspaceUserWorkspaceRoleMapCacheService extends WorkspaceCacheProvider<UserWorkspaceRoleMap> {
  constructor(
    @InjectWorkspaceScopedRepository(RoleTargetEntity)
    private readonly roleTargetRepository: WorkspaceScopedRepository<RoleTargetEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async computeForCache(workspaceId: string): Promise<UserWorkspaceRoleMap> {
    const roleTargetsMap = await this.roleTargetRepository.find(workspaceId, {
      where: {
        userWorkspaceId: Not(IsNull()),
      },
    });

    return roleTargetsMap.reduce((acc, roleTarget) => {
      if (isDefined(roleTarget.userWorkspaceId)) {
        acc[roleTarget.userWorkspaceId] = roleTarget.roleId;
      }

      return acc;
    }, {} as UserWorkspaceRoleMap);
  }

  withCachePublicationFence<TResult>(
    workspaceId: string,
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    return withAnansiRoleCacheReadFence(
      this.dataSource,
      workspaceId,
      operation,
    );
  }
}
