import { AnansiAgentRecordButton } from '@/anansi-agent/components/AnansiAgentRecordButton';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { recordStoreFamilySelector } from '@/object-record/record-store/states/selectors/recordStoreFamilySelector';
import { recordStoreIdentifierFamilySelector } from '@/object-record/record-store/states/selectors/recordStoreIdentifierFamilySelector';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { fireEvent, render, screen } from '@testing-library/react';
import { useSetAtom } from 'jotai';

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue');
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue');
jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useSetAtom: jest.fn(),
}));

const mockedSelector = jest.mocked(useAtomFamilySelectorValue);
const mockedStateValue = jest.mocked(useAtomStateValue);
const mockedSetState = jest.mocked(useSetAtom);

describe('AnansiAgentRecordButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedStateValue.mockImplementation((state) => {
      if (state === currentUserState) {
        return { id: 'user-1' };
      }
      if (state === currentWorkspaceState) {
        return { id: 'workspace-1' };
      }
      return null;
    });
  });

  it('opens an immutable custom-record context using exact anansiId', () => {
    const setDockState = jest.fn();
    mockedSetState.mockReturnValue(setDockState);
    mockedSelector.mockImplementation((selector) => {
      if (selector === recordStoreFamilySelector) {
        return '11111111-1111-4111-8111-111111111111';
      }
      if (selector === recordStoreIdentifierFamilySelector) {
        return { id: 'record-id', name: 'Acme SRE' };
      }
      return null;
    });

    render(
      <AnansiAgentRecordButton
        objectNameSingular="engagement"
        recordId="22222222-2222-4222-8222-222222222222"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ask Anansi/ }));

    const update = setDockState.mock.calls[0][0];
    expect(
      update({
        ownerKey: null,
        tabs: [],
        activeKey: null,
        isMinimized: true,
      }),
    ).toEqual({
      ownerKey: 'user-1:workspace-1',
      tabs: [
        {
          key: 'engagement:11111111-1111-4111-8111-111111111111',
          contextType: 'engagement',
          contextId: '11111111-1111-4111-8111-111111111111',
          objectNameSingular: 'engagement',
          recordId: '22222222-2222-4222-8222-222222222222',
          title: 'Acme SRE',
        },
      ],
      activeKey: 'engagement:11111111-1111-4111-8111-111111111111',
      isMinimized: false,
    });
  });

  it('does not expose Ask Anansi on an ordinary Twenty Task', () => {
    mockedSetState.mockReturnValue(jest.fn());
    mockedSelector.mockImplementation((selector, parameters) => {
      if (selector === recordStoreIdentifierFamilySelector) {
        return { id: 'record-id', name: 'Call recruiter' };
      }
      if (
        selector === recordStoreFamilySelector &&
        (parameters as { fieldName?: string }).fieldName === 'bodyV2'
      ) {
        return { markdown: 'Call the recruiter tomorrow.' };
      }
      return null;
    });

    const { container } = render(
      <AnansiAgentRecordButton
        objectNameSingular="task"
        recordId="22222222-2222-4222-8222-222222222222"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('fails closed for an unsupported record', () => {
    mockedSetState.mockReturnValue(jest.fn());
    mockedSelector.mockReturnValue(null);

    const { container } = render(
      <AnansiAgentRecordButton
        objectNameSingular="usage"
        recordId="22222222-2222-4222-8222-222222222222"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
