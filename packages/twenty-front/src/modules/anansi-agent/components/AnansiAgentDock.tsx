import { AnansiAgentConversation } from '@/anansi-agent/components/AnansiAgentConversation';
import {
  anansiAgentDockState,
  closeAnansiAgentTab,
  emptyAnansiAgentDockState,
} from '@/anansi-agent/states/anansiAgentDockState';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { styled } from '@linaria/react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import {
  IconChevronDown,
  IconChevronUp,
  IconSparkles,
  IconX,
} from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledDock = styled.aside`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-bottom: 0;
  border-radius: ${themeCssVariables.border.radius.lg}
    ${themeCssVariables.border.radius.lg} 0 0;
  bottom: 0;
  box-shadow: ${themeCssVariables.boxShadow.strong};
  display: flex;
  flex-direction: column;
  left: 50%;
  max-height: min(620px, calc(100vh - 72px));
  position: fixed;
  transform: translateX(-50%);
  width: min(760px, calc(100vw - 48px));
  z-index: 1000;
`;

const StyledHeader = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  min-height: 42px;
`;

const StyledBrand = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  flex: none;
  font-weight: ${themeCssVariables.font.weight.semiBold};
  gap: ${themeCssVariables.spacing[1]};
  padding: 0 ${themeCssVariables.spacing[3]};
`;

const StyledTabs = styled.div`
  display: flex;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
`;

const StyledTabContainer = styled.div<{ selected: boolean }>`
  align-items: center;
  background: ${({ selected }) =>
    selected
      ? themeCssVariables.background.secondary
      : themeCssVariables.background.primary};
  border-left: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex: none;
  max-width: 210px;
`;

const StyledTab = styled.button`
  align-items: center;
  background: transparent;
  border: 0;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  flex: 1;
  min-width: 0;
  padding: 0 0 0 ${themeCssVariables.spacing[2]};
`;

const StyledTabTitle = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledIconButton = styled.button`
  align-items: center;
  background: transparent;
  border: 0;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  display: flex;
  justify-content: center;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledPanel = styled.div`
  display: flex;
  min-height: 0;

  &[hidden] {
    display: none;
  }
`;

const anansiTabId = (key: string) =>
  `anansi-agent-tab-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

const anansiPanelId = (key: string) =>
  `anansi-agent-panel-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

export const AnansiAgentDock = () => {
  const dockState = useAtomValue(anansiAgentDockState);
  const setDockState = useSetAtom(anansiAgentDockState);
  const tokenPair = useAtomStateValue(tokenPairState);
  const currentUser = useAtomStateValue(currentUserState);
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const accessToken = tokenPair?.accessOrWorkspaceAgnosticToken.token;
  const ownerKey =
    currentUser?.id && currentWorkspace?.id
      ? `${currentUser.id}:${currentWorkspace.id}`
      : null;
  const ownsDock = ownerKey !== null && dockState.ownerKey === ownerKey;

  useEffect(() => {
    if (dockState.ownerKey !== ownerKey) {
      setDockState(() => emptyAnansiAgentDockState(ownerKey));
    }
  }, [dockState.ownerKey, ownerKey, setDockState]);

  if (!ownsDock || dockState.tabs.length === 0) {
    return null;
  }

  const activeKey = dockState.activeKey ?? dockState.tabs[0].key;
  const activateAndFocusTab = (index: number) => {
    const nextTab = dockState.tabs[index];
    setDockState((state) => ({
      ...state,
      activeKey: nextTab.key,
      isMinimized: false,
    }));
    document.getElementById(anansiTabId(nextTab.key))?.focus();
  };

  return (
    <StyledDock aria-label="Ask Anansi">
      <StyledHeader>
        <StyledBrand>
          <IconSparkles size={16} />
          Ask Anansi
        </StyledBrand>
        <StyledTabs role="tablist" aria-label="Ask Anansi contexts">
          {dockState.tabs.map((tab, index) => (
            <StyledTabContainer key={tab.key} selected={tab.key === activeKey}>
              <StyledTab
                id={anansiTabId(tab.key)}
                type="button"
                role="tab"
                aria-controls={anansiPanelId(tab.key)}
                aria-selected={tab.key === activeKey}
                tabIndex={tab.key === activeKey ? 0 : -1}
                onClick={() =>
                  setDockState((state) => ({
                    ...state,
                    activeKey: tab.key,
                    isMinimized: false,
                  }))
                }
                onKeyDown={(event) => {
                  let nextIndex: number | null = null;
                  if (event.key === 'ArrowRight') {
                    nextIndex = (index + 1) % dockState.tabs.length;
                  } else if (event.key === 'ArrowLeft') {
                    nextIndex =
                      (index - 1 + dockState.tabs.length) %
                      dockState.tabs.length;
                  } else if (event.key === 'Home') {
                    nextIndex = 0;
                  } else if (event.key === 'End') {
                    nextIndex = dockState.tabs.length - 1;
                  }
                  if (nextIndex !== null) {
                    event.preventDefault();
                    activateAndFocusTab(nextIndex);
                  }
                }}
              >
                <StyledTabTitle>{tab.title}</StyledTabTitle>
              </StyledTab>
              <StyledIconButton
                type="button"
                aria-label={`Close ${tab.title}`}
                onClick={() => {
                  const nextState = closeAnansiAgentTab(dockState, tab.key);
                  setDockState(nextState);
                  globalThis.setTimeout(() => {
                    if (nextState.activeKey) {
                      document
                        .getElementById(anansiTabId(nextState.activeKey))
                        ?.focus();
                    }
                  }, 0);
                }}
              >
                <IconX size={14} />
              </StyledIconButton>
            </StyledTabContainer>
          ))}
        </StyledTabs>
        <StyledIconButton
          type="button"
          aria-label={
            dockState.isMinimized ? 'Expand Ask Anansi' : 'Minimize Ask Anansi'
          }
          onClick={() =>
            setDockState((state) => ({
              ...state,
              isMinimized: !state.isMinimized,
            }))
          }
        >
          {dockState.isMinimized ? (
            <IconChevronUp size={16} />
          ) : (
            <IconChevronDown size={16} />
          )}
        </StyledIconButton>
      </StyledHeader>

      {dockState.tabs.map((tab) => (
        <StyledPanel
          id={anansiPanelId(tab.key)}
          key={tab.key}
          role="tabpanel"
          aria-labelledby={anansiTabId(tab.key)}
          hidden={dockState.isMinimized || tab.key !== activeKey}
        >
          <AnansiAgentConversation
            accessToken={accessToken}
            context={tab}
            sessionKey={ownerKey}
          />
        </StyledPanel>
      ))}
    </StyledDock>
  );
};
