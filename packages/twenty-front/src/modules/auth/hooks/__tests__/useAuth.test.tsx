import { useAuth } from '@/auth/hooks/useAuth';

import { MockedProvider } from '@apollo/client/testing/react';
import { type ReactNode, act } from 'react';
import { MemoryRouter } from 'react-router-dom';

import {
  email,
  mocks,
  password,
  results,
  token,
} from '@/auth/hooks/__mocks__/useAuth';
import {
  type CurrentUser,
  currentUserState,
} from '@/auth/states/currentUserState';
import {
  SignInUpStep,
  signInUpStepState,
} from '@/auth/states/signInUpStepState';
import {
  type CurrentWorkspace,
  currentWorkspaceState,
} from '@/auth/states/currentWorkspaceState';
import { returnToPathState } from '@/auth/states/returnToPathState';
import { isMultiWorkspaceEnabledState } from '@/client-config/states/isMultiWorkspaceEnabledState';
import { SnackBarComponentInstanceContext } from '@/ui/feedback/snack-bar-manager/contexts/SnackBarComponentInstanceContext';
import { renderHook } from '@testing-library/react';
import { getDefaultStore } from 'jotai';
import { AppPath } from 'twenty-shared/types';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import {
  type AvailableWorkspaces,
  GetWorkspaceCreationDefaultsDocument,
} from '~/generated-metadata/graphql';

const redirectSpy = jest.fn();
const redirectToWorkspaceDomainSpy = jest.fn();
const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const getPendingProvisioningMarkerKey = (userId: string) =>
  `anansiPendingProvisioningWorkspaceState:${userId}`;
const PENDING_PROVISIONING_MARKER_KEY =
  getPendingProvisioningMarkerKey(USER_ID);
const WORKSPACE_URL = 'https://friend.twenty.com';
const AVAILABLE_WORKSPACES: AvailableWorkspaces = {
  availableWorkspacesForSignIn: [
    {
      id: 'workspace-id',
      loginToken: 'workspace-login-token',
      workspaceUrls: { subdomainUrl: WORKSPACE_URL, customUrl: null },
      sso: [],
    },
  ],
  availableWorkspacesForSignUp: [],
};

jest.mock('@/domain-manager/hooks/useRedirect', () => ({
  useRedirect: jest.fn().mockImplementation(() => ({
    redirect: redirectSpy,
  })),
}));

jest.mock('@/domain-manager/hooks/useOrigin', () => ({
  useOrigin: jest.fn().mockImplementation(() => ({
    origin: 'http://localhost',
  })),
}));

jest.mock('@/captcha/hooks/useRequestFreshCaptchaToken', () => ({
  useRequestFreshCaptchaToken: jest.fn().mockImplementation(() => ({
    requestFreshCaptchaToken: jest.fn(),
  })),
}));

jest.mock('@/auth/sign-in-up/hooks/useSignUpInNewWorkspace', () => ({
  useSignUpInNewWorkspace: jest.fn().mockImplementation(() => ({
    createWorkspace: jest.fn(),
  })),
}));

jest.mock('@/domain-manager/hooks/useRedirectToWorkspaceDomain', () => ({
  useRedirectToWorkspaceDomain: jest.fn().mockImplementation(() => ({
    redirectToWorkspaceDomain: redirectToWorkspaceDomainSpy,
  })),
}));

jest.mock('@/domain-manager/hooks/useIsCurrentLocationOnAWorkspace', () => ({
  useIsCurrentLocationOnAWorkspace: jest.fn().mockImplementation(() => ({
    isOnAWorkspace: true,
  })),
}));

jest.mock('@/domain-manager/hooks/useLastAuthenticatedWorkspaceDomain', () => ({
  useLastAuthenticatedWorkspaceDomain: jest.fn().mockImplementation(() => ({
    setLastAuthenticateWorkspaceDomain: jest.fn(),
  })),
}));

const workspaceCreationDefaultsMock = {
  request: { query: GetWorkspaceCreationDefaultsDocument },
  result: {
    data: {
      getWorkspaceCreationDefaults: {
        __typename: 'WorkspaceCreationDefaultsDTO',
        displayName: 'Friend',
        subdomain: 'friend',
      },
    },
  },
};

const Wrapper = ({ children }: { children: ReactNode }) => (
  <MockedProvider
    mocks={[...Object.values(mocks), workspaceCreationDefaultsMock]}
  >
    <MemoryRouter>
      <SnackBarComponentInstanceContext.Provider
        value={{ instanceId: 'test-instance-id' }}
      >
        {children}
      </SnackBarComponentInstanceContext.Provider>
    </MemoryRouter>
  </MockedProvider>
);

const renderHooks = () => {
  const { result } = renderHook(
    () => {
      return useAuth();
    },
    {
      wrapper: Wrapper,
    },
  );
  return { result };
};

describe('useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.removeItem(PENDING_PROVISIONING_MARKER_KEY);
    localStorage.removeItem(getPendingProvisioningMarkerKey(OTHER_USER_ID));
    getDefaultStore().set(isMultiWorkspaceEnabledState.atom, true);
    getDefaultStore().set(returnToPathState.atom, '');
    getDefaultStore().set(signInUpStepState.atom, SignInUpStep.Init);
  });

  it('resumes provisioning by server-issued identity despite an unrelated new membership', async () => {
    localStorage.setItem(
      PENDING_PROVISIONING_MARKER_KEY,
      JSON.stringify({
        anansiWorkspaceCreationIdentity: USER_ID,
        email,
      }),
    );
    const { result } = renderHooks();

    await act(async () => {
      await result.current.navigateAfterMultiWorkspaceSignInUp(
        AVAILABLE_WORKSPACES,
        email,
        USER_ID,
      );
    });

    expect(getDefaultStore().get(signInUpStepState.atom)).toBe(
      SignInUpStep.WorkspaceCreation,
    );
    expect(redirectToWorkspaceDomainSpy).not.toHaveBeenCalled();
  });

  it('stores the server-issued identity before entering workspace creation', async () => {
    const { result } = renderHooks();
    const noAvailableWorkspaces: AvailableWorkspaces = {
      availableWorkspacesForSignIn: [],
      availableWorkspacesForSignUp: [],
    };

    await act(async () => {
      await result.current.navigateAfterMultiWorkspaceSignInUp(
        noAvailableWorkspaces,
        email,
        USER_ID,
      );
    });

    expect(
      JSON.parse(localStorage.getItem(PENDING_PROVISIONING_MARKER_KEY)!),
    ).toEqual({
      anansiWorkspaceCreationIdentity: USER_ID,
      email,
    });
    expect(getDefaultStore().get(signInUpStepState.atom)).toBe(
      SignInUpStep.WorkspaceCreation,
    );
  });

  it('does not store an Anansi intent for the existing-user workspace form', async () => {
    window.history.pushState({}, '', '/?action=create-new-workspace');
    const { result } = renderHooks();

    try {
      await act(async () => {
        await result.current.navigateAfterMultiWorkspaceSignInUp(
          AVAILABLE_WORKSPACES,
          email,
          USER_ID,
        );
      });

      expect(localStorage.getItem(PENDING_PROVISIONING_MARKER_KEY)).toBeNull();
      expect(getDefaultStore().get(signInUpStepState.atom)).toBe(
        SignInUpStep.WorkspaceCreation,
      );
    } finally {
      window.history.pushState({}, '', '/');
    }
  });

  it('fails closed when creation intent cannot be stored', async () => {
    const setItemSpy = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('storage unavailable', 'QuotaExceededError');
      });
    const { result } = renderHooks();
    const noAvailableWorkspaces: AvailableWorkspaces = {
      availableWorkspacesForSignIn: [],
      availableWorkspacesForSignUp: [],
    };

    try {
      await expect(
        result.current.navigateAfterMultiWorkspaceSignInUp(
          noAvailableWorkspaces,
          email,
          USER_ID,
        ),
      ).rejects.toThrow('Could not save workspace setup state');
      expect(getDefaultStore().get(signInUpStepState.atom)).not.toBe(
        SignInUpStep.WorkspaceCreation,
      );
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it('does not resume provisioning for another server-issued identity', async () => {
    localStorage.setItem(
      getPendingProvisioningMarkerKey(OTHER_USER_ID),
      JSON.stringify({
        anansiWorkspaceCreationIdentity: OTHER_USER_ID,
        email,
      }),
    );
    const { result } = renderHooks();

    await act(async () => {
      await result.current.navigateAfterMultiWorkspaceSignInUp(
        AVAILABLE_WORKSPACES,
        email,
        USER_ID,
      );
    });

    expect(redirectToWorkspaceDomainSpy).toHaveBeenCalledWith(
      WORKSPACE_URL,
      AppPath.Verify,
      { loginToken: 'workspace-login-token', email },
    );
    expect(
      localStorage.getItem(getPendingProvisioningMarkerKey(OTHER_USER_ID)),
    ).not.toBeNull();
    expect(getDefaultStore().get(signInUpStepState.atom)).not.toBe(
      SignInUpStep.WorkspaceCreation,
    );
  });

  it('ignores Anansi recovery markers when multi-workspace mode is disabled', async () => {
    localStorage.setItem(
      PENDING_PROVISIONING_MARKER_KEY,
      JSON.stringify({
        anansiWorkspaceCreationIdentity: USER_ID,
        email,
      }),
    );
    getDefaultStore().set(isMultiWorkspaceEnabledState.atom, false);
    const { result } = renderHooks();

    await act(async () => {
      await result.current.navigateAfterMultiWorkspaceSignInUp(
        AVAILABLE_WORKSPACES,
        email,
        USER_ID,
      );
    });

    expect(redirectToWorkspaceDomainSpy).toHaveBeenCalledWith(
      WORKSPACE_URL,
      AppPath.Verify,
      { loginToken: 'workspace-login-token', email },
    );
    expect(getDefaultStore().get(signInUpStepState.atom)).not.toBe(
      SignInUpStep.WorkspaceCreation,
    );
  });

  it('should return login token object', async () => {
    const { result } = renderHooks();

    await act(async () => {
      expect(
        await result.current.getLoginTokenFromCredentials(email, password),
      ).toStrictEqual(results.getLoginTokenFromCredentials);
    });

    expect(mocks.getLoginTokenFromCredentials.result).toHaveBeenCalled();
  });

  it('should verify user', async () => {
    const { result } = renderHooks();

    await act(async () => {
      await result.current.getAuthTokensFromLoginToken(token);
    });

    expect(mocks.getAuthTokensFromLoginToken.result).toHaveBeenCalled();
    expect(mocks.getCurrentUser.result).toHaveBeenCalled();
  });

  it('should handle credential sign-in', async () => {
    const { result } = renderHooks();

    await act(async () => {
      await result.current.signInWithCredentialsInWorkspace(email, password);
    });

    expect(mocks.getLoginTokenFromCredentials.result).toHaveBeenCalled();
    expect(mocks.getAuthTokensFromLoginToken.result).toHaveBeenCalled();
  });

  it('should handle google sign-in', async () => {
    const { result } = renderHooks();

    await act(async () => {
      await result.current.signInWithGoogle({
        workspaceInviteHash: 'workspaceInviteHash',
        action: 'join-workspace',
      });
    });

    expect(redirectSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '/auth/google?workspaceInviteHash=workspaceInviteHash',
      ),
    );
  });

  it('should forward returnToPath to /auth/google when set in state', async () => {
    getDefaultStore().set(
      returnToPathState.atom,
      '/authorize?response_type=code&client_id=abc&state=xyz',
    );

    const { result } = renderHooks();

    await act(async () => {
      await result.current.signInWithGoogle({
        action: 'list-available-workspaces',
      });
    });

    const calledWithUrl = redirectSpy.mock.calls[0]?.[0] as string;
    const parsed = new URL(calledWithUrl);

    expect(parsed.pathname).toBe('/auth/google');
    expect(parsed.searchParams.get('action')).toBe('list-available-workspaces');
    expect(parsed.searchParams.get('returnToPath')).toBe(
      '/authorize?response_type=code&client_id=abc&state=xyz',
    );
  });

  it('should not forward an invalid (protocol-relative) returnToPath', async () => {
    getDefaultStore().set(returnToPathState.atom, '//evil.example.com');

    const { result } = renderHooks();

    await act(async () => {
      await result.current.signInWithGoogle({
        action: 'list-available-workspaces',
      });
    });

    const calledWithUrl = redirectSpy.mock.calls[0]?.[0] as string;
    const parsed = new URL(calledWithUrl);

    expect(parsed.searchParams.has('returnToPath')).toBe(false);
  });

  it('should handle sign-out', async () => {
    sessionStorage.setItem('lingering-key', 'should-be-cleared');
    getDefaultStore().set(currentWorkspaceState.atom, {
      id: 'workspace-id',
      activationStatus: WorkspaceActivationStatus.SUSPENDED,
    } as CurrentWorkspace);
    getDefaultStore().set(currentUserState.atom, {
      id: 'user-id',
    } as CurrentUser);

    const { result } = renderHooks();

    await act(async () => {
      result.current.signOut();
    });

    expect(sessionStorage.length).toBe(0);
    expect(getDefaultStore().get(currentWorkspaceState.atom)).toBeNull();
    expect(getDefaultStore().get(currentUserState.atom)).toBeNull();
  });

  it('should handle credential sign-up', async () => {
    const { result } = renderHooks();

    await act(async () => {
      await result.current.signUpWithCredentialsInWorkspace({
        email,
        password,
      });
    });

    expect(mocks.signUpInWorkspace.result).toHaveBeenCalled();
  });
});
