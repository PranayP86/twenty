import { DeletePageLayoutWidgetActionHandlerService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/action-handlers/page-layout-widget/services/delete-page-layout-widget-action-handler.service';
import { computePageLayoutWidgetStateFingerprint } from 'src/engine/metadata-modules/page-layout-widget/utils/compute-page-layout-widget-state-fingerprint.util';

describe('DeletePageLayoutWidgetActionHandlerService', () => {
  const widget = {
    id: '1107a7cb-8d86-4f98-8946-54f3074b9587',
    universalIdentifier: '8cd60f5a-e796-4b75-92ec-4e4527e6e07a',
    workspaceId: '0888762e-c72a-4d63-bc0f-ea406fb91963',
    applicationId: 'a9fd19b3-e1bf-4d52-87ca-c783311da44f',
    pageLayoutTabId: '21365d4b-97d8-4d28-b455-1f890b178cfe',
    title: 'Needs you',
    type: 'RECORD_TABLE',
    objectMetadataId: 'e216e634-bc60-4be1-b49e-08d8b11b7caf',
    conditionalDisplay: null,
    conditionalAvailabilityExpression: null,
    gridPosition: { row: 0, column: 0, rowSpan: 4, columnSpan: 12 },
    position: {
      layoutMode: 'GRID',
      row: 0,
      column: 0,
      rowSpan: 4,
      columnSpan: 12,
    },
    configuration: {
      configurationType: 'RECORD_TABLE',
      viewId: '9ae6213f-4853-4ad8-8382-a19a7b0af3d6',
      recordLimit: 10,
    },
    isSystemSideEffect: false,
    overrides: null,
    createdAt: new Date('2026-08-27T17:00:00.123Z'),
    updatedAt: new Date('2026-08-27T18:00:00.123Z'),
    deletedAt: null,
  };

  const makeContext = ({
    expectedStateFingerprint,
    currentWidget = widget,
  }: {
    expectedStateFingerprint?: string;
    currentWidget?: typeof widget | null;
  }) => {
    const repository = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn().mockResolvedValue(currentWidget),
    };
    const context = {
      flatAction: {
        type: 'delete',
        metadataName: 'pageLayoutWidget',
        entityId: widget.id,
        expectedStateFingerprint,
      },
      queryRunner: {
        manager: { getRepository: jest.fn().mockReturnValue(repository) },
      },
    };

    return { context, repository };
  };

  it('locks and deletes only when the stored state still matches', async () => {
    const { context, repository } = makeContext({
      expectedStateFingerprint: computePageLayoutWidgetStateFingerprint(widget),
    });
    const service = new DeletePageLayoutWidgetActionHandlerService();

    await service.executeForMetadata(context as never);

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: widget.id },
      lock: { mode: 'pessimistic_write' },
    });
    expect(repository.delete).toHaveBeenCalledWith({ id: widget.id });
  });

  it('preserves the widget when its stored state changed after the read', async () => {
    const { context, repository } = makeContext({
      expectedStateFingerprint: '0'.repeat(64),
    });
    const service = new DeletePageLayoutWidgetActionHandlerService();

    await expect(service.executeForMetadata(context as never)).rejects.toThrow(
      'Page layout widget changed before deletion',
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('keeps stock unconditional deletion when no fingerprint is supplied', async () => {
    const { context, repository } = makeContext({});
    const service = new DeletePageLayoutWidgetActionHandlerService();

    await service.executeForMetadata(context as never);

    expect(repository.findOne).not.toHaveBeenCalled();
    expect(repository.delete).toHaveBeenCalledWith({ id: widget.id });
  });

  it('carries the expected fingerprint into the flat delete action', async () => {
    const service = new DeletePageLayoutWidgetActionHandlerService();

    jest
      .spyOn(
        service as never,
        'transpileUniversalDeleteActionToFlatDeleteAction' as never,
      )
      .mockReturnValue({
        type: 'delete',
        metadataName: 'pageLayoutWidget',
        entityId: widget.id,
      } as never);

    const flatAction = await service.transpileUniversalActionToFlatAction({
      action: {
        type: 'delete',
        metadataName: 'pageLayoutWidget',
        universalIdentifier: widget.universalIdentifier,
        expectedStateFingerprint: 'a'.repeat(64),
      },
    } as never);

    expect(flatAction).toEqual({
      type: 'delete',
      metadataName: 'pageLayoutWidget',
      entityId: widget.id,
      expectedStateFingerprint: 'a'.repeat(64),
    });
  });
});
