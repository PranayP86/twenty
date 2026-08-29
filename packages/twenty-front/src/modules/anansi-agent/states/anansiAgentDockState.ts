import { type AnansiAgentContext } from '@/anansi-agent/utils/resolveAnansiAgentContext';
import { atom } from 'jotai';

export type AnansiAgentDockState = {
  ownerKey: string | null;
  tabs: AnansiAgentContext[];
  activeKey: string | null;
  isMinimized: boolean;
};

export const emptyAnansiAgentDockState = (
  ownerKey: string | null = null,
): AnansiAgentDockState => ({
  ownerKey,
  tabs: [],
  activeKey: null,
  isMinimized: false,
});

export const anansiAgentDockState = atom<AnansiAgentDockState>(
  emptyAnansiAgentDockState(),
);
anansiAgentDockState.debugLabel = 'anansiAgentDockState';

export const openAnansiAgentTab = (
  state: AnansiAgentDockState,
  context: AnansiAgentContext,
  ownerKey: string,
): AnansiAgentDockState => {
  const ownerState =
    state.ownerKey === ownerKey ? state : emptyAnansiAgentDockState(ownerKey);

  return {
    ownerKey,
    tabs: ownerState.tabs.some((tab) => tab.key === context.key)
      ? ownerState.tabs
      : [...ownerState.tabs, context],
    activeKey: context.key,
    isMinimized: false,
  };
};

export const closeAnansiAgentTab = (
  state: AnansiAgentDockState,
  key: string,
): AnansiAgentDockState => {
  const closedIndex = state.tabs.findIndex((tab) => tab.key === key);
  if (closedIndex === -1) {
    return state;
  }

  const tabs = state.tabs.filter((tab) => tab.key !== key);
  const activeKey =
    state.activeKey !== key
      ? state.activeKey
      : (tabs[Math.min(closedIndex, tabs.length - 1)]?.key ?? null);

  return { ...state, tabs, activeKey };
};
