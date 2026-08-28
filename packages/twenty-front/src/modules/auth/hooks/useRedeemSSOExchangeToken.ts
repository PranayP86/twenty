import { isAppEffectRedirectEnabledState } from '@/app/states/isAppEffectRedirectEnabledState';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { isPendingServerSignOutState } from '@/auth/states/isPendingServerSignOutState';
import { isRedeemingSSOExchangeTokenState } from '@/auth/states/isRedeemingSSOExchangeTokenState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { clearSessionLocalStorageKeys } from '@/auth/utils/clearSessionLocalStorageKeys';
import { runServerSessionSignOut } from '@/auth/utils/runServerSessionSignOut';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { useMutation } from '@apollo/client/react';
import { useStore } from 'jotai';
import { useCallback } from 'react';
import { isDefined } from 'twenty-shared/utils';
import {
  GetAuthTokensFromSsoExchangeTokenDocument,
  SignOutDocument,
} from '~/generated-metadata/graphql';

export const useRedeemSSOExchangeToken = () => {
  const store = useStore();
  const { enqueueErrorSnackBar } = useSnackBar();
  const setTokenPair = useSetAtomState(tokenPairState);
  const setIsAppEffectRedirectEnabled = useSetAtomState(
    isAppEffectRedirectEnabledState,
  );
  const setIsCookieAuthActive = useSetAtomState(isCookieAuthActiveState);
  // ANANSI PATCH: no sign-in flash during OAuth resume
  const setIsRedeemingSSOExchangeToken = useSetAtomState(
    isRedeemingSSOExchangeTokenState,
  );
  const [getAuthTokensFromSSOExchangeToken] = useMutation(
    GetAuthTokensFromSsoExchangeTokenDocument,
  );
  const [signOutServerSession] = useMutation(SignOutDocument);

  const redeemSSOExchangeToken = useCallback(
    async (ssoExchangeToken: string) => {
      // Keeps PageChangeEffect from consuming returnToPath mid token swap, and
      // drops any stale pair so the resume waits for the one being redeemed
      setIsAppEffectRedirectEnabled(false);
      setIsRedeemingSSOExchangeToken(true);
      store.set(isPendingServerSignOutState.atom, true);
      setIsCookieAuthActive(false);
      setTokenPair(null);
      store.set(currentUserState.atom, null);
      store.set(currentWorkspaceState.atom, null);
      store.set(currentWorkspaceMemberState.atom, null);
      store.set(currentUserWorkspaceState.atom, null);
      clearSessionLocalStorageKeys();

      try {
        await runServerSessionSignOut(() => signOutServerSession());
        store.set(isPendingServerSignOutState.atom, false);

        const { data } = await getAuthTokensFromSSOExchangeToken({
          variables: { ssoExchangeToken },
        });

        if (!isDefined(data?.getAuthTokensFromSSOExchangeToken)) {
          throw new Error('No getAuthTokensFromSSOExchangeToken result');
        }

        setTokenPair(data.getAuthTokensFromSSOExchangeToken.tokens);
        store.set(isPendingServerSignOutState.atom, false);
      } catch (error: unknown) {
        enqueueErrorSnackBar(
          CombinedGraphQLErrors.is(error)
            ? { apolloError: error }
            : { message: error instanceof Error ? error.message : undefined },
        );
      } finally {
        setIsAppEffectRedirectEnabled(true);
        setIsRedeemingSSOExchangeToken(false);
      }
    },
    [
      getAuthTokensFromSSOExchangeToken,
      signOutServerSession,
      store,
      setTokenPair,
      setIsCookieAuthActive,
      setIsAppEffectRedirectEnabled,
      setIsRedeemingSSOExchangeToken,
      enqueueErrorSnackBar,
    ],
  );

  return { redeemSSOExchangeToken };
};
