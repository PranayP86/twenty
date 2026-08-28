import { render, waitFor } from '@testing-library/react';
import { Provider as JotaiProvider, createStore } from 'jotai';

import { isMultiWorkspaceEnabledState } from '@/client-config/states/isMultiWorkspaceEnabledState';
import { lastAuthenticatedWorkspaceDomainState } from '@/domain-manager/states/lastAuthenticatedWorkspaceDomainState';
import { WorkspaceProviderEffect } from '@/workspace/components/WorkspaceProviderEffect';

const mockRedirectToWorkspaceDomain = jest.fn();
const mockInitializeQueryParamState = jest.fn();
let mockPublicWorkspaceData:
  | {
      workspaceUrls: {
        subdomainUrl: string;
        customUrl: null;
      };
    }
  | undefined;

jest.mock('@/domain-manager/hooks/useGetPublicWorkspaceDataByDomain', () => ({
  useGetPublicWorkspaceDataByDomain: () => ({
    data: mockPublicWorkspaceData,
  }),
}));

jest.mock('@/domain-manager/hooks/useRedirectToWorkspaceDomain', () => ({
  useRedirectToWorkspaceDomain: () => ({
    redirectToWorkspaceDomain: mockRedirectToWorkspaceDomain,
  }),
}));

jest.mock('@/domain-manager/hooks/useIsCurrentLocationOnDefaultDomain', () => ({
  useIsCurrentLocationOnDefaultDomain: () => ({ isDefaultDomain: true }),
}));

jest.mock(
  '@/domain-manager/hooks/useReadWorkspaceUrlFromCurrentLocation',
  () => ({
    useReadWorkspaceUrlFromCurrentLocation: () => ({
      currentLocationHostname: 'app.anansi.work',
    }),
  }),
);

jest.mock('@/app/hooks/useInitializeQueryParamState', () => ({
  useInitializeQueryParamState: () => ({
    initializeQueryParamState: mockInitializeQueryParamState,
  }),
}));

describe('WorkspaceProviderEffect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPublicWorkspaceData = undefined;
    window.history.replaceState(
      null,
      '',
      '/sign-in-up#ssoExchangeToken=fresh-user-exchange',
    );
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('does not redirect an SSO exchange to the previous workspace', async () => {
    const store = createStore();
    store.set(isMultiWorkspaceEnabledState.atom, true);
    store.set(lastAuthenticatedWorkspaceDomainState.atom, {
      workspaceId: 'owner-workspace',
      workspaceUrl: 'https://pran.anansi.work',
    });

    render(
      <JotaiProvider store={store}>
        <WorkspaceProviderEffect />
      </JotaiProvider>,
    );

    await waitFor(() => {
      expect(mockRedirectToWorkspaceDomain).not.toHaveBeenCalled();
    });
    expect(mockInitializeQueryParamState).not.toHaveBeenCalled();
  });

  it('does not redirect an SSO exchange through public workspace data', async () => {
    mockPublicWorkspaceData = {
      workspaceUrls: {
        subdomainUrl: 'https://pran.anansi.work',
        customUrl: null,
      },
    };
    const store = createStore();
    store.set(isMultiWorkspaceEnabledState.atom, true);
    store.set(lastAuthenticatedWorkspaceDomainState.atom, null);

    render(
      <JotaiProvider store={store}>
        <WorkspaceProviderEffect />
      </JotaiProvider>,
    );

    await waitFor(() => {
      expect(mockRedirectToWorkspaceDomain).not.toHaveBeenCalled();
    });
  });
});
