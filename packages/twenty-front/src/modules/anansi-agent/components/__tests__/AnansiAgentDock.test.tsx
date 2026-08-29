import { AnansiAgentDock } from '@/anansi-agent/components/AnansiAgentDock';
import { type AnansiAgentDockState } from '@/anansi-agent/states/anansiAgentDockState';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useAtomValue, useSetAtom } from 'jotai';

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue');
jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useAtomValue: jest.fn(),
  useSetAtom: jest.fn(),
}));
jest.mock('@/anansi-agent/components/AnansiAgentConversation', () => ({
  AnansiAgentConversation: ({ context }: { context: { title: string } }) => (
    <div>{`Conversation ${context.title}`}</div>
  ),
}));

const DOCK_STATE: AnansiAgentDockState = {
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
    {
      key: 'approval:33333333-3333-4333-8333-333333333333',
      contextType: 'approval',
      contextId: '33333333-3333-4333-8333-333333333333',
      objectNameSingular: 'task',
      recordId: '33333333-3333-4333-8333-333333333333',
      title: 'Review reply',
    },
  ],
  activeKey: 'approval:33333333-3333-4333-8333-333333333333',
  isMinimized: false,
};

const mockedTokenValue = jest.mocked(useAtomStateValue);
const mockedDockValue = jest.mocked(useAtomValue);
const mockedSetState = jest.mocked(useSetAtom);

describe('AnansiAgentDock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDockValue.mockReturnValue(DOCK_STATE);
    mockedTokenValue.mockImplementation((state) => {
      if (state === tokenPairState) {
        return {
          accessOrWorkspaceAgnosticToken: { token: 'access-token' },
        };
      }
      if (state === currentUserState) {
        return { id: 'user-1' };
      }
      if (state === currentWorkspaceState) {
        return { id: 'workspace-1' };
      }
      return null;
    });
  });

  it('keeps stacked context conversations mounted and shows the active tab', () => {
    mockedSetState.mockReturnValue(jest.fn());

    render(<AnansiAgentDock />);

    expect(screen.getByRole('tab', { name: 'Acme SRE' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Review reply' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Conversation Acme SRE')).not.toBeVisible();
    expect(screen.getByText('Conversation Review reply')).toBeVisible();
  });

  it('keeps conversations mounted while minimized', () => {
    mockedSetState.mockReturnValue(jest.fn());
    const { rerender } = render(<AnansiAgentDock />);

    mockedDockValue.mockReturnValue({ ...DOCK_STATE, isMinimized: true });
    rerender(<AnansiAgentDock />);

    expect(screen.getByText('Conversation Acme SRE')).toBeInTheDocument();
    expect(screen.getByText('Conversation Acme SRE')).not.toBeVisible();
    expect(screen.getByText('Conversation Review reply')).not.toBeVisible();
  });

  it('keeps close controls outside tab controls', () => {
    mockedSetState.mockReturnValue(jest.fn());

    render(<AnansiAgentDock />);

    expect(
      within(screen.getByRole('tab', { name: 'Acme SRE' })).queryByRole(
        'button',
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Close Acme SRE' }),
    ).toBeVisible();
  });

  it('hides and clears tabs when stable user or workspace identity changes', async () => {
    const setDockState = jest.fn();
    mockedSetState.mockReturnValue(setDockState);
    mockedTokenValue.mockImplementation((state) => {
      if (state === tokenPairState) {
        return {
          accessOrWorkspaceAgnosticToken: { token: 'access-token' },
        };
      }
      if (state === currentUserState) {
        return { id: 'user-2' };
      }
      if (state === currentWorkspaceState) {
        return { id: 'workspace-1' };
      }
      return null;
    });

    render(<AnansiAgentDock />);

    expect(screen.queryByText('Acme SRE')).not.toBeInTheDocument();
    await waitFor(() => expect(setDockState).toHaveBeenCalledTimes(1));
    const update = setDockState.mock.calls[0][0];
    expect(update(DOCK_STATE)).toEqual({
      ownerKey: 'user-2:workspace-1',
      tabs: [],
      activeKey: null,
      isMinimized: false,
    });
  });

  it('links tabs and panels and supports roving keyboard focus', () => {
    const setDockState = jest.fn();
    mockedSetState.mockReturnValue(setDockState);

    render(<AnansiAgentDock />);

    const firstTab = screen.getByRole('tab', { name: 'Acme SRE' });
    const activeTab = screen.getByRole('tab', { name: 'Review reply' });
    expect(firstTab).toHaveAttribute('tabindex', '-1');
    expect(activeTab).toHaveAttribute('tabindex', '0');
    expect(firstTab).toHaveAttribute('aria-controls');
    const panels = screen.getAllByRole('tabpanel', { hidden: true });
    expect(panels[0]).toHaveAttribute(
      'aria-labelledby',
      firstTab.getAttribute('id'),
    );
    expect(firstTab).toHaveAttribute('aria-controls', panels[0].id);

    fireEvent.keyDown(activeTab, { key: 'ArrowRight' });

    expect(firstTab).toHaveFocus();
    const update = setDockState.mock.calls[0][0];
    expect(update(DOCK_STATE)).toEqual({
      ...DOCK_STATE,
      activeKey: DOCK_STATE.tabs[0].key,
      isMinimized: false,
    });
  });

  it('returns close focus only to another Ask Anansi tab', async () => {
    const setDockState = jest.fn();
    mockedSetState.mockReturnValue(setDockState);

    render(
      <>
        <button type="button" role="tab" aria-selected="true">
          Unrelated Twenty tab
        </button>
        <AnansiAgentDock />
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close Review reply' }));

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Acme SRE' })).toHaveFocus(),
    );
    expect(
      screen.getByRole('tab', { name: 'Unrelated Twenty tab' }),
    ).not.toHaveFocus();
  });

  it('minimizes without closing tabs', () => {
    const setDockState = jest.fn();
    mockedSetState.mockReturnValue(setDockState);

    render(<AnansiAgentDock />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Minimize Ask Anansi' }),
    );

    const update = setDockState.mock.calls[0][0];
    expect(update(DOCK_STATE)).toEqual({ ...DOCK_STATE, isMinimized: true });
  });
});
