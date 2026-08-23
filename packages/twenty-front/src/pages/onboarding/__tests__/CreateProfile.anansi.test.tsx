// ANANSI PATCH: the stock profile screen keeps name setup but must not ask for
// one job title before the later Anansi multi-role step.
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import {
  type CurrentWorkspaceMember,
  currentWorkspaceMemberState,
} from '@/auth/states/currentWorkspaceMemberState';
import { useSetNextOnboardingStatus } from '@/onboarding/hooks/useSetNextOnboardingStatus';
import { useUpdateWorkspaceMemberSettings } from '@/settings/profile/hooks/useUpdateWorkspaceMemberSettings';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { CreateProfile } from '~/pages/onboarding/CreateProfile';
import { dynamicActivate } from '~/utils/i18n/dynamicActivate';

jest.mock('@/onboarding/components/OnboardingProfilePictureUploader', () => ({
  OnboardingProfilePictureUploader: () => null,
}));

jest.mock('@/onboarding/hooks/usePrefetchInviteSuggestions', () => ({
  usePrefetchInviteSuggestions: () => undefined,
}));

jest.mock('@/onboarding/hooks/useSetNextOnboardingStatus', () => ({
  useSetNextOnboardingStatus: jest.fn(),
}));

jest.mock('@/settings/profile/hooks/useUpdateWorkspaceMemberSettings', () => ({
  useUpdateWorkspaceMemberSettings: jest.fn(),
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({ enqueueErrorSnackBar: jest.fn() }),
}));

jest.mock(
  '@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElement',
  () => ({ useHotkeysOnFocusedElement: () => undefined }),
);

const mockUseSetNextOnboardingStatus =
  useSetNextOnboardingStatus as jest.MockedFunction<
    typeof useSetNextOnboardingStatus
  >;
const mockUseUpdateWorkspaceMemberSettings =
  useUpdateWorkspaceMemberSettings as jest.MockedFunction<
    typeof useUpdateWorkspaceMemberSettings
  >;
const mockSetNextOnboardingStatus = jest.fn();
const mockUpdateWorkspaceMemberSettings = jest.fn();

dynamicActivate(SOURCE_LOCALE);

const renderCreateProfile = () =>
  render(
    <JotaiProvider store={jotaiStore}>
      <ThemeProvider colorScheme="light">
        <I18nProvider i18n={i18n}>
          <CreateProfile />
        </I18nProvider>
      </ThemeProvider>
    </JotaiProvider>,
  );

describe('CreateProfile Anansi patch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetJotaiStore();
    jotaiStore.set(currentWorkspaceMemberState.atom, {
      id: 'workspace-member-1',
      name: { firstName: 'Prania', lastName: 'PX' },
      jobTitle: 'Existing title',
    } as CurrentWorkspaceMember);
    mockUseSetNextOnboardingStatus.mockReturnValue(
      mockSetNextOnboardingStatus,
    );
    mockUseUpdateWorkspaceMemberSettings.mockReturnValue({
      updateWorkspaceMemberSettings: mockUpdateWorkspaceMemberSettings,
    });
    mockUpdateWorkspaceMemberSettings.mockResolvedValue(undefined);
  });

  it('keeps name setup but omits the duplicate job-title input and write', async () => {
    renderCreateProfile();

    expect(screen.getByLabelText('First Name')).toHaveValue('Prania');
    expect(screen.getByLabelText('Last name')).toHaveValue('PX');
    expect(screen.queryByLabelText('Job Title')).not.toBeInTheDocument();

    const continueButton = screen.getByRole('button', { name: 'Continue' });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);

    await waitFor(() =>
      expect(mockUpdateWorkspaceMemberSettings).toHaveBeenCalledWith({
        workspaceMemberId: 'workspace-member-1',
        update: {
          name: { firstName: 'Prania', lastName: 'PX' },
          colorScheme: 'System',
        },
      }),
    );
    expect(mockSetNextOnboardingStatus).toHaveBeenCalledWith({
      stepHistoryEffect: 'recordAsReversible',
    });
  });
});
