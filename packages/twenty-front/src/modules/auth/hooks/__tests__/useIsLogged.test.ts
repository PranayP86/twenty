import { act, renderHook } from '@testing-library/react';

import { useIsLogged } from '@/auth/hooks/useIsLogged';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { isRedeemingSSOExchangeTokenState } from '@/auth/states/isRedeemingSSOExchangeTokenState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';

const renderHooks = () => {
  const { result } = renderHook(() => {
    const isLogged = useIsLogged();
    const setTokenPair = useSetAtomState(tokenPairState);
    const setIsCookieAuthActive = useSetAtomState(isCookieAuthActiveState);
    const setIsRedeemingSSOExchangeToken = useSetAtomState(
      isRedeemingSSOExchangeTokenState,
    );

    return {
      isLogged,
      setTokenPair,
      setIsCookieAuthActive,
      setIsRedeemingSSOExchangeToken,
    };
  });

  return { result };
};

describe('useIsLogged', () => {
  it('should be true when a token pair is present', async () => {
    const { result } = renderHooks();

    expect(result.current.isLogged).toBe(false);

    await act(async () => {
      result.current.setTokenPair({
        accessOrWorkspaceAgnosticToken: {
          expiresAt: '',
          token: 'testToken',
        },
        refreshToken: {
          expiresAt: '',
          token: 'testToken',
        },
      });
    });

    expect(result.current.isLogged).toBe(true);

    await act(async () => {
      result.current.setTokenPair(null);
    });

    expect(result.current.isLogged).toBe(false);
  });

  it('should be true when cookie auth is active without a token pair', async () => {
    const { result } = renderHooks();

    expect(result.current.isLogged).toBe(false);

    await act(async () => {
      result.current.setIsCookieAuthActive(true);
    });

    expect(result.current.isLogged).toBe(true);
  });

  it('should be false while an SSO exchange token is being redeemed', async () => {
    const { result } = renderHooks();

    await act(async () => {
      result.current.setTokenPair({
        accessOrWorkspaceAgnosticToken: {
          expiresAt: '',
          token: 'stale-owner-access',
        },
        refreshToken: {
          expiresAt: '',
          token: 'stale-owner-refresh',
        },
      });
      result.current.setIsCookieAuthActive(true);
      result.current.setIsRedeemingSSOExchangeToken(true);
    });

    expect(result.current.isLogged).toBe(false);

    await act(async () => {
      result.current.setIsRedeemingSSOExchangeToken(false);
    });

    expect(result.current.isLogged).toBe(true);
  });
});
