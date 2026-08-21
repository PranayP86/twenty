import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
// ANANSI PATCH: the component now calls useSearchParams() unconditionally
// (admin-bypass gate) — it needs a Router ancestor or every render throws.
import { MemoryRouter } from 'react-router-dom';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { SignInUpWorkspaceCreationForm } from '@/auth/sign-in-up/components/internal/SignInUpWorkspaceCreationForm';
// ANANSI PATCH: the admin-bypass gate requires both the query param below
// and canAccessFullAdminPanel on currentUser to reach the stock form these
// tests exercise.
import { currentUserState } from '@/auth/states/currentUserState';
import { isCreatingWorkspaceState } from '@/auth/states/isCreatingWorkspaceState';
import { isMultiWorkspaceEnabledState } from '@/client-config/states/isMultiWorkspaceEnabledState';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { dynamicActivate } from '~/utils/i18n/dynamicActivate';
import { OnboardingStatus } from '~/generated-metadata/graphql';

// ANANSI PATCH: SignInUpWorkspaceCreationForm now renders AnansiProvisioningScreen
// unless the current user is a server admin explicitly hitting the
// ?action=create-new-workspace bypass — match that here so this file keeps
// exercising the stock form below (StockSignInUpWorkspaceCreationForm).
const mockAdminUser = {
  id: 'fake-user-id',
  email: 'admin@example.com',
  supportUserHash: null,
  canAccessFullAdminPanel: true,
  canImpersonate: false,
  onboardingStatus: OnboardingStatus.COMPLETED,
  userVars: {},
  firstName: 'fake-first-name',
  lastName: 'fake-last-name',
  hasPassword: true,
};

const createWorkspaceMock = jest.fn();
const applySuggestionValueMock = jest.fn();
const handleSubdomainChangeMock = jest.fn();
const handleWorkspaceNameChangeMock = jest.fn();
const useWorkspaceSubdomainFieldMock = jest.fn();

jest.mock('@/auth/sign-in-up/hooks/useSignUpInNewWorkspace', () => ({
  useSignUpInNewWorkspace: () => ({ createWorkspace: createWorkspaceMock }),
}));

jest.mock('@/auth/sign-in-up/hooks/useWorkspaceSubdomainField', () => ({
  useWorkspaceSubdomainField: () => useWorkspaceSubdomainFieldMock(),
}));

global.URL.createObjectURL = jest.fn(() => 'blob:logo-preview');
global.URL.revokeObjectURL = jest.fn();

dynamicActivate(SOURCE_LOCALE);

const setMultiWorkspaceEnabled = (isEnabled: boolean) => {
  jotaiStore.set(isMultiWorkspaceEnabledState.atom, isEnabled);
};

const renderForm = () =>
  render(
    <JotaiProvider store={jotaiStore}>
      {/* ANANSI PATCH: MemoryRouter supplies the Router context
          useSearchParams() needs, with the admin-bypass query param already
          set so the gate resolves to the stock form below. */}
      <MemoryRouter initialEntries={['/?action=create-new-workspace']}>
        <ThemeProvider colorScheme="light">
          <I18nProvider i18n={i18n}>
            <SignInUpWorkspaceCreationForm />
          </I18nProvider>
        </ThemeProvider>
      </MemoryRouter>
    </JotaiProvider>,
  );

describe('SignInUpWorkspaceCreationForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetJotaiStore();
    // ANANSI PATCH: admin bypass — see mockAdminUser comment above.
    jotaiStore.set(currentUserState.atom, mockAdminUser);
    useWorkspaceSubdomainFieldMock.mockReturnValue({
      workspaceName: 'Apple',
      subdomain: 'apple',
      status: 'available',
      errorMessage: undefined,
      suggestions: [],
      isAvailable: true,
      handleWorkspaceNameChange: handleWorkspaceNameChangeMock,
      handleSubdomainChange: handleSubdomainChangeMock,
      applySuggestionValue: applySuggestionValueMock,
    });
  });

  describe('multi-workspace', () => {
    beforeEach(() => {
      setMultiWorkspaceEnabled(true);
    });

    it('creates the workspace with the chosen name and subdomain', async () => {
      createWorkspaceMock.mockResolvedValue(true);

      renderForm();

      const createButton = screen.getByRole('button', {
        name: 'Create workspace',
      });
      expect(createButton).toBeEnabled();

      await act(async () => {
        fireEvent.click(createButton);
      });

      expect(createWorkspaceMock).toHaveBeenCalledWith({
        displayName: 'Apple',
        subdomain: 'apple',
        logo: undefined,
      });
    });

    it('keeps the loader on through a successful creation, until the redirect', async () => {
      let resolveCreateWorkspace: () => void = () => {};
      createWorkspaceMock.mockReturnValue(
        new Promise<boolean>((resolve) => {
          resolveCreateWorkspace = () => resolve(true);
        }),
      );

      renderForm();

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Create workspace' }),
        );
      });

      expect(jotaiStore.get(isCreatingWorkspaceState.atom)).toBe(true);
      expect(createWorkspaceMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveCreateWorkspace();
      });

      expect(jotaiStore.get(isCreatingWorkspaceState.atom)).toBe(true);
    });

    it('returns to the form when workspace creation fails', async () => {
      createWorkspaceMock.mockResolvedValue(false);

      renderForm();

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Create workspace' }),
        );
      });

      expect(jotaiStore.get(isCreatingWorkspaceState.atom)).toBe(false);
    });

    it('lists available alternatives and applies the picked one when the subdomain is taken', () => {
      useWorkspaceSubdomainFieldMock.mockReturnValue({
        workspaceName: 'Stripe',
        subdomain: 'stripe',
        status: 'unavailable',
        errorMessage: undefined,
        suggestions: ['stripe-2', 'mystripe', 'stripeeinc'],
        isAvailable: false,
        handleWorkspaceNameChange: handleWorkspaceNameChangeMock,
        handleSubdomainChange: handleSubdomainChangeMock,
        applySuggestionValue: applySuggestionValueMock,
      });

      renderForm();

      expect(
        screen.getByText(
          'Subdomain already in use, here are some alternatives:',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Create workspace' }),
      ).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'mystripe' }));

      expect(applySuggestionValueMock).toHaveBeenCalledWith('mystripe');
    });
  });

  describe('single-workspace', () => {
    beforeEach(() => {
      setMultiWorkspaceEnabled(false);
    });

    it('hides the subdomain field and creates without a subdomain', async () => {
      createWorkspaceMock.mockResolvedValue(true);

      renderForm();

      expect(screen.getByLabelText('Name')).toBeInTheDocument();
      expect(screen.queryByLabelText('Subdomain')).not.toBeInTheDocument();

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Create workspace' }),
        );
      });

      expect(createWorkspaceMock).toHaveBeenCalledWith({
        displayName: 'Apple',
        logo: undefined,
      });
      expect(createWorkspaceMock.mock.calls[0][0]).not.toHaveProperty(
        'subdomain',
      );
    });
  });
});
