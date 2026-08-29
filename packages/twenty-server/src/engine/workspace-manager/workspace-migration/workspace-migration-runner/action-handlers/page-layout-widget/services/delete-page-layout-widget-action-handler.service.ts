import { Injectable } from '@nestjs/common';

import { WorkspaceMigrationRunnerActionHandler } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/interfaces/workspace-migration-runner-action-handler-service.interface';

import { PageLayoutWidgetEntity } from 'src/engine/metadata-modules/page-layout-widget/entities/page-layout-widget.entity';
import {
  PageLayoutWidgetException,
  PageLayoutWidgetExceptionCode,
} from 'src/engine/metadata-modules/page-layout-widget/exceptions/page-layout-widget.exception';
import { computePageLayoutWidgetStateFingerprint } from 'src/engine/metadata-modules/page-layout-widget/utils/compute-page-layout-widget-state-fingerprint.util';
import {
  FlatDeletePageLayoutWidgetAction,
  UniversalDeletePageLayoutWidgetAction,
} from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/builders/page-layout-widget/types/workspace-migration-page-layout-widget-action.type';
import {
  WorkspaceMigrationActionRunnerArgs,
  WorkspaceMigrationActionRunnerContext,
} from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/types/workspace-migration-action-runner-args.type';

@Injectable()
export class DeletePageLayoutWidgetActionHandlerService extends WorkspaceMigrationRunnerActionHandler(
  'delete',
  'pageLayoutWidget',
) {
  constructor() {
    super();
  }

  override async transpileUniversalActionToFlatAction(
    context: WorkspaceMigrationActionRunnerArgs<UniversalDeletePageLayoutWidgetAction>,
  ): Promise<FlatDeletePageLayoutWidgetAction> {
    return {
      ...this.transpileUniversalDeleteActionToFlatDeleteAction(context),
      expectedStateFingerprint: context.action.expectedStateFingerprint,
    };
  }

  async executeForMetadata(
    context: WorkspaceMigrationActionRunnerContext<FlatDeletePageLayoutWidgetAction>,
  ): Promise<void> {
    const { flatAction, queryRunner } = context;

    const pageLayoutWidgetRepository =
      queryRunner.manager.getRepository<PageLayoutWidgetEntity>(
        PageLayoutWidgetEntity,
      );

    if (flatAction.expectedStateFingerprint !== undefined) {
      const currentWidget = await pageLayoutWidgetRepository.findOne({
        where: { id: flatAction.entityId },
        lock: { mode: 'pessimistic_write' },
      });

      if (
        currentWidget === null ||
        computePageLayoutWidgetStateFingerprint(currentWidget) !==
          flatAction.expectedStateFingerprint
      ) {
        throw new PageLayoutWidgetException(
          'Page layout widget changed before deletion',
          PageLayoutWidgetExceptionCode.INVALID_PAGE_LAYOUT_WIDGET_DATA,
        );
      }
    }

    await pageLayoutWidgetRepository.delete({ id: flatAction.entityId });
  }

  async executeForWorkspaceSchema(
    _context: WorkspaceMigrationActionRunnerContext<FlatDeletePageLayoutWidgetAction>,
  ): Promise<void> {
    return;
  }
}
