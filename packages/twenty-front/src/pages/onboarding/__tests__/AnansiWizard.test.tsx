// ANANSI PATCH (WS-C): focused wizard behavior coverage. Core REST calls use a
// path router; Apollo is mocked separately so Finish ordering crosses both APIs.
import { MockedProvider } from '@apollo/client/testing/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { ANANSI_API_URL } from '@/auth/constants/AnansiApiUrl';
import { tokenPairState } from '@/auth/states/tokenPairState';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import {
  AnansiWizard,
  COMPLETE_ANANSI_WIZARD,
} from '~/pages/onboarding/AnansiWizard';
import { dynamicActivate } from '~/utils/i18n/dynamicActivate';

const mockSetNextOnboardingStatus = jest.fn();

jest.mock('@/onboarding/hooks/useSetNextOnboardingStatus', () => ({
  useSetNextOnboardingStatus: () => mockSetNextOnboardingStatus,
}));

// ANANSI PATCH (WS-C): keep this a wizard data-flow test; the portal-backed
// Select has its own suite and is represented here by an accessible native one.
jest.mock('@/ui/input/components/Select', () => ({
  Select: ({
    label,
    value,
    options,
    onChange,
  }: {
    label?: string;
    value?: string;
    options: Array<{ label: string; value: string }>;
    onChange?: (nextValue: string) => void;
  }) => (
    <select
      aria-label={label}
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

dynamicActivate(SOURCE_LOCALE);

const ACCESS_TOKEN = 'fake-access-token';
const REQUIRED_DETAIL =
  'resume and target roles are required before going live';

const setTokenPair = () => {
  jotaiStore.set(tokenPairState.atom, {
    accessOrWorkspaceAgnosticToken: {
      token: ACCESS_TOKEN,
      expiresAt: '2099-01-01T00:00:00.000Z',
    },
    refreshToken: {
      token: 'fake-refresh-token',
      expiresAt: '2099-01-01T00:00:00.000Z',
    },
  });
};

const profileResponse = (profile: Record<string, unknown> = {}) => ({
  version: Object.keys(profile).length > 0 ? 1 : null,
  profile,
});

const policyResponse = (
  policy: Record<string, unknown> = { relocation: true },
  version = 3,
) => ({ version, policy });

const meResponse = () => ({
  email: 'jane.doe@example.com',
  timezone: 'UTC',
  awake_hours: { start: '09:00', end: '18:00' },
  mode: 'shadow',
});

const jsonOk = (body: unknown) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
});

const jsonError = (status: number, body: unknown = {}) => ({
  ok: false,
  status,
  json: () => Promise.resolve(body),
});

type MockResponse = ReturnType<typeof jsonOk> | ReturnType<typeof jsonError>;

const mockFetchRouter = (
  responses: Record<string, MockResponse[]>,
  onCall?: (key: string) => void,
) => {
  const fetchMock = jest.fn(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = String(input).replace(ANANSI_API_URL, '');
      const key = `${method} ${path}`;
      onCall?.(key);
      const queue = responses[key];
      if (!queue || queue.length === 0) {
        throw new Error(`Unmocked ANANSI fetch: ${key}`);
      }
      return Promise.resolve(queue.shift());
    },
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

const completeWizardMock = (onResult?: () => void) => ({
  request: { query: COMPLETE_ANANSI_WIZARD },
  result: () => {
    onResult?.();
    return {
      data: {
        completeAnansiWizardOnboardingStep: { success: true },
      },
    };
  },
});

const renderWizard = (apolloMocks: readonly unknown[] = []) =>
  render(
    <MockedProvider mocks={apolloMocks as never}>
      <JotaiProvider store={jotaiStore}>
        <MemoryRouter>
          <ThemeProvider colorScheme="light">
            <I18nProvider i18n={i18n}>
              <AnansiWizard />
            </I18nProvider>
          </ThemeProvider>
        </MemoryRouter>
      </JotaiProvider>
    </MockedProvider>,
  );

const continueThroughRequiredSteps = async () => {
  await screen.findByText('Add your resume');
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('What roles do you want?');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('How do you want to work?');
};

const continueToFinish = async () => {
  await continueThroughRequiredSteps();
  fireEvent.click(screen.getByLabelText('Remote only'));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Where should Anansi search?');
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
  await screen.findByText('Choose your resume options');
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
  await screen.findByText('Set your availability');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText("Here's how your first week works");
};

describe('AnansiWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetJotaiStore();
    setTokenPair();
  });

  it('requires a resume and uploads PDF FormData without a Content-Type header', async () => {
    const fetchMock = mockFetchRouter({
      'GET /v1/profile': [
        jsonOk(profileResponse()),
        jsonOk(
          profileResponse({
            resume_pdf_ref: 'resumes/user/master.pdf',
            target_roles: ['Senior SRE'],
          }),
        ),
      ],
      'POST /v1/resume': [
        jsonOk({ ok: true, profile_version: 1, parsed: null }),
      ],
    });

    renderWizard();

    await screen.findByText('Add your resume');
    const nextButton = screen.getByRole('button', { name: 'Next' });
    expect(nextButton).toBeDisabled();

    const file = new File(['%PDF-1.7'], 'cv.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(await screen.findByLabelText('PDF resume'), {
      target: { files: [file] },
    });

    await screen.findByText(/Resume received/);
    expect(nextButton).toBeEnabled();

    const uploadCall = fetchMock.mock.calls.find(
      ([input]) => String(input).endsWith('/v1/resume'),
    );
    expect(uploadCall).toBeDefined();
    const uploadInit = uploadCall?.[1] as RequestInit;
    expect(uploadInit.method).toBe('POST');
    expect(uploadInit.headers).toEqual({
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    });
    expect(uploadInit.body).toBeInstanceOf(FormData);
    expect((uploadInit.body as FormData).get('file')).toBe(file);
  });

  it('requires at least one role and PATCHes the selected chips', async () => {
    const fetchMock = mockFetchRouter({
      'GET /v1/profile': [
        jsonOk(profileResponse({ resume_pdf_ref: 'resumes/user/master.pdf' })),
      ],
      'PATCH /v1/profile': [
        jsonOk(
          profileResponse({
            resume_pdf_ref: 'resumes/user/master.pdf',
            target_roles: ['Platform Engineer'],
          }),
        ),
      ],
    });

    renderWizard();

    await screen.findByText(/Resume received/);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('What roles do you want?');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Role or job title'), {
      target: { value: 'Platform Engineer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await screen.findByText('How do you want to work?');
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/profile`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ target_roles: ['Platform Engineer'] }),
      }),
    );
  });

  it('skips work mode without making a request', async () => {
    const fetchMock = mockFetchRouter({
      'GET /v1/profile': [
        jsonOk(
          profileResponse({
            resume_pdf_ref: 'resumes/user/master.pdf',
            target_roles: ['SRE'],
          }),
        ),
      ],
      'PATCH /v1/profile': [
        jsonOk(
          profileResponse({
            resume_pdf_ref: 'resumes/user/master.pdf',
            target_roles: ['SRE'],
          }),
        ),
      ],
    });

    renderWizard();
    await continueThroughRequiredSteps();
    fetchMock.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    await screen.findByText('Where should Anansi search?');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('finishes in strict REST, GraphQL, then client-state order and merges fresh policy', async () => {
    const finishOrder: string[] = [];
    mockSetNextOnboardingStatus.mockImplementation(() => {
      finishOrder.push('STATE');
    });
    const fetchMock = mockFetchRouter(
      {
        'GET /v1/profile': [
          jsonOk(
            profileResponse({
              resume_pdf_ref: 'resumes/user/master.pdf',
              target_roles: ['SRE'],
            }),
          ),
        ],
        'PATCH /v1/profile': [
          jsonOk(
            profileResponse({
              resume_pdf_ref: 'resumes/user/master.pdf',
              target_roles: ['SRE'],
            }),
          ),
        ],
        'GET /v1/policy': [jsonOk(policyResponse())],
        'PUT /v1/policy': [
          jsonOk(
            policyResponse({
              relocation: true,
              work_mode: 'remote_only',
              remote_only: true,
            }),
          ),
        ],
        'PATCH /v1/me': [jsonOk(meResponse())],
        'POST /v1/onboarding/complete': [
          jsonOk({ mode: 'live', already: false }),
        ],
      },
      (key) => {
        if (key.includes('/v1/policy') || key.includes('/v1/me') || key.includes('/v1/onboarding')) {
          finishOrder.push(key);
        }
      },
    );

    renderWizard([
      completeWizardMock(() => {
        finishOrder.push('GRAPHQL');
      }),
    ]);
    await continueToFinish();
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    await waitFor(() => {
      expect(mockSetNextOnboardingStatus).toHaveBeenCalledWith({
        stepHistoryEffect: 'leaveUnchanged',
      });
    });
    expect(finishOrder).toEqual([
      'GET /v1/policy',
      'PUT /v1/policy',
      'PATCH /v1/me',
      'POST /v1/onboarding/complete',
      'GRAPHQL',
      'STATE',
    ]);

    const policyPut = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
    );
    const policyBody = JSON.parse(
      (policyPut?.[1] as RequestInit).body as string,
    );
    expect(policyBody.policy).toEqual({
      relocation: true,
      work_mode: 'remote_only',
      remote_only: true,
    });
  });

  it('surfaces onboarding 409 detail verbatim, aborts before GraphQL, and retries the full chain', async () => {
    const finishOrder: string[] = [];
    let graphqlCalls = 0;
    mockSetNextOnboardingStatus.mockImplementation(() => {
      finishOrder.push('STATE');
    });
    mockFetchRouter(
      {
        'GET /v1/profile': [
          jsonOk(
            profileResponse({
              resume_pdf_ref: 'resumes/user/master.pdf',
              target_roles: ['SRE'],
            }),
          ),
        ],
        'PATCH /v1/profile': [
          jsonOk(
            profileResponse({
              resume_pdf_ref: 'resumes/user/master.pdf',
              target_roles: ['SRE'],
            }),
          ),
        ],
        'GET /v1/policy': [
          jsonOk(policyResponse()),
          jsonOk(policyResponse(undefined, 4)),
        ],
        'PUT /v1/policy': [
          jsonOk(policyResponse(undefined, 4)),
          jsonOk(policyResponse(undefined, 5)),
        ],
        'PATCH /v1/me': [jsonOk(meResponse()), jsonOk(meResponse())],
        'POST /v1/onboarding/complete': [
          jsonError(409, { detail: REQUIRED_DETAIL }),
          jsonOk({ mode: 'live', already: false }),
        ],
      },
      (key) => {
        if (key.includes('/v1/policy') || key.includes('/v1/me') || key.includes('/v1/onboarding')) {
          finishOrder.push(key);
        }
      },
    );

    renderWizard([
      completeWizardMock(() => {
        graphqlCalls += 1;
        finishOrder.push('GRAPHQL');
      }),
    ]);
    await continueToFinish();
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(await screen.findByText(REQUIRED_DETAIL)).toBeInTheDocument();
    expect(graphqlCalls).toBe(0);
    expect(mockSetNextOnboardingStatus).not.toHaveBeenCalled();
    expect(finishOrder).toEqual([
      'GET /v1/policy',
      'PUT /v1/policy',
      'PATCH /v1/me',
      'POST /v1/onboarding/complete',
    ]);
    expect(screen.getByRole('button', { name: 'Finish' })).toBeEnabled();

    finishOrder.length = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    await waitFor(() => expect(graphqlCalls).toBe(1));
    expect(finishOrder).toEqual([
      'GET /v1/policy',
      'PUT /v1/policy',
      'PATCH /v1/me',
      'POST /v1/onboarding/complete',
      'GRAPHQL',
      'STATE',
    ]);
  });
});
