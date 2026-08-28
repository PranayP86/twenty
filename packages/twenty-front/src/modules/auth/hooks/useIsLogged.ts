import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { isRedeemingSSOExchangeTokenState } from '@/auth/states/isRedeemingSSOExchangeTokenState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';

export const useIsLogged = (): boolean => {
  const [tokenPair] = useAtomState(tokenPairState);
  const [isCookieAuthActive] = useAtomState(isCookieAuthActiveState);
  const [isRedeemingSSOExchangeToken] = useAtomState(
    isRedeemingSSOExchangeTokenState,
  );

  if (isRedeemingSSOExchangeToken) {
    return false;
  }

  return !!tokenPair || isCookieAuthActive;
};
