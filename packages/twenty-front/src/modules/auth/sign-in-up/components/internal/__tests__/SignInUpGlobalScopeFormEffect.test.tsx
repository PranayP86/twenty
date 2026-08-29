import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, waitFor } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { SOURCE_LOCALE } from 'twenty-shared/translations';

import { SignInUpGlobalScopeFormEffect } from '@/auth/sign-in-up/components/internal/SignInUpGlobalScopeFormEffect';
import {
  SignInUpStep,
  signInUpStepState,
} from '@/auth/states/signInUpStepState';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { dynamicActivate } from '~/utils/i18n/dynamicActivate';

const navigateAfterMultiWorkspaceSignInUpMock = jest.fn();
const loadCurrentUserMock = jest.fn();
const enqueueErrorSnackBarMock = jest.fn();

jest.mock('@/auth/hooks/useAuth', () => ({
  useAuth: () => ({
    navigateAfterMultiWorkspaceSignInUp:
      navigateAfterMultiWorkspaceSignInUpMock,
  }),
}));

jest.mock('@/auth/hooks/useIsLogged', () => ({
  useIsLogged: () => true,
}));

jest.mock('@/users/hooks/useLoadCurrentUser', () => ({
  useLoadCurrentUser: () => ({ loadCurrentUser: loadCurrentUserMock }),
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({ enqueueErrorSnackBar: enqueueErrorSnackBarMock }),
}));

dynamicActivate(SOURCE_LOCALE);

describe('SignInUpGlobalScopeFormEffect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetJotaiStore();
    jotaiStore.set(signInUpStepState.atom, SignInUpStep.Init);
    loadCurrentUserMock.mockResolvedValue({
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'friend@example.com',
        availableWorkspaces: {
          availableWorkspacesForSignIn: [],
          availableWorkspacesForSignUp: [],
        },
      },
    });
  });

  it('shows a setup error when central-domain resume fails', async () => {
    navigateAfterMultiWorkspaceSignInUpMock.mockRejectedValue(
      new Error('Could not save workspace setup state'),
    );

    render(
      <I18nProvider i18n={i18n}>
        <JotaiProvider store={jotaiStore}>
          <SignInUpGlobalScopeFormEffect />
        </JotaiProvider>
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(enqueueErrorSnackBarMock).toHaveBeenCalledWith({
        message: 'Workspace setup could not continue. Reload and try again.',
      });
    });
  });
});
