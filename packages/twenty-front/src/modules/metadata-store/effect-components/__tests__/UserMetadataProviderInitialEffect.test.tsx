import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { type ReactNode } from 'react';

import { currentUserState } from '@/auth/states/currentUserState';
import { isCurrentUserLoadedState } from '@/auth/states/isCurrentUserLoadedState';
import { isRedeemingSSOExchangeTokenState } from '@/auth/states/isRedeemingSSOExchangeTokenState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { UserMetadataProviderInitialEffect } from '@/metadata-store/effect-components/UserMetadataProviderInitialEffect';

const mockUseQuery = jest.fn();

jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

jest.mock('@/localization/hooks/useInitializeFormatPreferences', () => ({
  useInitializeFormatPreferences: () => ({
    initializeFormatPreferences: jest.fn(),
  }),
}));

const buildTokenPair = (prefix: string) => ({
  accessOrWorkspaceAgnosticToken: {
    token: `${prefix}-access`,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  },
  refreshToken: {
    token: `${prefix}-refresh`,
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  },
});

describe('UserMetadataProviderInitialEffect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockImplementation(
      (_document: unknown, { skip }: { skip: boolean }) =>
        skip
          ? { data: undefined, loading: false }
          : {
              data: {
                currentUser: {
                  id: 'fresh-user',
                },
              },
              loading: false,
            },
    );
  });

  it('reinitializes metadata when a loaded account starts a new SSO exchange', async () => {
    let queryUserId = 'owner-user';
    mockUseQuery.mockImplementation(
      (_document: unknown, { skip }: { skip: boolean }) =>
        skip
          ? { data: undefined, loading: false }
          : {
              data: { currentUser: { id: queryUserId } },
              loading: false,
            },
    );
    const store = createStore();
    store.set(tokenPairState.atom, buildTokenPair('owner'));
    store.set(isRedeemingSSOExchangeTokenState.atom, false);
    store.set(isCurrentUserLoadedState.atom, false);

    renderHook(() => UserMetadataProviderInitialEffect(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <JotaiProvider store={store}>{children}</JotaiProvider>
      ),
    });

    await waitFor(() => {
      expect(store.get(currentUserState.atom)?.id).toBe('owner-user');
    });

    await act(async () => {
      queryUserId = 'fresh-user';
      store.set(isRedeemingSSOExchangeTokenState.atom, true);
      store.set(tokenPairState.atom, buildTokenPair('fresh'));
    });
    expect(store.get(isCurrentUserLoadedState.atom)).toBe(false);

    await act(async () => {
      store.set(isRedeemingSSOExchangeTokenState.atom, false);
    });

    await waitFor(() => {
      expect(store.get(currentUserState.atom)?.id).toBe('fresh-user');
    });
    expect(store.get(isCurrentUserLoadedState.atom)).toBe(true);
  });

  it('should wait for SSO redemption before initializing user metadata', async () => {
    const store = createStore();
    store.set(tokenPairState.atom, buildTokenPair('stale-owner'));
    store.set(isRedeemingSSOExchangeTokenState.atom, true);
    store.set(isCurrentUserLoadedState.atom, false);

    renderHook(() => UserMetadataProviderInitialEffect(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <JotaiProvider store={store}>{children}</JotaiProvider>
      ),
    });

    expect(store.get(isCurrentUserLoadedState.atom)).toBe(false);

    await act(async () => {
      store.set(tokenPairState.atom, buildTokenPair('fresh-user'));
      store.set(isRedeemingSSOExchangeTokenState.atom, false);
    });

    await waitFor(() => {
      expect(store.get(isCurrentUserLoadedState.atom)).toBe(true);
    });
    expect(store.get(currentUserState.atom)?.id).toBe('fresh-user');
  });
});
