import { PageLayoutRecordPageRenderer } from '@/object-record/record-show/components/PageLayoutRecordPageRenderer';
import { render, screen } from '@testing-library/react';

jest.mock(
  '@/anansi-applications/components/AnansiApplicationRecordButton',
  () => ({
    AnansiApplicationRecordButton: ({
      objectNameSingular,
      recordId,
    }: {
      objectNameSingular: string;
      recordId: string;
    }) => <button>{`Fill ${objectNameSingular} ${recordId}`}</button>,
  }),
);
jest.mock('@/anansi-agent/components/AnansiAgentRecordButton', () => ({
  AnansiAgentRecordButton: () => <button>Ask Anansi</button>,
}));
jest.mock(
  '@/command-menu-item/components/RecordPageSidePanelCommandMenu',
  () => ({ RecordPageSidePanelCommandMenu: () => <button>Options</button> }),
);
jest.mock(
  '@/command-menu-item/components/RecordPageSidePanelPinnedCommandMenuItems',
  () => ({ RecordPageSidePanelPinnedCommandMenuItems: () => null }),
);
jest.mock(
  '@/information-banner/components/deleted-record/InformationBannerDeletedRecord',
  () => ({ InformationBannerDeletedRecord: () => null }),
);
jest.mock(
  '@/object-record/record-show/components/RecordShowContainerContextStoreTargetedRecordsEffect',
  () => ({ RecordShowContainerContextStoreTargetedRecordsEffect: () => null }),
);
jest.mock('@/object-record/record-show/components/RecordShowEffect', () => ({
  RecordShowEffect: () => null,
}));
jest.mock('@/page-layout/components/PageLayoutRenderer', () => ({
  PageLayoutRenderer: () => null,
}));
jest.mock('@/page-layout/hooks/usePageLayoutIdForRecord', () => ({
  usePageLayoutIdForRecord: () => ({ pageLayoutId: undefined }),
}));
jest.mock('@/ui/layout/contexts/LayoutRenderingContext', () => ({
  LayoutRenderingProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock('@/ui/layout/side-panel/components/SidePanelFooter', () => ({
  SidePanelFooter: ({ actions }: { actions: React.ReactNode[] }) => (
    <footer>{actions}</footer>
  ),
}));
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue',
  () => ({ useAtomFamilySelectorValue: () => null }),
);
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => [],
}));

describe('PageLayoutRecordPageRenderer Anansi application action', () => {
  it('passes exact side-panel record identity to application action', () => {
    render(
      <PageLayoutRecordPageRenderer
        targetRecordIdentifier={{
          id: 'record-1',
          targetObjectNameSingular: 'jobPosting',
        }}
        isInSidePanel
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Fill jobPosting record-1' }),
    ).toBeInTheDocument();
  });
});
