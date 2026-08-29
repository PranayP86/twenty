import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type FlatApplication } from 'src/engine/core-modules/application/types/flat-application.type';
import { fromCreatePageLayoutTabInputToFlatPageLayoutTabToCreate } from 'src/engine/metadata-modules/flat-page-layout-tab/utils/from-create-page-layout-tab-input-to-flat-page-layout-tab-to-create.util';
import { fromCreatePageLayoutWidgetInputToFlatPageLayoutWidgetToCreate } from 'src/engine/metadata-modules/flat-page-layout-widget/utils/from-create-page-layout-widget-input-to-flat-page-layout-widget-to-create.util';
import { WidgetConfigurationType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-configuration-type.type';
import { WidgetType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-type.enum';

const workspaceId = '20202020-2020-4020-8020-202020202020';
const application = {
  id: '30303030-3030-4030-8030-303030303030',
  universalIdentifier: '40404040-4040-4040-8040-404040404040',
} as FlatApplication;

describe('page layout caller-selected create identifiers', () => {
  it('uses the supplied page layout tab identifier', () => {
    const pageLayoutId = '50505050-5050-4050-8050-505050505050';
    const requestedId = '60606060-6060-4060-8060-606060606060';
    const flatPageLayoutMaps = {
      ...createEmptyFlatEntityMaps(),
      universalIdentifierById: {
        [pageLayoutId]: '70707070-7070-4070-8070-707070707070',
      },
    };

    const tab = fromCreatePageLayoutTabInputToFlatPageLayoutTabToCreate({
      createPageLayoutTabInput: {
        id: requestedId,
        title: 'Overview',
        pageLayoutId,
      },
      workspaceId,
      flatApplication: application,
      flatPageLayoutMaps,
    });

    expect(tab.id).toBe(requestedId);
    expect(tab.universalIdentifier).toBe(requestedId);
  });

  it('uses the supplied page layout widget identifier', () => {
    const pageLayoutTabId = '80808080-8080-4080-8080-808080808080';
    const requestedId = '90909090-9090-4090-8090-909090909090';
    const flatPageLayoutTabMaps = {
      ...createEmptyFlatEntityMaps(),
      universalIdentifierById: {
        [pageLayoutTabId]: 'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0',
      },
    };

    const widget =
      fromCreatePageLayoutWidgetInputToFlatPageLayoutWidgetToCreate({
        createPageLayoutWidgetInput: {
          id: requestedId,
          pageLayoutTabId,
          title: 'Frame',
          type: WidgetType.IFRAME,
          objectMetadataId: null,
          gridPosition: { row: 0, column: 0, rowSpan: 4, columnSpan: 12 },
          configuration: {
            configurationType: WidgetConfigurationType.IFRAME,
            url: 'https://example.com',
          },
        },
        workspaceId,
        flatApplication: application,
        flatPageLayoutTabMaps,
        flatObjectMetadataMaps: createEmptyFlatEntityMaps(),
        flatFieldMetadataMaps: createEmptyFlatEntityMaps(),
        flatFrontComponentMaps: createEmptyFlatEntityMaps(),
        flatViewFieldGroupMaps: createEmptyFlatEntityMaps(),
        flatViewMaps: createEmptyFlatEntityMaps(),
      });

    expect(widget.id).toBe(requestedId);
    expect(widget.universalIdentifier).toBe(requestedId);
  });
});
