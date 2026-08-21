import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import { dynamicActivate } from '~/utils/i18n/dynamicActivate';
import { AnansiProfilePage } from '~/pages/anansi/AnansiProfilePage';

// ANANSI PATCH (WS-B): the real Select is a full dropdown/portal component
// (Dropdown + SelectableList + jotai component state) that needs its own
// dedicated test coverage elsewhere -- here it's swapped for a plain native
// <select>, same "mock the heavy child" pattern AiChatPage.test.tsx uses for
// AiChatPageHeader/AiChatTab, so this spec stays a fast, self-contained unit
// test of AnansiProfilePage's own data flow rather than Select's internals.
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

const buildMeResponse = (overrides: Record<string, unknown> = {}) => ({
  email: 'jane.doe@example.com',
  timezone: 'America/New_York',
  awake_hours: { start: '09:00', end: '18:00' },
  mode: 'shadow',
  ...overrides,
});

const buildPolicyResponse = (
  policyOverrides: Record<string, unknown> = {},
  version = 3,
) => ({
  version,
  policy: {
    automation: {
      applications: 2,
      replies: 1,
      negotiation: 1,
      prescreen: 1,
      scheduling: 1,
      outreach: 1,
    },
    remote_only: true,
    relocation: false,
    education_on_resume: true,
    rate_floor: 85,
    ...policyOverrides,
  },
});

const jsonOk = (body: unknown) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
});

const jsonError = (status = 500) => ({
  ok: false,
  status,
  json: () => Promise.resolve({}),
});

type MockResponse = ReturnType<typeof jsonOk> | ReturnType<typeof jsonError>;

// Dispatches by "<METHOD> <path>" instead of call order, so GET /v1/me and
// GET /v1/policy (fired together via Promise.all, order not load-bearing)
// don't have to line up sequentially, and each endpoint queues independently.
const mockFetchRouter = (responses: Record<string, MockResponse[]>) => {
  const fetchMock = jest.fn(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = url.replace(ANANSI_API_URL, '');
      const key = `${method} ${path}`;
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

const renderPage = () =>
  render(
    <JotaiProvider store={jotaiStore}>
      <MemoryRouter>
        <ThemeProvider colorScheme="light">
          <I18nProvider i18n={i18n}>
            <AnansiProfilePage />
          </I18nProvider>
        </ThemeProvider>
      </MemoryRouter>
    </JotaiProvider>,
  );

describe('AnansiProfilePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetJotaiStore();
    setTokenPair();
  });

  it('renders all four sections from the mocked GET responses', async () => {
    mockFetchRouter({
      'GET /v1/me': [jsonOk(buildMeResponse())],
      'GET /v1/policy': [jsonOk(buildPolicyResponse())],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Autonomy')).toBeInTheDocument();
    });
    expect(screen.getByText('Resume')).toBeInTheDocument();
    expect(screen.getByText('Search')).toBeInTheDocument();
    expect(screen.getByText('Availability')).toBeInTheDocument();

    // Autonomy: applications is automation level 2 (on), replies is 1 (off).
    expect(screen.getByRole('switch', { name: 'Applications' })).toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'Replies' }),
    ).not.toBeChecked();

    // Resume + Search reflect the mocked policy document.
    expect(
      screen.getByRole('switch', { name: 'Include education on resume' }),
    ).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Remote only' })).toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'Open to relocation' }),
    ).not.toBeChecked();
    expect(screen.getByLabelText('Rate floor')).toHaveValue(85);

    // Availability reflects the mocked GET /v1/me.
    expect(screen.getByLabelText('Timezone')).toHaveValue('America/New_York');
    expect(screen.getByLabelText('Awake from')).toHaveValue('09:00');
    expect(screen.getByLabelText('Until')).toHaveValue('18:00');
  });

  it('scheduling row has no interactive control', async () => {
    mockFetchRouter({
      'GET /v1/me': [jsonOk(buildMeResponse())],
      'GET /v1/policy': [jsonOk(buildPolicyResponse())],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Scheduling')).toBeInTheDocument();
    });

    expect(screen.getByText('Always asks you')).toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: 'Scheduling' }),
    ).not.toBeInTheDocument();
  });

  it('flipping a toggle POSTs the chunk+level and reverts on a 500', async () => {
    const fetchMock = mockFetchRouter({
      'GET /v1/me': [jsonOk(buildMeResponse())],
      'GET /v1/policy': [jsonOk(buildPolicyResponse())],
      'POST /v1/automation/replies': [jsonError(500)],
    });

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: 'Replies' }),
      ).not.toBeChecked();
    });

    // Not wrapped in an async act() here on purpose: fireEvent already
    // flushes the synchronous optimistic update (fireEvent itself wraps in
    // a synchronous act()), and the assertion right below depends on
    // observing that transient "on" state *before* the failed POST's
    // microtask has a chance to revert it.
    fireEvent.click(screen.getByRole('switch', { name: 'Replies' }));

    expect(screen.getByRole('switch', { name: 'Replies' })).toBeChecked();
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/automation/replies`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ level: 2 }),
        headers: expect.objectContaining({
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        }),
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: 'Replies' }),
      ).not.toBeChecked();
    });
    expect(
      screen.getByText("Couldn't save. Please try again."),
    ).toBeInTheDocument();
  });

  it('saving the timezone PATCHes /v1/me', async () => {
    const fetchMock = mockFetchRouter({
      'GET /v1/me': [jsonOk(buildMeResponse())],
      'GET /v1/policy': [jsonOk(buildPolicyResponse())],
      'PATCH /v1/me': [jsonOk(buildMeResponse({ timezone: 'Europe/Berlin' }))],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Timezone')).toHaveValue(
        'America/New_York',
      );
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Timezone'), {
        target: { value: 'Europe/Berlin' },
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/me`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ timezone: 'Europe/Berlin' }),
      }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Timezone')).toHaveValue('Europe/Berlin');
    });
  });
});
