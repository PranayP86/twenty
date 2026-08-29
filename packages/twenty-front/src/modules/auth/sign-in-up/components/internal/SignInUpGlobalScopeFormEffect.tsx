import { useAuth } from '@/auth/hooks/useAuth';
import { useIsLogged } from '@/auth/hooks/useIsLogged';
import {
  SignInUpStep,
  signInUpStepState,
} from '@/auth/states/signInUpStepState';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useLoadCurrentUser } from '@/users/hooks/useLoadCurrentUser';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';

export const SignInUpGlobalScopeFormEffect = () => {
  const signInUpStep = useAtomStateValue(signInUpStepState);
  const { navigateAfterMultiWorkspaceSignInUp } = useAuth();
  const { loadCurrentUser } = useLoadCurrentUser();
  const { enqueueErrorSnackBar } = useSnackBar();
  const { t } = useLingui();
  const isLogged = useIsLogged();

  useEffect(() => {
    const resumeOnCentralDomain = async () => {
      const { user } = await loadCurrentUser();
      await navigateAfterMultiWorkspaceSignInUp(
        user.availableWorkspaces,
        user.email,
        user.id,
      );
    };

    if (signInUpStep !== SignInUpStep.Init) return;
    if (!isLogged) return;

    void resumeOnCentralDomain().catch(() => {
      enqueueErrorSnackBar({
        message: t`Workspace setup could not continue. Reload and try again.`,
      });
    });
  }, [
    loadCurrentUser,
    signInUpStep,
    isLogged,
    navigateAfterMultiWorkspaceSignInUp,
    enqueueErrorSnackBar,
    t,
  ]);

  return <></>;
};
