// ANANSI PATCH (WS-C): focused wizard behavior coverage. Core REST calls use a
// path router; Apollo is mocked separately so Finish ordering crosses both APIs.
import { MockedProvider } from '@apollo/client/testing/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { StrictMode } from 'react';
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
const mockGoBackToPreviousOnboardingStep = jest.fn();
const mockSignOut = jest.fn(() => Promise.resolve());

jest.mock('@/auth/hooks/useAuth', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));

jest.mock('@/onboarding/hooks/useGoBackToPreviousOnboardingStep', () => ({
  useGoBackToPreviousOnboardingStep: () => ({
    goBackToPreviousOnboardingStep: mockGoBackToPreviousOnboardingStep,
    isGoingBackToPreviousOnboardingStep: false,
  }),
}));

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
const makeAccessToken = (nonce: string) => {
  const payload = window
    .btoa(
      JSON.stringify({
        userId: 'user-id',
        workspaceId: 'workspace-id',
        nonce,
      }),
    )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');

  return `eyJhbGciOiJub25lIn0.${payload}.signature`;
};
const REQUIRED_DETAIL =
  'resume and target roles are required before going live';

const setTokenPair = (accessToken = ACCESS_TOKEN) => {
  jotaiStore.set(tokenPairState.atom, {
    accessOrWorkspaceAgnosticToken: {
      token: accessToken,
      expiresAt: '2099-01-01T00:00:00.000Z',
    },
    refreshToken: {
      token: 'fake-refresh-token',
      expiresAt: '2099-01-01T00:00:00.000Z',
    },
  });
};

const profileResponse = (
  profile: Record<string, unknown> = {},
  version: number | null = Object.keys(profile).length > 0 ? 1 : null,
) => {
  const storedProfile =
    typeof profile.resume_pdf_ref === 'string' &&
    !('resume_parse_status' in profile) &&
    !('cv_parsed' in profile)
      ? { ...profile, cv_parsed: { summary: 'Stored resume' } }
      : profile;

  return {
    version,
    profile: storedProfile,
  };
};

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
  const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = String(input).replace(ANANSI_API_URL, '');
    const key = `${method} ${path}`;
    onCall?.(key);
    const queue = responses[key];
    if (queue === undefined || queue.length === 0) {
      throw new Error(`Unmocked ANANSI fetch: ${key}`);
    }
    return Promise.resolve(queue.shift());
  });
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

const renderWizard = (
  apolloMocks: readonly unknown[] = [],
  strictMode = false,
) => {
  const wizard = (
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
    </MockedProvider>
  );

  return render(strictMode ? <StrictMode>{wizard}</StrictMode> : wizard);
};

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

  afterEach(() => {
    jest.useRealTimers();
  });

  it('offers Back and Sign out on the first Anansi step', async () => {
    mockFetchRouter({
      'GET /v1/profile': [
        jsonOk(
          profileResponse({
            resume_pdf_ref: 'resumes/user/master.pdf',
            resume_parse_status: 'ready',
            cv_parsed: { summary: 'Senior SRE' },
          }),
        ),
      ],
    });

    renderWizard();

    await screen.findByText('Resume received');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(mockGoBackToPreviousOnboardingStep).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  });

  it('returns to the preceding Anansi step with Back', async () => {
    mockFetchRouter({
      'GET /v1/profile': [
        jsonOk(
          profileResponse({
            resume_pdf_ref: 'resumes/user/master.pdf',
            resume_parse_status: 'ready',
            cv_parsed: { summary: 'Senior SRE' },
          }),
        ),
      ],
    });

    renderWizard();

    await screen.findByText('Resume received');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('What roles do you want?');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByText('Add your resume')).toBeInTheDocument();
    expect(mockGoBackToPreviousOnboardingStep).not.toHaveBeenCalled();
  });

  it('loads saved resume state after the StrictMode effect replay', async () => {
    const readyProfile = jsonOk(
      profileResponse({
        resume_pdf_ref: 'resumes/user/master.pdf',
        resume_parse_status: 'ready',
        cv_parsed: { summary: 'Senior SRE' },
      }),
    );
    mockFetchRouter({
      'GET /v1/profile': [readyProfile, readyProfile],
    });

    renderWizard([], true);

    expect(await screen.findByText('Resume received')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('provisions a missing Core user before retrying Profile', async () => {
    const calls: string[] = [];
    mockFetchRouter(
      {
        'GET /v1/profile': [
          jsonError(401, { detail: 'unauthenticated' }),
          jsonOk(profileResponse()),
        ],
        'POST /v1/provision': [jsonOk({ status: 'provisioned' })],
      },
      (key) => calls.push(key),
    );

    renderWizard();

    expect(await screen.findByText('Add your resume')).toBeInTheDocument();
    expect(calls).toEqual([
      'GET /v1/profile',
      'POST /v1/provision',
      'GET /v1/profile',
    ]);
    expect(
      screen.queryByText(
        "Couldn't load your saved onboarding progress. Please try again.",
      ),
    ).not.toBeInTheDocument();
  });

  it('checks Profile after an ambiguous provisioning response', async () => {
    const calls: string[] = [];
    mockFetchRouter(
      {
        'GET /v1/profile': [
          jsonError(401, { detail: 'unauthenticated' }),
          jsonOk(profileResponse()),
        ],
        'POST /v1/provision': [jsonError(503)],
      },
      (key) => calls.push(key),
    );

    renderWizard();

    expect(await screen.findByText('Add your resume')).toBeInTheDocument();
    expect(calls).toEqual([
      'GET /v1/profile',
      'POST /v1/provision',
      'GET /v1/profile',
    ]);
  });

  it('recovers an in-progress resume extraction after reload', async () => {
    jest.useFakeTimers();
    const fetchMock = mockFetchRouter({
      'GET /v1/profile': [
        jsonOk(
          profileResponse({
            resume_pdf_ref: 'resumes/user/master.pdf',
            resume_parse_status: 'processing',
          }),
        ),
        jsonOk(
          profileResponse({
            resume_pdf_ref: 'resumes/user/master.pdf',
            resume_parse_status: 'ready',
            cv_parsed: { summary: 'Senior SRE' },
            target_roles: ['Senior SRE'],
          }),
        ),
      ],
    });

    renderWizard();

    expect(
      await screen.findByText(
        'Uploading and extracting your resume… This can take up to five minutes.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('PDF resume')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await act(async () => {
      jest.advanceTimersByTime(1_500);
      await Promise.resolve();
    });

    await screen.findByText('Resume received');
    expect(screen.getByLabelText('PDF resume')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith('/v1/profile'),
      ),
    ).toHaveLength(2);
  });

  it('accepts resume readiness on the final status poll', async () => {
    jest.useFakeTimers();
    let profileReads = 0;
    global.fetch = jest.fn(() => {
      profileReads += 1;

      return Promise.resolve(
        jsonOk(
          profileResponse({
            resume_pdf_ref: 'resumes/user/master.pdf',
            resume_parse_status: profileReads === 208 ? 'ready' : 'processing',
            ...(profileReads === 208
              ? { cv_parsed: { summary: 'Senior SRE' } }
              : {}),
          }),
        ),
      );
    }) as unknown as typeof fetch;

    renderWizard();
    expect(
      await screen.findByText(
        'Uploading and extracting your resume… This can take up to five minutes.',
      ),
    ).toBeInTheDocument();

    for (let poll = 0; poll < 207; poll += 1) {
      await act(async () => {
        jest.advanceTimersByTime(1_500);
        await Promise.resolve();
      });
    }

    expect(await screen.findByText('Resume received')).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Resume extraction is taking longer than expected. Select the PDF again to retry.',
      ),
    ).not.toBeInTheDocument();
  });

  it('times out recovery when a profile status request never settles', async () => {
    jest.useFakeTimers();
    let profileReads = 0;
    global.fetch = jest.fn(() => {
      profileReads += 1;
      if (profileReads === 1) {
        return Promise.resolve(
          jsonOk(
            profileResponse({
              resume_pdf_ref: 'resumes/user/master.pdf',
              resume_parse_status: 'processing',
            }),
          ),
        );
      }

      return new Promise<Response>(() => undefined);
    }) as unknown as typeof fetch;

    renderWizard();
    expect(
      await screen.findByText(
        'Uploading and extracting your resume… This can take up to five minutes.',
      ),
    ).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(312_000);
      await Promise.resolve();
    });

    expect(
      screen.getByText(
        'Resume extraction is taking longer than expected. Select the PDF again to retry.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('PDF resume')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('keeps the selected file retryable after an active upload times out', async () => {
    jest.useFakeTimers();
    let profileReads = 0;
    let rejectUpload: ((error: Error) => void) | undefined;
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = String(input).replace(ANANSI_API_URL, '');
      if (method === 'GET' && path === '/v1/profile') {
        profileReads += 1;
        return profileReads === 1
          ? Promise.resolve(jsonOk(profileResponse()))
          : new Promise<Response>(() => undefined);
      }
      if (method === 'POST' && path === '/v1/resume') {
        return new Promise<ReturnType<typeof jsonOk>>((_, reject) => {
          rejectUpload = reject;
        });
      }
      throw new Error(`Unmocked ANANSI fetch: ${method} ${path}`);
    }) as unknown as typeof fetch;

    renderWizard();
    const input = await screen.findByLabelText('PDF resume');
    fireEvent.change(input, {
      target: {
        files: [
          new File(['%PDF-1.7'], 'resume.pdf', {
            type: 'application/pdf',
          }),
        ],
      },
    });
    expect(
      await screen.findByText(
        'Uploading and extracting your resume… This can take up to five minutes.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(rejectUpload).toBeDefined());
    await act(async () => {
      rejectUpload?.(new TypeError('Failed to fetch'));
      await Promise.resolve();
    });

    await act(async () => {
      jest.advanceTimersByTime(312_000);
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: 'Retry upload' })).toBeEnabled();
  });

  it('accepts existing upload completion after a timed-out retry gets HTTP 409', async () => {
    jest.useFakeTimers();
    let profileReads = 0;
    let resumePosts = 0;
    let rejectFirstUpload: ((error: Error) => void) | undefined;
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = String(input).replace(ANANSI_API_URL, '');
      if (method === 'GET' && path === '/v1/profile') {
        profileReads += 1;
        if (profileReads === 1) {
          return Promise.resolve(jsonOk(profileResponse()));
        }
        if (profileReads === 2) {
          return Promise.resolve(
            jsonOk(
              profileResponse(
                {
                  resume_pdf_ref: 'resumes/user/master.pdf',
                  resume_parse_status: 'processing',
                },
                1,
              ),
            ),
          );
        }
        if (profileReads === 3) {
          return new Promise<Response>(() => undefined);
        }
        return Promise.resolve(
          jsonOk(
            profileResponse(
              {
                resume_pdf_ref: 'resumes/user/master.pdf',
                resume_parse_status: 'ready',
                cv_parsed: { summary: 'Senior SRE' },
              },
              2,
            ),
          ),
        );
      }
      if (method === 'POST' && path === '/v1/resume') {
        resumePosts += 1;
        if (resumePosts === 1) {
          return new Promise<ReturnType<typeof jsonOk>>((_, reject) => {
            rejectFirstUpload = reject;
          });
        }
        return Promise.resolve(
          jsonError(409, {
            detail: 'resume upload already in progress; wait for it to finish',
          }),
        );
      }
      throw new Error(`Unmocked ANANSI fetch: ${method} ${path}`);
    }) as unknown as typeof fetch;

    renderWizard();
    const input = await screen.findByLabelText('PDF resume');
    fireEvent.change(input, {
      target: {
        files: [
          new File(['%PDF-1.7'], 'resume.pdf', {
            type: 'application/pdf',
          }),
        ],
      },
    });
    await waitFor(() => expect(rejectFirstUpload).toBeDefined());
    await act(async () => {
      rejectFirstUpload?.(new TypeError('Failed to fetch'));
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(1_500);
      await Promise.resolve();
    });
    expect(profileReads).toBe(2);
    await act(async () => {
      jest.advanceTimersByTime(312_000);
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry upload' }));
    await waitFor(() => expect(resumePosts).toBe(2));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(1_500);
      await Promise.resolve();
    });

    expect(profileReads).toBe(4);
    expect(screen.getByText('Resume received')).toBeInTheDocument();
  });

  it('shows a retryable saved-resume extraction failure after reload', async () => {
    mockFetchRouter({
      'GET /v1/profile': [
        jsonOk(
          profileResponse({
            resume_pdf_ref: 'resumes/user/master.pdf',
            resume_parse_status: 'failed',
          }),
        ),
      ],
    });

    renderWizard();

    expect(
      await screen.findByText(
        'Resume was saved, but fact extraction failed. Select the PDF again to retry.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('PDF resume')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('accepts a nonblank legacy resume markdown document', async () => {
    mockFetchRouter({
      'GET /v1/profile': [jsonOk(profileResponse({ cv_markdown: '# Resume' }))],
    });

    renderWizard();

    expect(await screen.findByText('Resume received')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('accepts a parsed legacy resume without a parse status', async () => {
    mockFetchRouter({
      'GET /v1/profile': [
        jsonOk(
          profileResponse({
            resume_pdf_ref: 'resumes/user/master.pdf',
            cv_parsed: { summary: 'Senior SRE' },
          }),
        ),
      ],
    });

    renderWizard();

    expect(await screen.findByText('Resume received')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('rejects a legacy resume with a blank PDF reference', async () => {
    mockFetchRouter({
      'GET /v1/profile': [
        jsonOk(
          profileResponse({
            resume_pdf_ref: '   ',
            cv_parsed: { summary: 'Senior SRE' },
          }),
        ),
      ],
    });

    renderWizard();

    expect(await screen.findByLabelText('PDF resume')).toBeEnabled();
    expect(screen.queryByText('Resume received')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('rejects a legacy resume without a nonblank parsed summary', async () => {
    mockFetchRouter({
      'GET /v1/profile': [
        jsonOk(
          profileResponse({
            resume_pdf_ref: 'resumes/user/master.pdf',
            cv_parsed: { summary: '   ' },
          }),
        ),
      ],
    });

    renderWizard();

    expect(await screen.findByLabelText('PDF resume')).toBeEnabled();
    expect(screen.queryByText('Resume received')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('rejects an explicit ready state without a nonblank parsed summary', async () => {
    mockFetchRouter({
      'GET /v1/profile': [
        jsonOk(
          profileResponse({
            resume_pdf_ref: 'resumes/user/master.pdf',
            resume_parse_status: 'ready',
            cv_parsed: { summary: '   ' },
          }),
        ),
      ],
    });

    renderWizard();

    expect(await screen.findByLabelText('PDF resume')).toBeEnabled();
    expect(screen.queryByText('Resume received')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('rejects an unknown explicit parse state even with a parsed summary', async () => {
    mockFetchRouter({
      'GET /v1/profile': [
        jsonOk(
          profileResponse({
            resume_pdf_ref: 'resumes/user/master.pdf',
            resume_parse_status: 'unknown',
            cv_parsed: { summary: 'Senior SRE' },
          }),
        ),
      ],
    });

    renderWizard();

    expect(await screen.findByLabelText('PDF resume')).toBeEnabled();
    expect(screen.queryByText('Resume received')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
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

    const uploadCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith('/v1/resume'),
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

  it('keeps one resume upload active and shows extraction progress', async () => {
    let resolveUpload:
      | ((response: ReturnType<typeof jsonOk>) => void)
      | undefined;
    const fetchMock = jest.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const path = String(input).replace(ANANSI_API_URL, '');
        if (method === 'GET' && path === '/v1/profile') {
          return Promise.resolve(jsonOk(profileResponse()));
        }
        if (method === 'POST' && path === '/v1/resume') {
          return new Promise<ReturnType<typeof jsonOk>>((resolve) => {
            resolveUpload = resolve;
          });
        }
        throw new Error(`Unmocked ANANSI fetch: ${method} ${path}`);
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    renderWizard();
    const input = await screen.findByLabelText('PDF resume');
    const firstFile = new File(['%PDF-1.7 first'], 'first.pdf', {
      type: 'application/pdf',
    });
    const secondFile = new File(['%PDF-1.7 second'], 'second.pdf', {
      type: 'application/pdf',
    });

    fireEvent.change(input, { target: { files: [firstFile] } });
    fireEvent.change(input, { target: { files: [secondFile] } });

    expect(
      await screen.findByText(
        'Uploading and extracting your resume… This can take up to five minutes.',
      ),
    ).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(
      fetchMock.mock.calls.filter(
        ([request, options]) =>
          String(request).endsWith('/v1/resume') && options?.method === 'POST',
      ),
    ).toHaveLength(1);

    await act(async () => {
      resolveUpload?.(jsonOk({ ok: true, profile_version: 1, parsed: null }));
    });
  });

  it('shows the safe resume upload error detail returned by Core', async () => {
    mockFetchRouter({
      'GET /v1/profile': [jsonOk(profileResponse())],
      'POST /v1/resume': [
        jsonError(422, {
          detail: 'could not extract any text from this PDF',
        }),
      ],
    });

    renderWizard();
    const file = new File(['%PDF-1.7'], 'empty.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(await screen.findByLabelText('PDF resume'), {
      target: { files: [file] },
    });

    expect(
      await screen.findByText('could not extract any text from this PDF'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Couldn't upload your resume. Please try again."),
    ).not.toBeInTheDocument();
  });

  it('shows capacity-full immediately instead of polling an upload that never started', async () => {
    const detail = 'resume upload capacity is full; try again later';
    mockFetchRouter({
      'GET /v1/profile': [jsonOk(profileResponse())],
      'POST /v1/resume': [jsonError(503, { detail })],
    });

    renderWizard();
    const input = await screen.findByLabelText('PDF resume');
    fireEvent.change(input, {
      target: {
        files: [
          new File(['%PDF-1.7'], 'resume.pdf', {
            type: 'application/pdf',
          }),
        ],
      },
    });

    expect(await screen.findByText(detail)).toBeInTheDocument();
    expect(input).toBeEnabled();
    expect(
      screen.queryByText(
        'Uploading and extracting your resume… This can take up to five minutes.',
      ),
    ).not.toBeInTheDocument();
  });

  it('recovers durable resume state after an interrupted upload response', async () => {
    jest.useFakeTimers();
    let profileReads = 0;
    let rejectUpload: ((error: Error) => void) | undefined;
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = String(input).replace(ANANSI_API_URL, '');
      if (method === 'GET' && path === '/v1/profile') {
        profileReads += 1;
        return Promise.resolve(
          jsonOk(
            profileResponse(
              profileReads === 1
                ? {}
                : {
                    resume_pdf_ref: 'resumes/user/master.pdf',
                    resume_parse_status: 'ready',
                    cv_parsed: { summary: 'Senior SRE' },
                  },
              profileReads === 1 ? null : 2,
            ),
          ),
        );
      }
      if (method === 'POST' && path === '/v1/resume') {
        return new Promise<ReturnType<typeof jsonOk>>((_, reject) => {
          rejectUpload = reject;
        });
      }
      throw new Error(`Unmocked ANANSI fetch: ${method} ${path}`);
    }) as unknown as typeof fetch;

    renderWizard();
    const input = await screen.findByLabelText('PDF resume');
    fireEvent.change(input, {
      target: {
        files: [
          new File(['%PDF-1.7'], 'resume.pdf', {
            type: 'application/pdf',
          }),
        ],
      },
    });
    await waitFor(() => expect(rejectUpload).toBeDefined());

    await act(async () => {
      rejectUpload?.(new TypeError('Failed to fetch'));
      await Promise.resolve();
    });

    expect(input).toBeDisabled();
    expect(
      screen.queryByText("Couldn't upload your resume. Please try again."),
    ).not.toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(1_500);
      await Promise.resolve();
    });
    expect(await screen.findByText('Resume received')).toBeInTheDocument();
  });

  it('does not accept an old ready profile after an interrupted replacement upload', async () => {
    jest.useFakeTimers();
    let profileReads = 0;
    let rejectUpload: ((error: Error) => void) | undefined;
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = String(input).replace(ANANSI_API_URL, '');
      if (method === 'GET' && path === '/v1/profile') {
        profileReads += 1;
        return Promise.resolve(
          jsonOk(
            profileResponse({
              resume_pdf_ref: 'resumes/user/old.pdf',
              resume_parse_status: 'ready',
              cv_parsed: { summary: 'Old resume' },
            }),
          ),
        );
      }
      if (method === 'POST' && path === '/v1/resume') {
        return new Promise<ReturnType<typeof jsonOk>>((_, reject) => {
          rejectUpload = reject;
        });
      }
      throw new Error(`Unmocked ANANSI fetch: ${method} ${path}`);
    }) as unknown as typeof fetch;

    renderWizard();
    await screen.findByText('Resume received');
    const input = screen.getByLabelText('PDF resume');
    fireEvent.change(input, {
      target: {
        files: [
          new File(['%PDF-1.7 replacement'], 'replacement.pdf', {
            type: 'application/pdf',
          }),
        ],
      },
    });
    expect(
      await screen.findByText(
        'Uploading and extracting your resume… This can take up to five minutes.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(rejectUpload).toBeDefined());
    await act(async () => {
      rejectUpload?.(new TypeError('Failed to fetch'));
      await Promise.resolve();
    });

    await act(async () => {
      jest.advanceTimersByTime(1_500);
      await Promise.resolve();
    });

    expect(profileReads).toBe(2);
    expect(screen.queryByText('Resume received')).not.toBeInTheDocument();
    expect(input).toBeDisabled();
  });

  it('recovers durable resume state after an upload-in-progress response', async () => {
    jest.useFakeTimers();
    let profileReads = 0;
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = String(input).replace(ANANSI_API_URL, '');
      if (method === 'GET' && path === '/v1/profile') {
        profileReads += 1;
        return Promise.resolve(
          jsonOk(
            profileResponse(
              profileReads === 1
                ? {}
                : {
                    resume_pdf_ref: 'resumes/user/master.pdf',
                    resume_parse_status: 'ready',
                    cv_parsed: { summary: 'Senior SRE' },
                  },
              profileReads === 1 ? null : 2,
            ),
          ),
        );
      }
      if (method === 'POST' && path === '/v1/resume') {
        return Promise.resolve(
          jsonError(409, {
            detail: 'resume upload already in progress; wait for it to finish',
          }),
        );
      }
      throw new Error(`Unmocked ANANSI fetch: ${method} ${path}`);
    }) as unknown as typeof fetch;

    renderWizard();
    const input = await screen.findByLabelText('PDF resume');
    fireEvent.change(input, {
      target: {
        files: [
          new File(['%PDF-1.7'], 'resume.pdf', {
            type: 'application/pdf',
          }),
        ],
      },
    });
    await waitFor(() => expect(input).toBeDisabled());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      jest.advanceTimersByTime(1_500);
      await Promise.resolve();
    });
    expect(await screen.findByText('Resume received')).toBeInTheDocument();
  });

  it('keeps a resume upload through same-session token rotation', async () => {
    const initialAccessToken = makeAccessToken('initial');
    const rotatedAccessToken = makeAccessToken('rotated');
    setTokenPair(initialAccessToken);
    let resolveUpload:
      | ((response: ReturnType<typeof jsonOk>) => void)
      | undefined;
    let rotatedProfileReads = 0;
    const fetchMock = jest.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const path = String(input).replace(ANANSI_API_URL, '');
        const authorization = (
          init?.headers as Record<string, string> | undefined
        )?.Authorization;
        if (method === 'GET' && path === '/v1/profile') {
          if (authorization === `Bearer ${initialAccessToken}`) {
            return Promise.resolve(jsonOk(profileResponse()));
          }
          if (authorization === `Bearer ${rotatedAccessToken}`) {
            rotatedProfileReads += 1;
            return Promise.resolve(
              jsonOk(
                rotatedProfileReads === 1
                  ? profileResponse()
                  : profileResponse({
                      resume_pdf_ref: 'resumes/user/master.pdf',
                      resume_parse_status: 'ready',
                      cv_parsed: { summary: 'Senior SRE' },
                      target_roles: ['Senior SRE'],
                    }),
              ),
            );
          }
        }
        if (
          method === 'POST' &&
          path === '/v1/resume' &&
          authorization === `Bearer ${initialAccessToken}`
        ) {
          return new Promise<ReturnType<typeof jsonOk>>((resolve) => {
            resolveUpload = resolve;
          });
        }
        throw new Error(`Unmocked ANANSI fetch: ${method} ${path}`);
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    renderWizard();
    const input = await screen.findByLabelText('PDF resume');
    fireEvent.change(input, {
      target: {
        files: [
          new File(['%PDF-1.7'], 'resume.pdf', {
            type: 'application/pdf',
          }),
        ],
      },
    });
    await waitFor(() => expect(resolveUpload).toBeDefined());

    act(() => setTokenPair(rotatedAccessToken));
    await waitFor(() => expect(rotatedProfileReads).toBe(1));
    expect(input).toBeDisabled();

    await act(async () => {
      resolveUpload?.(jsonOk({ ok: true, profile_version: 1, parsed: null }));
    });

    await screen.findByText(/Resume received/u);
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    expect(rotatedProfileReads).toBe(2);
  });

  it('keeps a successful upload ready when an older profile read reports failed', async () => {
    const initialAccessToken = makeAccessToken('initial');
    const rotatedAccessToken = makeAccessToken('rotated');
    setTokenPair(initialAccessToken);
    let resolveUpload:
      | ((response: ReturnType<typeof jsonOk>) => void)
      | undefined;
    let resolveStaleProfile:
      | ((response: ReturnType<typeof jsonOk>) => void)
      | undefined;
    let rejectRefreshedProfile: ((error: Error) => void) | undefined;
    let rotatedProfileReads = 0;
    const fetchMock = jest.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const path = String(input).replace(ANANSI_API_URL, '');
        const authorization = (
          init?.headers as Record<string, string> | undefined
        )?.Authorization;
        if (
          method === 'GET' &&
          path === '/v1/profile' &&
          authorization === `Bearer ${initialAccessToken}`
        ) {
          return Promise.resolve(jsonOk(profileResponse()));
        }
        if (
          method === 'GET' &&
          path === '/v1/profile' &&
          authorization === `Bearer ${rotatedAccessToken}`
        ) {
          rotatedProfileReads += 1;
          if (rotatedProfileReads === 1) {
            return new Promise<ReturnType<typeof jsonOk>>((resolve) => {
              resolveStaleProfile = resolve;
            });
          }
          return new Promise<ReturnType<typeof jsonOk>>((_, reject) => {
            rejectRefreshedProfile = reject;
          });
        }
        if (
          method === 'POST' &&
          path === '/v1/resume' &&
          authorization === `Bearer ${initialAccessToken}`
        ) {
          return new Promise<ReturnType<typeof jsonOk>>((resolve) => {
            resolveUpload = resolve;
          });
        }
        throw new Error(`Unmocked ANANSI fetch: ${method} ${path}`);
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    renderWizard();
    const input = await screen.findByLabelText('PDF resume');
    fireEvent.change(input, {
      target: {
        files: [
          new File(['%PDF-1.7'], 'resume.pdf', {
            type: 'application/pdf',
          }),
        ],
      },
    });
    await waitFor(() => expect(resolveUpload).toBeDefined());

    act(() => setTokenPair(rotatedAccessToken));
    await waitFor(() => expect(resolveStaleProfile).toBeDefined());

    await act(async () => {
      resolveUpload?.(jsonOk({ ok: true, profile_version: 1, parsed: null }));
      await Promise.resolve();
    });
    await waitFor(() => expect(rejectRefreshedProfile).toBeDefined());

    await act(async () => {
      resolveStaleProfile?.(
        jsonOk(
          profileResponse({
            resume_pdf_ref: 'resumes/user/master.pdf',
            resume_parse_status: 'failed',
          }),
        ),
      );
      rejectRefreshedProfile?.(new Error('profile unavailable'));
      await Promise.resolve();
    });

    expect(
      await screen.findByText('Resume received — resume.pdf'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('ignores an old resume upload after the signed-in identity changes', async () => {
    let resolveOldUpload:
      | ((response: ReturnType<typeof jsonOk>) => void)
      | undefined;
    const fetchMock = jest.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const path = String(input).replace(ANANSI_API_URL, '');
        const authorization = (
          init?.headers as Record<string, string> | undefined
        )?.Authorization;
        if (method === 'GET' && path === '/v1/profile') {
          return Promise.resolve(jsonOk(profileResponse()));
        }
        if (
          method === 'POST' &&
          path === '/v1/resume' &&
          authorization === `Bearer ${ACCESS_TOKEN}`
        ) {
          return new Promise<ReturnType<typeof jsonOk>>((resolve) => {
            resolveOldUpload = resolve;
          });
        }
        throw new Error(`Unmocked ANANSI fetch: ${method} ${path}`);
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    renderWizard();
    fireEvent.change(await screen.findByLabelText('PDF resume'), {
      target: {
        files: [
          new File(['%PDF-1.7'], 'old-user.pdf', {
            type: 'application/pdf',
          }),
        ],
      },
    });
    await waitFor(() => expect(resolveOldUpload).toBeDefined());

    act(() => setTokenPair('replacement-access-token'));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) =>
            String(input).endsWith('/v1/profile') &&
            (init?.headers as Record<string, string> | undefined)
              ?.Authorization === 'Bearer replacement-access-token',
        ),
      ).toHaveLength(1),
    );
    await act(async () => {
      resolveOldUpload?.(
        jsonOk({ ok: true, profile_version: 1, parsed: null }),
      );
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.queryByText(/Resume received/u)).not.toBeInTheDocument();
  });

  it('ignores a pending profile response after the signed-in identity changes', async () => {
    let resolveOldProfile:
      | ((response: ReturnType<typeof jsonOk>) => void)
      | undefined;
    const fetchMock = jest.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input).replace(ANANSI_API_URL, '');
        if (path !== '/v1/profile') {
          throw new Error(`Unmocked ANANSI fetch: ${path}`);
        }
        const authorization = (
          init?.headers as Record<string, string> | undefined
        )?.Authorization;
        if (authorization === `Bearer ${ACCESS_TOKEN}`) {
          return new Promise<ReturnType<typeof jsonOk>>((resolve) => {
            resolveOldProfile = resolve;
          });
        }
        if (authorization === 'Bearer replacement-access-token') {
          return Promise.resolve(jsonOk(profileResponse()));
        }
        throw new Error(`Unexpected authorization: ${authorization}`);
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    renderWizard();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => setTokenPair('replacement-access-token'));

    await screen.findByLabelText('PDF resume');
    const nextButton = screen.getByRole('button', { name: 'Next' });
    expect(nextButton).toBeDisabled();

    await act(async () => {
      resolveOldProfile?.(
        jsonOk(
          profileResponse({
            resume_pdf_ref: 'resumes/old-user/master.pdf',
            target_roles: ['Old User Role'],
          }),
        ),
      );
    });

    expect(nextButton).toBeDisabled();
    expect(screen.queryByText(/Resume received/u)).not.toBeInTheDocument();
  });

  it('clears loaded onboarding data when the signed-in identity changes', async () => {
    let resolveReplacementProfile:
      | ((response: ReturnType<typeof jsonOk>) => void)
      | undefined;
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path !== '/v1/profile') {
        throw new Error(`Unmocked ANANSI fetch: ${path}`);
      }
      const authorization = (
        init?.headers as Record<string, string> | undefined
      )?.Authorization;
      if (authorization === `Bearer ${ACCESS_TOKEN}`) {
        return Promise.resolve(
          jsonOk(
            profileResponse({
              resume_pdf_ref: 'resumes/old-user/master.pdf',
              target_roles: ['Old User Role'],
            }),
          ),
        );
      }
      if (authorization === 'Bearer replacement-access-token') {
        return new Promise<ReturnType<typeof jsonOk>>((resolve) => {
          resolveReplacementProfile = resolve;
        });
      }
      throw new Error(`Unexpected authorization: ${authorization}`);
    }) as unknown as typeof fetch;

    renderWizard();
    await screen.findByText(/Resume received/u);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Old User Role');

    act(() => setTokenPair('replacement-access-token'));
    await waitFor(() => expect(resolveReplacementProfile).toBeDefined());

    expect(screen.getByText('Add your resume')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.queryByText('Old User Role')).not.toBeInTheDocument();
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

  it('finishes a role save through same-session token rotation', async () => {
    const initialAccessToken = makeAccessToken('initial-role-save');
    const rotatedAccessToken = makeAccessToken('rotated-role-save');
    setTokenPair(initialAccessToken);
    let resolveRoleSave:
      | ((response: ReturnType<typeof jsonOk>) => void)
      | undefined;
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = String(input).replace(ANANSI_API_URL, '');
      if (method === 'GET' && path === '/v1/profile') {
        return Promise.resolve(
          jsonOk(
            profileResponse({
              resume_pdf_ref: 'resumes/user/master.pdf',
              resume_parse_status: 'ready',
              cv_parsed: { summary: 'Senior SRE' },
            }),
          ),
        );
      }
      if (method === 'PATCH' && path === '/v1/profile') {
        return new Promise<ReturnType<typeof jsonOk>>((resolve) => {
          resolveRoleSave = resolve;
        });
      }
      throw new Error(`Unmocked ANANSI fetch: ${method} ${path}`);
    }) as unknown as typeof fetch;

    renderWizard();
    await screen.findByText(/Resume received/u);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByLabelText('Role or job title'), {
      target: { value: 'Platform Engineer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(resolveRoleSave).toBeDefined());

    act(() => setTokenPair(rotatedAccessToken));
    await act(async () => {
      resolveRoleSave?.(
        jsonOk(
          profileResponse({
            resume_pdf_ref: 'resumes/user/master.pdf',
            resume_parse_status: 'ready',
            cv_parsed: { summary: 'Senior SRE' },
            target_roles: ['Platform Engineer'],
          }),
        ),
      );
      await Promise.resolve();
    });

    expect(
      await screen.findByText('How do you want to work?'),
    ).toBeInTheDocument();
  });

  it('does not advance from an old role save after the signed-in identity changes', async () => {
    let resolveOldRoleSave:
      | ((response: ReturnType<typeof jsonOk>) => void)
      | undefined;
    const fetchMock = jest.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const path = String(input).replace(ANANSI_API_URL, '');
        const authorization = (
          init?.headers as Record<string, string> | undefined
        )?.Authorization;
        if (method === 'GET' && path === '/v1/profile') {
          return Promise.resolve(
            jsonOk(
              authorization === `Bearer ${ACCESS_TOKEN}`
                ? profileResponse({
                    resume_pdf_ref: 'resumes/user/master.pdf',
                  })
                : profileResponse(),
            ),
          );
        }
        if (
          method === 'PATCH' &&
          path === '/v1/profile' &&
          authorization === `Bearer ${ACCESS_TOKEN}`
        ) {
          return new Promise<ReturnType<typeof jsonOk>>((resolve) => {
            resolveOldRoleSave = resolve;
          });
        }
        throw new Error(`Unmocked ANANSI fetch: ${method} ${path}`);
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    renderWizard();
    await screen.findByText(/Resume received/u);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByLabelText('Role or job title'), {
      target: { value: 'Old User Role' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(resolveOldRoleSave).toBeDefined());

    act(() => setTokenPair('replacement-access-token'));
    await act(async () => {
      resolveOldRoleSave?.(
        jsonOk(
          profileResponse({
            resume_pdf_ref: 'resumes/old-user/master.pdf',
            target_roles: ['Old User Role'],
          }),
        ),
      );
      await Promise.resolve();
    });

    expect(screen.getByText('Add your resume')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(
      screen.queryByText('How do you want to work?'),
    ).not.toBeInTheDocument();
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
        if (
          key.includes('/v1/policy') ||
          key.includes('/v1/me') ||
          key.includes('/v1/onboarding')
        ) {
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
        stepHistoryEffect: 'clearAfterIrreversibleStep',
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

  it('finishes through same-session token rotation', async () => {
    const initialAccessToken = makeAccessToken('initial-finish');
    const rotatedAccessToken = makeAccessToken('rotated-finish');
    setTokenPair(initialAccessToken);
    let resolvePolicy:
      | ((response: ReturnType<typeof jsonOk>) => void)
      | undefined;
    const calls: Array<{ key: string; authorization?: string }> = [];
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = String(input).replace(ANANSI_API_URL, '');
      const authorization = (
        init?.headers as Record<string, string> | undefined
      )?.Authorization;
      calls.push({ key: `${method} ${path}`, authorization });
      if (method === 'GET' && path === '/v1/profile') {
        return Promise.resolve(
          jsonOk(
            profileResponse({
              resume_pdf_ref: 'resumes/user/master.pdf',
              resume_parse_status: 'ready',
              cv_parsed: { summary: 'Senior SRE' },
              target_roles: ['SRE'],
            }),
          ),
        );
      }
      if (method === 'PATCH' && path === '/v1/profile') {
        return Promise.resolve(
          jsonOk(
            profileResponse({
              resume_pdf_ref: 'resumes/user/master.pdf',
              resume_parse_status: 'ready',
              cv_parsed: { summary: 'Senior SRE' },
              target_roles: ['SRE'],
            }),
          ),
        );
      }
      if (method === 'GET' && path === '/v1/policy') {
        return new Promise<ReturnType<typeof jsonOk>>((resolve) => {
          resolvePolicy = resolve;
        });
      }
      if (method === 'PUT' && path === '/v1/policy') {
        return Promise.resolve(jsonOk(policyResponse()));
      }
      if (method === 'PATCH' && path === '/v1/me') {
        return Promise.resolve(jsonOk(meResponse()));
      }
      if (method === 'POST' && path === '/v1/onboarding/complete') {
        return Promise.resolve(jsonOk({ mode: 'live', already: false }));
      }
      throw new Error(`Unmocked ANANSI fetch: ${method} ${path}`);
    }) as unknown as typeof fetch;

    renderWizard([completeWizardMock()]);
    await continueToFinish();
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() => expect(resolvePolicy).toBeDefined());

    act(() => setTokenPair(rotatedAccessToken));
    await act(async () => {
      resolvePolicy?.(jsonOk(policyResponse()));
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(mockSetNextOnboardingStatus).toHaveBeenCalledWith({
        stepHistoryEffect: 'clearAfterIrreversibleStep',
      }),
    );
    for (const key of [
      'PUT /v1/policy',
      'PATCH /v1/me',
      'POST /v1/onboarding/complete',
    ]) {
      expect(calls.find((call) => call.key === key)?.authorization).toBe(
        `Bearer ${rotatedAccessToken}`,
      );
    }
  });

  it('aborts Finish when the signed-in identity changes', async () => {
    let resolveOldPolicy:
      | ((response: ReturnType<typeof jsonOk>) => void)
      | undefined;
    const calls: string[] = [];
    const fetchMock = jest.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const path = String(input).replace(ANANSI_API_URL, '');
        const authorization = (
          init?.headers as Record<string, string> | undefined
        )?.Authorization;
        calls.push(`${method} ${path} ${authorization}`);
        if (method === 'GET' && path === '/v1/profile') {
          return Promise.resolve(
            jsonOk(
              authorization === `Bearer ${ACCESS_TOKEN}`
                ? profileResponse({
                    resume_pdf_ref: 'resumes/user/master.pdf',
                    target_roles: ['SRE'],
                  })
                : profileResponse(),
            ),
          );
        }
        if (
          method === 'PATCH' &&
          path === '/v1/profile' &&
          authorization === `Bearer ${ACCESS_TOKEN}`
        ) {
          return Promise.resolve(
            jsonOk(
              profileResponse({
                resume_pdf_ref: 'resumes/user/master.pdf',
                target_roles: ['SRE'],
              }),
            ),
          );
        }
        if (
          method === 'GET' &&
          path === '/v1/policy' &&
          authorization === `Bearer ${ACCESS_TOKEN}`
        ) {
          return new Promise<ReturnType<typeof jsonOk>>((resolve) => {
            resolveOldPolicy = resolve;
          });
        }
        if (method === 'PUT' && path === '/v1/policy') {
          return Promise.resolve(jsonOk(policyResponse()));
        }
        if (method === 'PATCH' && path === '/v1/me') {
          return Promise.resolve(jsonOk(meResponse()));
        }
        if (method === 'POST' && path === '/v1/onboarding/complete') {
          return Promise.resolve(jsonOk({ mode: 'live', already: false }));
        }
        throw new Error(`Unmocked ANANSI fetch: ${method} ${path}`);
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    renderWizard([completeWizardMock()]);
    await continueToFinish();
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() => expect(resolveOldPolicy).toBeDefined());

    act(() => setTokenPair('replacement-access-token'));
    await waitFor(() =>
      expect(
        calls.filter((call) =>
          call.includes('GET /v1/profile Bearer replacement-access-token'),
        ),
      ).toHaveLength(1),
    );
    await act(async () => {
      resolveOldPolicy?.(jsonOk(policyResponse()));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(calls.some((call) => call.startsWith('PUT /v1/policy'))).toBe(false);
    expect(calls.some((call) => call.startsWith('PATCH /v1/me'))).toBe(false);
    expect(
      calls.some((call) => call.startsWith('POST /v1/onboarding/complete')),
    ).toBe(false);
    expect(mockSetNextOnboardingStatus).not.toHaveBeenCalled();
    expect(screen.getByText('Add your resume')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('never sends a replacement identity bearer from an older Finish request', async () => {
    let resolveOldPolicy:
      | ((response: ReturnType<typeof jsonOk>) => void)
      | undefined;
    const replacementAccessToken = 'replacement-access-token';
    const calls: Array<{ key: string; authorization?: string }> = [];
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = String(input).replace(ANANSI_API_URL, '');
      const authorization = (
        init?.headers as Record<string, string> | undefined
      )?.Authorization;
      calls.push({ key: `${method} ${path}`, authorization });
      if (method === 'GET' && path === '/v1/profile') {
        return Promise.resolve(
          jsonOk(
            authorization === `Bearer ${ACCESS_TOKEN}`
              ? profileResponse({
                  resume_pdf_ref: 'resumes/user/master.pdf',
                  target_roles: ['SRE'],
                })
              : profileResponse(),
          ),
        );
      }
      if (method === 'PATCH' && path === '/v1/profile') {
        return Promise.resolve(
          jsonOk(
            profileResponse({
              resume_pdf_ref: 'resumes/user/master.pdf',
              target_roles: ['SRE'],
            }),
          ),
        );
      }
      if (method === 'GET' && path === '/v1/policy') {
        return new Promise<ReturnType<typeof jsonOk>>((resolve) => {
          resolveOldPolicy = resolve;
        });
      }
      if (method === 'PUT' && path === '/v1/policy') {
        return Promise.resolve(jsonOk(policyResponse()));
      }
      throw new Error(`Unmocked ANANSI fetch: ${method} ${path}`);
    }) as unknown as typeof fetch;

    renderWizard([completeWizardMock()]);
    await continueToFinish();
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() => expect(resolveOldPolicy).toBeDefined());

    await act(async () => {
      setTokenPair(replacementAccessToken);
      resolveOldPolicy?.(jsonOk(policyResponse()));
      await Promise.resolve();
    });

    expect(
      calls.some(
        (call) =>
          call.key === 'PUT /v1/policy' &&
          call.authorization === `Bearer ${replacementAccessToken}`,
      ),
    ).toBe(false);
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
        if (
          key.includes('/v1/policy') ||
          key.includes('/v1/me') ||
          key.includes('/v1/onboarding')
        ) {
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
