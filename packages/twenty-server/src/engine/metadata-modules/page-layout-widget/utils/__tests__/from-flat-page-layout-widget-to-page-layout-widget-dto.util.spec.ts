import { computePageLayoutWidgetStateFingerprint } from 'src/engine/metadata-modules/page-layout-widget/utils/compute-page-layout-widget-state-fingerprint.util';
import { fromFlatPageLayoutWidgetToPageLayoutWidgetDto } from 'src/engine/metadata-modules/page-layout-widget/utils/from-flat-page-layout-widget-to-page-layout-widget-dto.util';

describe('fromFlatPageLayoutWidgetToPageLayoutWidgetDto', () => {
  it('returns an opaque fingerprint for the exact stored widget state', () => {
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
      createdAt: '2026-08-27T17:00:00.123Z',
      updatedAt: '2026-08-27T18:00:00.123Z',
      deletedAt: null,
      isActive: true,
    };

    const dto = fromFlatPageLayoutWidgetToPageLayoutWidgetDto(widget as never);

    expect(dto.stateFingerprint).toBe(
      computePageLayoutWidgetStateFingerprint(widget),
    );
  });
});
