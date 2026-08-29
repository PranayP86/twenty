import { type FlatPageLayoutWidget } from 'src/engine/metadata-modules/flat-page-layout-widget/types/flat-page-layout-widget.type';
import { type PageLayoutWidgetDTO } from 'src/engine/metadata-modules/page-layout-widget/dtos/page-layout-widget.dto';
import { computePageLayoutWidgetStateFingerprint } from 'src/engine/metadata-modules/page-layout-widget/utils/compute-page-layout-widget-state-fingerprint.util';

export const fromFlatPageLayoutWidgetToPageLayoutWidgetDto = (
  flatPageLayoutWidget: FlatPageLayoutWidget,
): PageLayoutWidgetDTO => {
  const {
    createdAt,
    updatedAt,
    deletedAt,
    objectMetadataId,
    overrides,
    ...rest
  } = flatPageLayoutWidget;

  return {
    ...rest,
    ...(overrides ?? {}),
    overrides,
    isOverridden: false,
    objectMetadataId: objectMetadataId ?? undefined,
    createdAt: new Date(createdAt),
    updatedAt: new Date(updatedAt),
    stateFingerprint:
      computePageLayoutWidgetStateFingerprint(flatPageLayoutWidget),
    deletedAt: deletedAt ? new Date(deletedAt) : undefined,
  };
};
