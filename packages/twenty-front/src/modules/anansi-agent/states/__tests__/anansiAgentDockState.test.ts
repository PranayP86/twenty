import {
  closeAnansiAgentTab,
  openAnansiAgentTab,
  type AnansiAgentDockState,
} from '@/anansi-agent/states/anansiAgentDockState';
import { type AnansiAgentContext } from '@/anansi-agent/utils/resolveAnansiAgentContext';

const FIRST: AnansiAgentContext = {
  key: 'engagement:11111111-1111-4111-8111-111111111111',
  contextType: 'engagement',
  contextId: '11111111-1111-4111-8111-111111111111',
  objectNameSingular: 'engagement',
  recordId: '22222222-2222-4222-8222-222222222222',
  title: 'Acme SRE',
};

const SECOND: AnansiAgentContext = {
  key: 'approval:33333333-3333-4333-8333-333333333333',
  contextType: 'approval',
  contextId: '33333333-3333-4333-8333-333333333333',
  objectNameSingular: 'task',
  recordId: '33333333-3333-4333-8333-333333333333',
  title: 'Review reply',
};

const EMPTY: AnansiAgentDockState = {
  ownerKey: null,
  tabs: [],
  activeKey: null,
  isMinimized: false,
};

describe('anansiAgentDockState', () => {
  it('opens stacked tabs and activates the requested immutable context', () => {
    const firstState = openAnansiAgentTab(EMPTY, FIRST, 'user-1:workspace-1');
    const minimizedState = { ...firstState, isMinimized: true };
    const stackedState = openAnansiAgentTab(
      minimizedState,
      SECOND,
      'user-1:workspace-1',
    );
    const replayedState = openAnansiAgentTab(
      stackedState,
      {
        ...FIRST,
        contextId: '44444444-4444-4444-8444-444444444444',
        title: 'Changed navigation target',
      },
      'user-1:workspace-1',
    );

    expect(stackedState).toEqual({
      ownerKey: 'user-1:workspace-1',
      tabs: [FIRST, SECOND],
      activeKey: SECOND.key,
      isMinimized: false,
    });
    expect(replayedState.tabs).toEqual([FIRST, SECOND]);
    expect(replayedState.activeKey).toBe(FIRST.key);
  });

  it('drops prior tabs before opening for a different stable owner', () => {
    const firstOwnerState = openAnansiAgentTab(
      EMPTY,
      FIRST,
      'user-1:workspace-1',
    );

    expect(
      openAnansiAgentTab(firstOwnerState, SECOND, 'user-2:workspace-1'),
    ).toEqual({
      ownerKey: 'user-2:workspace-1',
      tabs: [SECOND],
      activeKey: SECOND.key,
      isMinimized: false,
    });
  });

  it('activates an adjacent tab when the current tab closes', () => {
    const stackedState = openAnansiAgentTab(
      openAnansiAgentTab(EMPTY, FIRST, 'user-1:workspace-1'),
      SECOND,
      'user-1:workspace-1',
    );

    expect(closeAnansiAgentTab(stackedState, SECOND.key)).toEqual({
      ownerKey: 'user-1:workspace-1',
      tabs: [FIRST],
      activeKey: FIRST.key,
      isMinimized: false,
    });
    expect(closeAnansiAgentTab(stackedState, FIRST.key)).toEqual({
      ownerKey: 'user-1:workspace-1',
      tabs: [SECOND],
      activeKey: SECOND.key,
      isMinimized: false,
    });
  });
});
