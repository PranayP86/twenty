import { renderHook } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';

import { isAppEffectRedirectEnabledState } from '@/app/states/isAppEffectRedirectEnabledState';
import { useRedeemSSOExchangeToken } from '@/auth/hooks/useRedeemSSOExchangeToken';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { isPendingServerSignOutState } from '@/auth/states/isPendingServerSignOutState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { runServerSessionSignOut } from '@/auth/utils/runServerSessionSignOut';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';

const mockGetAuthTokensFromSSOExchangeToken = jest.fn();
const mockSignOutMutation = jest.fn();

jest.mock('@apollo/client/react', () => ({
  ...jest.requireActual('@apollo/client/react'),
  useMutation: (document: {
    definitions?: Array<{ name?: { value?: string } }>;
  }) => [
    document.definitions?.some(
      (definition) => definition.name?.value === 'SignOut',
    )
      ? mockSignOutMutation
      : mockGetAuthTokensFromSSOExchangeToken,
  ],
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: jest.fn(),
}));

const renderHooks = () => {
  const { result } = renderHook(() => useRedeemSSOExchangeToken(), {
    wrapper: ({ children }) => JotaiProvider({ store: jotaiStore, children }),
  });

  return { result };
};

const staleTokenPair = {
  accessOrWorkspaceAgnosticToken: {
    token: 'stale-access-token',
    expiresAt: '2020-01-01T00:00:00.000Z',
  },
  refreshToken: {
    token: 'stale-refresh-token',
    expiresAt: '2020-01-01T00:00:00.000Z',
  },
};

const freshTokenPair = {
  accessOrWorkspaceAgnosticToken: {
    token: 'fresh-access-token',
    expiresAt: '2100-01-01T00:00:00.000Z',
  },
  refreshToken: {
    token: 'fresh-refresh-token',
    expiresAt: '2100-01-01T00:00:00.000Z',
  },
};

describe('useRedeemSSOExchangeToken', () => {
  const mockEnqueueErrorSnackBar = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    resetJotaiStore();

    (useSnackBar as jest.Mock).mockReturnValue({
      enqueueErrorSnackBar: mockEnqueueErrorSnackBar,
    });

    mockSignOutMutation.mockResolvedValue({ data: { signOut: true } });
    mockGetAuthTokensFromSSOExchangeToken.mockResolvedValue({
      data: {
        getAuthTokensFromSSOExchangeToken: { tokens: freshTokenPair },
      },
    });
  });

  it('should store the redeemed token pair', async () => {
    const { result } = renderHooks();

    await result.current.redeemSSOExchangeToken('sso-exchange-token');

    expect(mockGetAuthTokensFromSSOExchangeToken).toHaveBeenCalledWith({
      variables: { ssoExchangeToken: 'sso-exchange-token' },
    });
    expect(jotaiStore.get(tokenPairState.atom)).toEqual(freshTokenPair);
  });

  it('should clear the existing token pair before exchanging', async () => {
    jotaiStore.set(tokenPairState.atom, staleTokenPair);

    const tokenPairsAtExchangeTime: unknown[] = [];

    mockGetAuthTokensFromSSOExchangeToken.mockImplementation(() => {
      tokenPairsAtExchangeTime.push(jotaiStore.get(tokenPairState.atom));

      return Promise.resolve({
        data: { getAuthTokensFromSSOExchangeToken: { tokens: freshTokenPair } },
      });
    });

    const { result } = renderHooks();

    await result.current.redeemSSOExchangeToken('sso-exchange-token');

    expect(tokenPairsAtExchangeTime).toEqual([null]);
  });

  it('waits for old server-session sign-out before exchanging', async () => {
    let resolveSignOut:
      | ((result: { data: { signOut: boolean } }) => void)
      | undefined;
    const callOrder: string[] = [];
    mockSignOutMutation.mockImplementation(
      () =>
        new Promise<{ data: { signOut: boolean } }>((resolve) => {
          callOrder.push('signOut');
          resolveSignOut = resolve;
        }),
    );
    mockGetAuthTokensFromSSOExchangeToken.mockImplementation(() => {
      callOrder.push('exchange');
      return Promise.resolve({
        data: { getAuthTokensFromSSOExchangeToken: { tokens: freshTokenPair } },
      });
    });

    const { result } = renderHooks();
    const redemption =
      result.current.redeemSSOExchangeToken('sso-exchange-token');

    await Promise.resolve();
    expect(callOrder).toEqual(['signOut']);
    expect(mockGetAuthTokensFromSSOExchangeToken).not.toHaveBeenCalled();

    resolveSignOut?.({ data: { signOut: true } });
    await redemption;

    expect(callOrder).toEqual(['signOut', 'exchange']);
  });

  it('reuses an already in-flight server-session sign-out', async () => {
    let resolveSignOut:
      | ((result: { data: { signOut: boolean } }) => void)
      | undefined;
    mockSignOutMutation.mockImplementation(
      () =>
        new Promise<{ data: { signOut: boolean } }>((resolve) => {
          resolveSignOut = resolve;
        }),
    );
    const pendingSignOut = runServerSessionSignOut(() => mockSignOutMutation());

    const { result } = renderHooks();
    const redemption =
      result.current.redeemSSOExchangeToken('sso-exchange-token');
    await Promise.resolve();

    expect(mockSignOutMutation).toHaveBeenCalledTimes(1);
    expect(mockGetAuthTokensFromSSOExchangeToken).not.toHaveBeenCalled();

    resolveSignOut?.({ data: { signOut: true } });
    await pendingSignOut;
    await redemption;

    expect(mockGetAuthTokensFromSSOExchangeToken).toHaveBeenCalledTimes(1);
  });

  it('should clear stale user metadata before exchanging', async () => {
    jotaiStore.set(currentUserState.atom, { id: 'owner-user' } as never);
    jotaiStore.set(currentWorkspaceState.atom, {
      id: 'owner-workspace',
    } as never);

    const metadataAtExchangeTime: unknown[] = [];
    mockGetAuthTokensFromSSOExchangeToken.mockImplementation(() => {
      metadataAtExchangeTime.push([
        jotaiStore.get(currentUserState.atom),
        jotaiStore.get(currentWorkspaceState.atom),
      ]);

      return Promise.resolve({
        data: { getAuthTokensFromSSOExchangeToken: { tokens: freshTokenPair } },
      });
    });

    const { result } = renderHooks();

    await result.current.redeemSSOExchangeToken('sso-exchange-token');

    expect(metadataAtExchangeTime).toEqual([[null, null]]);
  });

  it('should clear cookie authentication before exchanging', async () => {
    jotaiStore.set(isCookieAuthActiveState.atom, true);

    const cookieAuthAtExchangeTime: boolean[] = [];

    mockGetAuthTokensFromSSOExchangeToken.mockImplementation(() => {
      cookieAuthAtExchangeTime.push(
        jotaiStore.get(isCookieAuthActiveState.atom),
      );

      return Promise.resolve({
        data: { getAuthTokensFromSSOExchangeToken: { tokens: freshTokenPair } },
      });
    });

    const { result } = renderHooks();

    await result.current.redeemSSOExchangeToken('sso-exchange-token');

    expect(cookieAuthAtExchangeTime).toEqual([false]);
    expect(jotaiStore.get(isCookieAuthActiveState.atom)).toBe(false);
  });

  it('should finish old server-session cleanup before exchanging', async () => {
    const pendingFlagsAtExchangeTime: boolean[] = [];

    mockGetAuthTokensFromSSOExchangeToken.mockImplementation(() => {
      pendingFlagsAtExchangeTime.push(
        jotaiStore.get(isPendingServerSignOutState.atom),
      );

      return Promise.resolve({
        data: { getAuthTokensFromSSOExchangeToken: { tokens: freshTokenPair } },
      });
    });

    const { result } = renderHooks();

    await result.current.redeemSSOExchangeToken('sso-exchange-token');

    expect(pendingFlagsAtExchangeTime).toEqual([false]);
    expect(jotaiStore.get(isPendingServerSignOutState.atom)).toBe(false);
  });

  it('does not exchange when old server-session sign-out fails', async () => {
    mockSignOutMutation.mockRejectedValueOnce(new Error('Sign-out failed'));

    const { result } = renderHooks();
    await result.current.redeemSSOExchangeToken('sso-exchange-token');

    expect(mockGetAuthTokensFromSSOExchangeToken).not.toHaveBeenCalled();
    expect(jotaiStore.get(tokenPairState.atom)).toBeNull();
    expect(jotaiStore.get(isPendingServerSignOutState.atom)).toBe(true);
    expect(mockEnqueueErrorSnackBar).toHaveBeenCalledWith({
      message: 'Sign-out failed',
    });
  });

  it('should disable the redirect effect while exchanging and restore it after', async () => {
    const redirectFlagsAtExchangeTime: unknown[] = [];

    mockGetAuthTokensFromSSOExchangeToken.mockImplementation(() => {
      redirectFlagsAtExchangeTime.push(
        jotaiStore.get(isAppEffectRedirectEnabledState.atom),
      );

      return Promise.resolve({
        data: { getAuthTokensFromSSOExchangeToken: { tokens: freshTokenPair } },
      });
    });

    const { result } = renderHooks();

    await result.current.redeemSSOExchangeToken('sso-exchange-token');

    expect(redirectFlagsAtExchangeTime).toEqual([false]);
    expect(jotaiStore.get(isAppEffectRedirectEnabledState.atom)).toBe(true);
  });

  it('should snackbar and leave no token pair when redemption fails', async () => {
    mockGetAuthTokensFromSSOExchangeToken.mockRejectedValueOnce(
      new Error('Invalid SSO exchange token'),
    );

    const { result } = renderHooks();

    await result.current.redeemSSOExchangeToken('sso-exchange-token');

    expect(mockEnqueueErrorSnackBar).toHaveBeenCalledWith({
      message: 'Invalid SSO exchange token',
    });
    expect(jotaiStore.get(tokenPairState.atom)).toBeNull();
    expect(jotaiStore.get(isPendingServerSignOutState.atom)).toBe(false);
    expect(jotaiStore.get(isAppEffectRedirectEnabledState.atom)).toBe(true);
  });
});
