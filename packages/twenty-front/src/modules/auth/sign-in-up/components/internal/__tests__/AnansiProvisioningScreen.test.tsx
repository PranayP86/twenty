import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { AppPath } from 'twenty-shared/types';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { AnansiProvisioningScreen } from '@/auth/sign-in-up/components/internal/AnansiProvisioningScreen';
import { currentUserState } from '@/auth/states/currentUserState';
import { isMultiWorkspaceEnabledState } from '@/client-config/states/isMultiWorkspaceEnabledState';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import {
  GetAuthTokensFromLoginTokenDocument,
  SignUpInNewWorkspaceDocument,
} from '~/generated-metadata/graphql';
import { dynamicActivate } from '~/utils/i18n/dynamicActivate';

// ANANSI PATCH (WS-B): AnansiProvisioningScreen calls these two mutations
// directly via useMutation (no wrapping custom hook), so they're mocked by
// document identity here — same pattern as
// settings/security/hooks/__tests__/useCreateSSOIdentityProvider.test.tsx.
const signUpInNewWorkspaceMock = jest.fn();
const getAuthTokensFromLoginTokenMock = jest.fn();

jest.mock('@apollo/client/react', () => ({
  ...jest.requireActual('@apollo/client/react'),
  useMutation: (document: unknown) => {
    if (document === SignUpInNewWorkspaceDocument) {
      return [signUpInNewWorkspaceMock];
    }
    if (document === GetAuthTokensFromLoginTokenDocument) {
      return [getAuthTokensFromLoginTokenMock];
    }
    return [jest.fn()];
  },
}));

// ANANSI PATCH (WS-B): same mock seam as
// auth/components/__tests__/VerifyEmail.test.tsx — navigation out of this
// screen goes through useRedirectToWorkspaceDomain, not react-router.
const redirectToWorkspaceDomainMock = jest.fn();

jest.mock('@/domain-manager/hooks/useRedirectToWorkspaceDomain', () => ({
  useRedirectToWorkspaceDomain: () => ({
    redirectToWorkspaceDomain: redirectToWorkspaceDomainMock,
  }),
}));

// ANANSI PATCH (WS-B): the component's silent auto-retry waits 2s between
// attempts; resolve instantly so specs don't need real timers — same
// pattern as sse-db-event/hooks/__tests__/useHandleSseClientConnectionRetry.test.ts.
jest.mock('~/utils/sleep', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
}));

dynamicActivate(SOURCE_LOCALE);

const mockUser = {
  id: 'fake-user-id',
  email: 'jane.doe@example.com',
  supportUserHash: null,
  canAccessFullAdminPanel: false,
  canImpersonate: false,
  onboardingStatus: null,
  previousOnboardingStatus: null,
  isWorkspaceCreator: false,
  userVars: {},
  firstName: 'Jane',
  lastName: 'Doe',
  hasPassword: true,
};

const WORKSPACE_URL = 'https://jane-doe.twenty.com';

const buildSignUpInNewWorkspaceResult = () => ({
  data: {
    signUpInNewWorkspace: {
      loginToken: { token: 'login-token' },
      workspace: {
        id: 'workspace-id',
        workspaceUrls: { subdomainUrl: WORKSPACE_URL, customUrl: null },
      },
    },
  },
});

const buildAuthTokensResult = () => ({
  data: {
    getAuthTokensFromLoginToken: {
      tokens: {
        accessOrWorkspaceAgnosticToken: {
          token: 'access-token',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
        refreshToken: {
          token: 'refresh-token',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
      },
    },
  },
});

// Mocks the browser fetch the component calls for /v1/provision, one
// resolved value per call in order (first call = initial attempt, second =
// the silent auto-retry, third = a manual "Try again" click).
const mockFetchResponses = (
  ...responses: Array<{ ok: boolean; status?: number }>
) => {
  const fetchMock = jest.fn();
  responses.forEach(({ ok, status }) => {
    fetchMock.mockResolvedValueOnce({
      ok,
      status: status ?? (ok ? 200 : 500),
    });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

const renderScreen = () =>
  render(
    <JotaiProvider store={jotaiStore}>
      <MemoryRouter>
        <ThemeProvider colorScheme="light">
          <I18nProvider i18n={i18n}>
            <AnansiProvisioningScreen />
          </I18nProvider>
        </ThemeProvider>
      </MemoryRouter>
    </JotaiProvider>,
  );

describe('AnansiProvisioningScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetJotaiStore();
    jotaiStore.set(currentUserState.atom, mockUser);
    jotaiStore.set(isMultiWorkspaceEnabledState.atom, true);

    signUpInNewWorkspaceMock.mockResolvedValue(
      buildSignUpInNewWorkspaceResult(),
    );
    getAuthTokensFromLoginTokenMock.mockResolvedValue(
      buildAuthTokensResult(),
    );
  });

  it('blocks entry and renders the provisionError card when provision fails twice', async () => {
    mockFetchResponses({ ok: false, status: 500 }, { ok: false, status: 500 });

    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByText("Couldn't finish setting up your workspace"),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(redirectToWorkspaceDomainMock).not.toHaveBeenCalled();
  });

  it('navigates with no card when the silent auto-retry succeeds after one failure', async () => {
    mockFetchResponses({ ok: false, status: 500 }, { ok: true });

    renderScreen();

    await waitFor(() => {
      expect(redirectToWorkspaceDomainMock).toHaveBeenCalledWith(
        WORKSPACE_URL,
        AppPath.Verify,
        { loginToken: 'login-token' },
        '_self',
      );
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByText("Couldn't finish setting up your workspace"),
    ).not.toBeInTheDocument();
  });

  it('re-calls provision only (not signup) on "Try again", and navigates once it succeeds', async () => {
    mockFetchResponses(
      { ok: false, status: 500 },
      { ok: false, status: 500 },
      { ok: true },
    );

    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Try again' }),
      ).toBeInTheDocument();
    });

    expect(signUpInNewWorkspaceMock).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });

    await waitFor(() => {
      expect(redirectToWorkspaceDomainMock).toHaveBeenCalledWith(
        WORKSPACE_URL,
        AppPath.Verify,
        { loginToken: 'login-token' },
        '_self',
      );
    });

    // The workspace already exists by this point (server-side idempotent);
    // retry must not re-run workspace creation.
    expect(signUpInNewWorkspaceMock).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
