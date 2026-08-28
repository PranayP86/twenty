import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { act, render, waitFor } from '@testing-library/react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { StrictMode } from 'react';

import { CookieSessionBootEffect } from '@/auth/effect-components/CookieSessionBootEffect';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { isPendingServerSignOutState } from '@/auth/states/isPendingServerSignOutState';
import { isRedeemingSSOExchangeTokenState } from '@/auth/states/isRedeemingSSOExchangeTokenState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { clientConfigApiStatusState } from '@/client-config/states/clientConfigApiStatusState';

const mockQuery = jest.fn();
const mockMutate = jest.fn();
const mockApolloClient = {
  query: (...args: unknown[]) => mockQuery(...args),
  mutate: (...args: unknown[]) => mockMutate(...args),
};
const mockEnsureTokenRenewed = jest.fn();

jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => mockApolloClient,
}));

jest.mock('@/auth/utils/ensureTokenRenewed', () => ({
  ensureTokenRenewed: (...args: unknown[]) => mockEnsureTokenRenewed(...args),
}));

const buildTokenPair = () => ({
  accessOrWorkspaceAgnosticToken: {
    token: 'access',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  },
  refreshToken: {
    token: 'refresh',
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  },
});

// A request carrying no credential is refused as FORBIDDEN, not UNAUTHENTICATED.
const buildForbiddenError = () =>
  new CombinedGraphQLErrors({
    data: null,
    errors: [
      {
        message: 'Forbidden resource',
        extensions: { code: 'FORBIDDEN' },
      },
    ],
  });

const renderBootEffect = (
  isRedeemingSSOExchangeToken = false,
  strictMode = false,
  setupStore?: (store: ReturnType<typeof createStore>) => void,
) => {
  const store = createStore();

  store.set(clientConfigApiStatusState.atom, {
    isLoadedOnce: true,
    isLoading: false,
    isErrored: false,
    isSaved: false,
  });
  store.set(isCookieAuthActiveState.atom, false);
  store.set(isRedeemingSSOExchangeTokenState.atom, isRedeemingSSOExchangeToken);
  store.set(tokenPairState.atom, buildTokenPair());
  setupStore?.(store);

  const effect = (
    <JotaiProvider store={store}>
      <CookieSessionBootEffect />
    </JotaiProvider>
  );
  render(strictMode ? <StrictMode>{effect}</StrictMode> : effect);

  return store;
};

describe('CookieSessionBootEffect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
    mockMutate.mockReset();
    mockEnsureTokenRenewed.mockReset();
    mockEnsureTokenRenewed.mockResolvedValue(true);
  });

  it('clears retained client identity before retrying pending sign-out', async () => {
    let resolveSignOut:
      | ((result: { data: { signOut: boolean } }) => void)
      | undefined;
    mockMutate.mockImplementation(
      () =>
        new Promise<{ data: { signOut: boolean } }>((resolve) => {
          resolveSignOut = resolve;
        }),
    );

    const store = renderBootEffect(false, false, (pendingStore) => {
      pendingStore.set(isPendingServerSignOutState.atom, true);
      pendingStore.set(isCookieAuthActiveState.atom, true);
      pendingStore.set(currentUserState.atom, { id: 'owner-user' } as never);
      pendingStore.set(currentWorkspaceState.atom, {
        id: 'owner-workspace',
      } as never);
      pendingStore.set(currentWorkspaceMemberState.atom, {
        id: 'owner-member',
      } as never);
      pendingStore.set(currentUserWorkspaceState.atom, {
        id: 'owner-user-workspace',
      } as never);
    });

    await waitFor(() => expect(resolveSignOut).toBeDefined());
    expect(store.get(tokenPairState.atom)).toBeNull();
    expect(store.get(isCookieAuthActiveState.atom)).toBe(false);
    expect(store.get(currentUserState.atom)).toBeNull();
    expect(store.get(currentWorkspaceState.atom)).toBeNull();
    expect(store.get(currentWorkspaceMemberState.atom)).toBeNull();
    expect(store.get(currentUserWorkspaceState.atom)).toBeNull();

    resolveSignOut?.({ data: { signOut: true } });
    await waitFor(() => {
      expect(store.get(isPendingServerSignOutState.atom)).toBe(false);
    });
  });

  it('should renew once so the server can set the cookie when the probe is refused', async () => {
    mockQuery.mockRejectedValue(buildForbiddenError());
    mockEnsureTokenRenewed.mockImplementationOnce(() => {
      mockQuery.mockResolvedValue({ data: { currentUser: { id: 'user-id' } } });
      return Promise.resolve(true);
    });

    const store = renderBootEffect();

    await waitFor(() => {
      expect(mockEnsureTokenRenewed).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(store.get(isCookieAuthActiveState.atom)).toBe(true);
    });

    // Retained as a fallback for servers that predate cookie sessions, which
    // would otherwise sign the user out mid-rollout.
    expect(store.get(tokenPairState.atom)).not.toBeNull();
  });

  it('should stay retryable when the probe fails for an unrelated reason', async () => {
    mockQuery.mockRejectedValue(
      new CombinedGraphQLErrors({
        data: null,
        errors: [
          {
            message: 'Something broke in a resolver',
            extensions: { code: 'INTERNAL_SERVER_ERROR' },
          },
        ],
      }),
    );

    const store = renderBootEffect();

    await waitFor(() => {
      expect(mockQuery).toHaveBeenCalled();
    });

    expect(mockEnsureTokenRenewed).not.toHaveBeenCalled();
    expect(store.get(isCookieAuthActiveState.atom)).toBe(false);
    expect(store.get(tokenPairState.atom)).not.toBeNull();
  });

  it('should not renew when the server cannot be reached', async () => {
    mockQuery.mockRejectedValue(new Error('Network request failed'));

    const store = renderBootEffect();

    await waitFor(() => {
      expect(mockQuery).toHaveBeenCalled();
    });

    expect(mockEnsureTokenRenewed).not.toHaveBeenCalled();
    expect(store.get(isCookieAuthActiveState.atom)).toBe(false);
  });

  it('should switch straight over when the cookie already authenticates', async () => {
    mockQuery.mockResolvedValue({ data: { currentUser: { id: 'user-id' } } });

    const store = renderBootEffect();

    await waitFor(() => {
      expect(store.get(isCookieAuthActiveState.atom)).toBe(true);
    });

    expect(mockEnsureTokenRenewed).not.toHaveBeenCalled();
  });

  it('completes the cookie probe after a StrictMode effect replay', async () => {
    let resolveProbe:
      | ((result: { data: { currentUser: { id: string } } }) => void)
      | undefined;
    mockQuery
      .mockImplementationOnce(
        () =>
          new Promise<{ data: { currentUser: { id: string } } }>((resolve) => {
            resolveProbe = resolve;
          }),
      )
      .mockResolvedValue({ data: { currentUser: { id: 'user-id' } } });

    const store = renderBootEffect(false, true);
    await waitFor(() => expect(resolveProbe).toBeDefined());
    await waitFor(() => expect(mockQuery.mock.calls.length).toBeGreaterThan(1));

    await act(async () => {
      resolveProbe?.({ data: { currentUser: { id: 'user-id' } } });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(store.get(isCookieAuthActiveState.atom)).toBe(true);
    });
  });

  it('ignores an in-flight cookie probe when SSO redemption starts', async () => {
    let resolveProbe:
      | ((result: { data: { currentUser: { id: string } } }) => void)
      | undefined;
    mockQuery.mockImplementationOnce(
      () =>
        new Promise<{ data: { currentUser: { id: string } } }>((resolve) => {
          resolveProbe = resolve;
        }),
    );
    const store = renderBootEffect();
    await waitFor(() => expect(resolveProbe).toBeDefined());

    await act(async () => {
      store.set(isRedeemingSSOExchangeTokenState.atom, true);
      resolveProbe?.({ data: { currentUser: { id: 'stale-owner' } } });
      await Promise.resolve();
    });

    expect(store.get(isCookieAuthActiveState.atom)).toBe(false);
    expect(mockEnsureTokenRenewed).not.toHaveBeenCalled();
  });

  it('should not probe or renew while an SSO exchange token is being redeemed', async () => {
    mockQuery.mockResolvedValue({ data: { currentUser: { id: 'user-id' } } });

    const store = renderBootEffect(true);

    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockEnsureTokenRenewed).not.toHaveBeenCalled();

    await act(async () => {
      store.set(isRedeemingSSOExchangeTokenState.atom, false);
    });

    await waitFor(() => {
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
    expect(mockEnsureTokenRenewed).not.toHaveBeenCalled();
    expect(store.get(isCookieAuthActiveState.atom)).toBe(true);
  });
});
