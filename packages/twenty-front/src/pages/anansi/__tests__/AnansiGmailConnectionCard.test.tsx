import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { ANANSI_GMAIL_OAUTH_COMPLETION_KEY } from '@/app/effect-components/CaptureAnansiGmailOAuthFragmentEffect';
import { ANANSI_API_URL } from '@/auth/constants/AnansiApiUrl';
import {
  ANANSI_GMAIL_ONBOARDING_RETURN_KEY,
  AnansiGmailConnectionCard,
} from '~/pages/anansi/AnansiGmailConnectionCard';
import { dynamicActivate } from '~/utils/i18n/dynamicActivate';

dynamicActivate(SOURCE_LOCALE);

const ACCESS_TOKEN = 'fake-access-token';
const authorizeUrl =
  'https://accounts.google.com/o/oauth2/auth?client_id=client-id';

const jsonOk = (body: unknown, status = 200) => ({
  ok: true,
  status,
  headers: new Headers(),
  json: () => Promise.resolve(body),
});

const jsonError = (status: number, body: unknown = {}) => ({
  ok: false,
  status,
  headers: new Headers(),
  json: () => Promise.resolve(body),
});

type MockResponse = ReturnType<typeof jsonOk> | ReturnType<typeof jsonError>;

const emptyStatus = {
  connections: [],
  primary_connection_id: null,
  main_application_email: null,
};

const connectedStatus = {
  connections: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      address: 'main@example.com',
      is_primary: true,
      state: 'ok',
      last_success_at: '2026-08-27T00:00:00Z',
      error_code: null,
    },
  ],
  primary_connection_id: '11111111-1111-4111-8111-111111111111',
  main_application_email: 'main@example.com',
};

const secondConnectionStatus = {
  connections: [
    ...connectedStatus.connections,
    {
      id: '22222222-2222-4222-8222-222222222222',
      address: 'other@example.com',
      is_primary: false,
      state: 'ok',
      last_success_at: null,
      error_code: null,
    },
  ],
  primary_connection_id: connectedStatus.primary_connection_id,
  main_application_email: connectedStatus.main_application_email,
};

const mockFetchRouter = (responses: Record<string, MockResponse[]>) => {
  const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = String(input).replace(ANANSI_API_URL, '');
    const key = `${method} ${path}`;
    const queue = responses[key];
    if (queue === undefined || queue.length === 0) {
      throw new Error(`Unmocked ANANSI fetch: ${key}`);
    }
    return Promise.resolve(queue.shift());
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

const renderCard = (
  props: Partial<React.ComponentProps<typeof AnansiGmailConnectionCard>> = {},
) => {
  const navigate = props.navigate ?? jest.fn();
  const result = render(
    <ThemeProvider colorScheme="light">
      <I18nProvider i18n={i18n}>
        <AnansiGmailConnectionCard
          accessToken={props.accessToken ?? ACCESS_TOKEN}
          returnTarget={props.returnTarget ?? 'profile'}
          beforeRedirect={props.beforeRedirect}
          onHealthyPrimaryChange={props.onHealthyPrimaryChange}
          navigate={navigate}
        />
      </I18nProvider>
    </ThemeProvider>,
  );

  return { ...result, navigate };
};

describe('AnansiGmailConnectionCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('saves onboarding drafts before starting first-account OAuth', async () => {
    const order: string[] = [];
    const beforeRedirect = jest.fn(async () => {
      order.push('save-drafts');
    });
    const fetchMock = mockFetchRouter({
      'GET /v1/connections/gmail/status': [jsonOk(emptyStatus)],
      'POST /v1/connections/gmail/oauth/start': [
        jsonOk({
          authorize_url: authorizeUrl,
          expires_at: '2026-08-27T00:10:00Z',
        }),
      ],
    });
    const navigate = jest.fn(() => order.push('navigate'));

    renderCard({
      returnTarget: 'onboarding',
      beforeRedirect,
      navigate,
    });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Connect Gmail' }),
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(authorizeUrl));
    expect(beforeRedirect).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['save-drafts', 'navigate']);
    expect(
      window.sessionStorage.getItem(ANANSI_GMAIL_ONBOARDING_RETURN_KEY),
    ).toBe('screen-7');
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/connections/gmail/oauth/start`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          return_target: 'onboarding',
          account_behavior: 'default_account',
        }),
      }),
    );
  });

  it('automatically completes a captured nonce and labels the healthy primary', async () => {
    window.sessionStorage.setItem(
      ANANSI_GMAIL_OAUTH_COMPLETION_KEY,
      'a'.repeat(43),
    );
    const fetchMock = mockFetchRouter({
      'GET /v1/connections/gmail/status': [
        jsonOk(emptyStatus),
        jsonOk(connectedStatus),
      ],
      'POST /v1/connections/gmail/oauth/complete': [
        jsonOk({
          id: connectedStatus.connections[0].id,
          address: 'main@example.com',
          is_primary: true,
          state: 'ok',
        }),
      ],
    });

    renderCard();

    expect(await screen.findByText('main@example.com')).toBeInTheDocument();
    expect(screen.getByText('Main application email')).toBeInTheDocument();
    expect(
      window.sessionStorage.getItem(ANANSI_GMAIL_OAUTH_COMPLETION_KEY),
    ).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/connections/gmail/oauth/complete`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ completion_nonce: 'a'.repeat(43) }),
      }),
    );
  });

  it('retries an exchanging completion after one second', async () => {
    jest.useFakeTimers();
    window.sessionStorage.setItem(
      ANANSI_GMAIL_OAUTH_COMPLETION_KEY,
      'a'.repeat(43),
    );
    const fetchMock = mockFetchRouter({
      'GET /v1/connections/gmail/status': [
        jsonOk(emptyStatus),
        jsonOk(connectedStatus),
      ],
      'POST /v1/connections/gmail/oauth/complete': [
        jsonOk({ status: 'exchanging' }, 202),
        jsonOk({
          id: connectedStatus.connections[0].id,
          address: 'main@example.com',
          is_primary: true,
          state: 'ok',
        }),
      ],
    });

    renderCard();

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          String(input).endsWith('/v1/connections/gmail/oauth/complete'),
        ),
      ).toHaveLength(1),
    );
    expect(
      window.sessionStorage.getItem(ANANSI_GMAIL_OAUTH_COMPLETION_KEY),
    ).toBe('a'.repeat(43));

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(1_000);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          String(input).endsWith('/v1/connections/gmail/oauth/complete'),
        ),
      ).toHaveLength(2),
    );
    expect(await screen.findByText('main@example.com')).toBeInTheDocument();
    expect(
      window.sessionStorage.getItem(ANANSI_GMAIL_OAUTH_COMPLETION_KEY),
    ).toBeNull();
  });

  it('retries a capacity response after two seconds', async () => {
    jest.useFakeTimers();
    window.sessionStorage.setItem(
      ANANSI_GMAIL_OAUTH_COMPLETION_KEY,
      'a'.repeat(43),
    );
    const fetchMock = mockFetchRouter({
      'GET /v1/connections/gmail/status': [
        jsonOk(emptyStatus),
        jsonOk(emptyStatus),
        jsonOk(connectedStatus),
      ],
      'POST /v1/connections/gmail/oauth/complete': [
        jsonError(503, { detail: 'capacity full' }),
        jsonOk({
          id: connectedStatus.connections[0].id,
          address: 'main@example.com',
          is_primary: true,
          state: 'ok',
        }),
      ],
    });

    renderCard();

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          String(input).endsWith('/v1/connections/gmail/oauth/complete'),
        ),
      ).toHaveLength(1),
    );
    expect(
      window.sessionStorage.getItem(ANANSI_GMAIL_OAUTH_COMPLETION_KEY),
    ).toBe('a'.repeat(43));

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(2_000);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          String(input).endsWith('/v1/connections/gmail/oauth/complete'),
        ),
      ).toHaveLength(2),
    );
    expect(await screen.findByText('main@example.com')).toBeInTheDocument();
    expect(
      window.sessionStorage.getItem(ANANSI_GMAIL_OAUTH_COMPLETION_KEY),
    ).toBeNull();
  });

  it('stops automatic completion retries and keeps manual retry available', async () => {
    jest.useFakeTimers();
    window.sessionStorage.setItem(
      ANANSI_GMAIL_OAUTH_COMPLETION_KEY,
      'a'.repeat(43),
    );
    const fetchMock = mockFetchRouter({
      'GET /v1/connections/gmail/status': [jsonOk(emptyStatus)],
      'POST /v1/connections/gmail/oauth/complete': Array.from(
        { length: 5 },
        () => jsonOk({ status: 'exchanging' }, 202),
      ),
    });

    renderCard();

    const retryDelays = [1_000, 2_000, 4_000, 8_000];
    for (const [index, retryDelay] of retryDelays.entries()) {
      await waitFor(() =>
        expect(
          fetchMock.mock.calls.filter(([input]) =>
            String(input).endsWith('/v1/connections/gmail/oauth/complete'),
          ),
        ).toHaveLength(index + 1),
      );
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        jest.advanceTimersByTime(retryDelay);
        await Promise.resolve();
      });
    }

    expect(
      await screen.findByText("Couldn't finish connecting Gmail. Try again."),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith('/v1/connections/gmail/oauth/complete'),
      ),
    ).toHaveLength(5);
    expect(
      window.sessionStorage.getItem(ANANSI_GMAIL_OAUTH_COMPLETION_KEY),
    ).toBe('a'.repeat(43));
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
  });

  it('ignores a slow status response that predates completion refresh', async () => {
    window.sessionStorage.setItem(
      ANANSI_GMAIL_OAUTH_COMPLETION_KEY,
      'a'.repeat(43),
    );
    let resolveFirstStatus: (response: MockResponse) => void = () => undefined;
    const firstStatus = new Promise<MockResponse>((resolve) => {
      resolveFirstStatus = resolve;
    });
    let statusReads = 0;
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path === '/v1/connections/gmail/status') {
        statusReads += 1;
        return statusReads === 1
          ? firstStatus
          : Promise.resolve(jsonOk(connectedStatus));
      }
      if (path === '/v1/connections/gmail/oauth/complete') {
        return Promise.resolve(
          jsonOk({
            id: connectedStatus.connections[0].id,
            address: 'main@example.com',
            is_primary: true,
            state: 'ok',
          }),
        );
      }
      throw new Error(`Unmocked ANANSI fetch: ${path}`);
    }) as unknown as typeof fetch;

    renderCard();

    expect(
      await screen.findByText('Main application email'),
    ).toBeInTheDocument();
    await act(async () => {
      resolveFirstStatus(jsonOk(emptyStatus));
      await firstStatus;
      await Promise.resolve();
    });

    expect(screen.getByText('Main application email')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add another Gmail' }),
    ).toBeInTheDocument();
  });

  it('clears an earlier status error after completion refresh succeeds', async () => {
    window.sessionStorage.setItem(
      ANANSI_GMAIL_OAUTH_COMPLETION_KEY,
      'a'.repeat(43),
    );
    let resolveFirstStatus: (response: MockResponse) => void = () => undefined;
    const firstStatus = new Promise<MockResponse>((resolve) => {
      resolveFirstStatus = resolve;
    });
    let resolveCompletion: (response: MockResponse) => void = () => undefined;
    const completion = new Promise<MockResponse>((resolve) => {
      resolveCompletion = resolve;
    });
    let statusReads = 0;
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path === '/v1/connections/gmail/status') {
        statusReads += 1;
        return statusReads === 1
          ? firstStatus
          : Promise.resolve(jsonOk(connectedStatus));
      }
      if (path === '/v1/connections/gmail/oauth/complete') {
        return completion;
      }
      throw new Error(`Unmocked ANANSI fetch: ${path}`);
    }) as unknown as typeof fetch;

    renderCard();
    await act(async () => {
      resolveFirstStatus(jsonError(503));
      await firstStatus;
      await Promise.resolve();
    });
    expect(
      await screen.findByText(
        "Couldn't load Gmail connections. Please try again.",
      ),
    ).toBeInTheDocument();

    await act(async () => {
      resolveCompletion(
        jsonOk({
          id: connectedStatus.connections[0].id,
          address: 'main@example.com',
          is_primary: true,
          state: 'ok',
        }),
      );
      await completion;
      await Promise.resolve();
    });

    expect(
      await screen.findByText('Main application email'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Couldn't load Gmail connections. Please try again."),
    ).not.toBeInTheDocument();
  });

  it('clears a status error when committed completion uses local fallback', async () => {
    window.sessionStorage.setItem(
      ANANSI_GMAIL_OAUTH_COMPLETION_KEY,
      'a'.repeat(43),
    );
    let resolveFirstStatus: (response: MockResponse) => void = () => undefined;
    const firstStatus = new Promise<MockResponse>((resolve) => {
      resolveFirstStatus = resolve;
    });
    let resolveCompletion: (response: MockResponse) => void = () => undefined;
    const completion = new Promise<MockResponse>((resolve) => {
      resolveCompletion = resolve;
    });
    let statusReads = 0;
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      if (path === '/v1/connections/gmail/status') {
        statusReads += 1;
        return statusReads === 1
          ? firstStatus
          : Promise.resolve(jsonError(503));
      }
      if (path === '/v1/connections/gmail/oauth/complete') {
        return completion;
      }
      throw new Error(`Unmocked ANANSI fetch: ${path}`);
    }) as unknown as typeof fetch;

    renderCard();
    await act(async () => {
      resolveFirstStatus(jsonError(503));
      await firstStatus;
      await Promise.resolve();
    });
    expect(
      await screen.findByText(
        "Couldn't load Gmail connections. Please try again.",
      ),
    ).toBeInTheDocument();

    await act(async () => {
      resolveCompletion(
        jsonOk({
          id: connectedStatus.connections[0].id,
          address: 'main@example.com',
          is_primary: true,
          state: 'ok',
        }),
      );
      await completion;
      await Promise.resolve();
    });

    expect(
      await screen.findByText('main@example.com is connected.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Main application email')).toBeInTheDocument();
    expect(
      screen.queryByText("Couldn't load Gmail connections. Please try again."),
    ).not.toBeInTheDocument();
  });

  it('shows a cancelled callback without calling completion', async () => {
    window.sessionStorage.setItem(
      ANANSI_GMAIL_OAUTH_COMPLETION_KEY,
      'cancelled',
    );
    const fetchMock = mockFetchRouter({
      'GET /v1/connections/gmail/status': [jsonOk(emptyStatus)],
    });

    renderCard();

    expect(
      await screen.findByText('Gmail connection cancelled.'),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/v1/connections/gmail/oauth/complete'),
      ),
    ).toBe(false);
    expect(
      window.sessionStorage.getItem(ANANSI_GMAIL_OAUTH_COMPLETION_KEY),
    ).toBeNull();
  });

  it('lets the user retry a failed status load', async () => {
    mockFetchRouter({
      'GET /v1/connections/gmail/status': [jsonError(503), jsonOk(emptyStatus)],
    });

    renderCard();

    expect(
      await screen.findByText(
        "Couldn't load Gmail connections. Please try again.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('button', { name: 'Connect Gmail' }),
    ).toBeInTheDocument();
  });

  it('uses account selection for another Gmail account', async () => {
    const fetchMock = mockFetchRouter({
      'GET /v1/connections/gmail/status': [jsonOk(connectedStatus)],
      'POST /v1/connections/gmail/oauth/start': [
        jsonOk({
          authorize_url: authorizeUrl,
          expires_at: '2026-08-27T00:10:00Z',
        }),
      ],
    });
    const { navigate } = renderCard();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Add another Gmail' }),
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(authorizeUrl));
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/connections/gmail/oauth/start`,
      expect.objectContaining({
        body: JSON.stringify({
          return_target: 'profile',
          account_behavior: 'choose_account',
        }),
      }),
    );
  });

  it('changes main email and requires two clicks to disconnect', async () => {
    const fetchMock = mockFetchRouter({
      'GET /v1/connections/gmail/status': [
        jsonOk(secondConnectionStatus),
        jsonOk({
          ...secondConnectionStatus,
          connections: secondConnectionStatus.connections.map((connection) => ({
            ...connection,
            is_primary:
              connection.id === '22222222-2222-4222-8222-222222222222',
          })),
          primary_connection_id: '22222222-2222-4222-8222-222222222222',
          main_application_email: 'other@example.com',
        }),
        jsonOk(connectedStatus),
      ],
      'PATCH /v1/connections/gmail/primary': [
        jsonOk({
          id: '22222222-2222-4222-8222-222222222222',
          address: 'other@example.com',
          is_primary: true,
          state: 'ok',
        }),
      ],
      'DELETE /v1/connections/gmail/22222222-2222-4222-8222-222222222222': [
        jsonOk({
          id: '22222222-2222-4222-8222-222222222222',
          address: 'other@example.com',
          is_primary: false,
          state: 'disconnected',
        }),
      ],
    });

    renderCard();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Use other@example.com as main',
      }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `${ANANSI_API_URL}/v1/connections/gmail/primary`,
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Disconnect other@example.com',
      }),
    );
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).includes('/connections/gmail/22222222') &&
          (init?.method ?? 'GET') === 'DELETE',
      ),
    ).toBe(false);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Confirm disconnect other@example.com',
      }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `${ANANSI_API_URL}/v1/connections/gmail/22222222-2222-4222-8222-222222222222`,
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it('ignores a mailbox mutation failure after the access token changes', async () => {
    let resolvePrimary: (response: MockResponse) => void = () => undefined;
    const primaryResponse = new Promise<MockResponse>((resolve) => {
      resolvePrimary = resolve;
    });
    const fetchMock = jest.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input).replace(ANANSI_API_URL, '');
        const authorization = (init?.headers as Record<string, string>)
          .Authorization;
        if (path === '/v1/connections/gmail/status') {
          return Promise.resolve(
            jsonOk(
              authorization === 'Bearer old-token'
                ? secondConnectionStatus
                : emptyStatus,
            ),
          );
        }
        if (path === '/v1/connections/gmail/primary') {
          return primaryResponse;
        }
        throw new Error(`Unmocked ANANSI fetch: ${path}`);
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const navigate = jest.fn();
    const view = render(
      <ThemeProvider colorScheme="light">
        <I18nProvider i18n={i18n}>
          <AnansiGmailConnectionCard
            accessToken="old-token"
            returnTarget="profile"
            navigate={navigate}
          />
        </I18nProvider>
      </ThemeProvider>,
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Use other@example.com as main',
      }),
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).endsWith('/v1/connections/gmail/primary'),
        ),
      ).toBe(true),
    );

    view.rerender(
      <ThemeProvider colorScheme="light">
        <I18nProvider i18n={i18n}>
          <AnansiGmailConnectionCard
            accessToken="next-token"
            returnTarget="profile"
            navigate={navigate}
          />
        </I18nProvider>
      </ThemeProvider>,
    );
    await screen.findByRole('button', { name: 'Connect Gmail' });
    await act(async () => {
      resolvePrimary(jsonError(503));
      await primaryResponse;
      await Promise.resolve();
    });

    expect(
      screen.queryByText("Couldn't change the main application email."),
    ).not.toBeInTheDocument();
  });

  it('retries a pending completion with the replacement access token', async () => {
    window.sessionStorage.setItem(
      ANANSI_GMAIL_OAUTH_COMPLETION_KEY,
      'a'.repeat(43),
    );
    const oldCompletion = new Promise<MockResponse>(() => undefined);
    let nextStatusReads = 0;
    const fetchMock = jest.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input).replace(ANANSI_API_URL, '');
        const authorization = (init?.headers as Record<string, string>)
          .Authorization;
        if (path === '/v1/connections/gmail/status') {
          if (authorization === 'Bearer next-token') {
            nextStatusReads += 1;
            return Promise.resolve(
              jsonOk(nextStatusReads === 1 ? emptyStatus : connectedStatus),
            );
          }
          return Promise.resolve(jsonOk(emptyStatus));
        }
        if (path === '/v1/connections/gmail/oauth/complete') {
          if (authorization === 'Bearer old-token') {
            return oldCompletion;
          }
          return Promise.resolve(
            jsonOk({
              id: connectedStatus.connections[0].id,
              address: 'main@example.com',
              is_primary: true,
              state: 'ok',
            }),
          );
        }
        throw new Error(`Unmocked ANANSI fetch: ${path}`);
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const navigate = jest.fn();
    const view = render(
      <ThemeProvider colorScheme="light">
        <I18nProvider i18n={i18n}>
          <AnansiGmailConnectionCard
            accessToken="old-token"
            returnTarget="profile"
            navigate={navigate}
          />
        </I18nProvider>
      </ThemeProvider>,
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            String(input).endsWith('/v1/connections/gmail/oauth/complete') &&
            (init?.headers as Record<string, string>).Authorization ===
              'Bearer old-token',
        ),
      ).toBe(true),
    );

    view.rerender(
      <ThemeProvider colorScheme="light">
        <I18nProvider i18n={i18n}>
          <AnansiGmailConnectionCard
            accessToken="next-token"
            returnTarget="profile"
            navigate={navigate}
          />
        </I18nProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText('main@example.com')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith('/v1/connections/gmail/oauth/complete') &&
          (init?.headers as Record<string, string>).Authorization ===
            'Bearer next-token',
      ),
    ).toBe(true);
  });

  it('does not start OAuth after the access token changes during draft save', async () => {
    let finishDraftSave: () => void = () => undefined;
    const beforeRedirect = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishDraftSave = resolve;
        }),
    );
    const fetchMock = mockFetchRouter({
      'GET /v1/connections/gmail/status': [
        jsonOk(emptyStatus),
        jsonOk(emptyStatus),
      ],
      'POST /v1/connections/gmail/oauth/start': [
        jsonOk({
          authorize_url: authorizeUrl,
          expires_at: '2026-08-27T00:10:00Z',
        }),
      ],
    });
    const navigate = jest.fn();
    const view = render(
      <ThemeProvider colorScheme="light">
        <I18nProvider i18n={i18n}>
          <AnansiGmailConnectionCard
            accessToken="old-token"
            returnTarget="onboarding"
            beforeRedirect={beforeRedirect}
            navigate={navigate}
          />
        </I18nProvider>
      </ThemeProvider>,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Connect Gmail' }),
    );

    view.rerender(
      <ThemeProvider colorScheme="light">
        <I18nProvider i18n={i18n}>
          <AnansiGmailConnectionCard
            accessToken="next-token"
            returnTarget="onboarding"
            beforeRedirect={beforeRedirect}
            navigate={navigate}
          />
        </I18nProvider>
      </ThemeProvider>,
    );
    await act(async () => {
      finishDraftSave();
      await Promise.resolve();
    });

    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith('/v1/connections/gmail/oauth/start') &&
          (init?.method ?? 'GET') === 'POST',
      ),
    ).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps a successful completion when its status refresh fails', async () => {
    window.sessionStorage.setItem(
      ANANSI_GMAIL_OAUTH_COMPLETION_KEY,
      'a'.repeat(43),
    );
    mockFetchRouter({
      'GET /v1/connections/gmail/status': [jsonOk(emptyStatus), jsonError(503)],
      'POST /v1/connections/gmail/oauth/complete': [
        jsonOk({
          id: connectedStatus.connections[0].id,
          address: 'main@example.com',
          is_primary: true,
          state: 'ok',
        }),
      ],
    });

    renderCard();

    expect(
      await screen.findByText('main@example.com is connected.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Couldn't finish connecting Gmail. Try again."),
    ).not.toBeInTheDocument();
    expect(
      window.sessionStorage.getItem(ANANSI_GMAIL_OAUTH_COMPLETION_KEY),
    ).toBeNull();
  });

  it('clears completion feedback when the access token changes', async () => {
    window.sessionStorage.setItem(
      ANANSI_GMAIL_OAUTH_COMPLETION_KEY,
      'a'.repeat(43),
    );
    const statusReads = new Map<string, number>();
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace(ANANSI_API_URL, '');
      const authorization = (init?.headers as Record<string, string>)
        .Authorization;
      if (path === '/v1/connections/gmail/status') {
        const reads = (statusReads.get(authorization) ?? 0) + 1;
        statusReads.set(authorization, reads);
        return Promise.resolve(
          jsonOk(
            authorization === 'Bearer old-token' && reads > 1
              ? connectedStatus
              : emptyStatus,
          ),
        );
      }
      if (path === '/v1/connections/gmail/oauth/complete') {
        return Promise.resolve(
          jsonOk({
            id: connectedStatus.connections[0].id,
            address: 'main@example.com',
            is_primary: true,
            state: 'ok',
          }),
        );
      }
      throw new Error(`Unmocked ANANSI fetch: ${path}`);
    }) as unknown as typeof fetch;
    const navigate = jest.fn();
    const view = render(
      <ThemeProvider colorScheme="light">
        <I18nProvider i18n={i18n}>
          <AnansiGmailConnectionCard
            accessToken="old-token"
            returnTarget="profile"
            navigate={navigate}
          />
        </I18nProvider>
      </ThemeProvider>,
    );
    expect(
      await screen.findByText('main@example.com is connected.'),
    ).toBeInTheDocument();

    view.rerender(
      <ThemeProvider colorScheme="light">
        <I18nProvider i18n={i18n}>
          <AnansiGmailConnectionCard
            accessToken="next-token"
            returnTarget="profile"
            navigate={navigate}
          />
        </I18nProvider>
      </ThemeProvider>,
    );

    expect(
      await screen.findByRole('button', { name: 'Connect Gmail' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('main@example.com is connected.'),
    ).not.toBeInTheDocument();
  });

  it('hides the old mailbox list when the next token status load fails', async () => {
    const fetchMock = jest.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      (init?.headers as Record<string, string>).Authorization ===
      'Bearer old-token'
        ? Promise.resolve(jsonOk(connectedStatus))
        : Promise.resolve(jsonError(503)),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const navigate = jest.fn();
    const view = render(
      <ThemeProvider colorScheme="light">
        <I18nProvider i18n={i18n}>
          <AnansiGmailConnectionCard
            accessToken="old-token"
            returnTarget="profile"
            navigate={navigate}
          />
        </I18nProvider>
      </ThemeProvider>,
    );
    expect(await screen.findByText('main@example.com')).toBeInTheDocument();

    view.rerender(
      <ThemeProvider colorScheme="light">
        <I18nProvider i18n={i18n}>
          <AnansiGmailConnectionCard
            accessToken="next-token"
            returnTarget="profile"
            navigate={navigate}
          />
        </I18nProvider>
      </ThemeProvider>,
    );

    expect(
      await screen.findByText(
        "Couldn't load Gmail connections. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('main@example.com')).not.toBeInTheDocument();
  });

  it('does not show a previous user status after the access token changes', async () => {
    let resolveOldStatus: (response: MockResponse) => void = () => undefined;
    const oldStatusResponse = new Promise<MockResponse>((resolve) => {
      resolveOldStatus = resolve;
    });
    const nextStatus = {
      ...connectedStatus,
      connections: [
        {
          ...connectedStatus.connections[0],
          id: '33333333-3333-4333-8333-333333333333',
          address: 'next@example.com',
        },
      ],
      primary_connection_id: '33333333-3333-4333-8333-333333333333',
      main_application_email: 'next@example.com',
    };
    global.fetch = jest.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      (init?.headers as Record<string, string>).Authorization ===
      'Bearer old-token'
        ? oldStatusResponse
        : Promise.resolve(jsonOk(nextStatus)),
    ) as unknown as typeof fetch;
    const navigate = jest.fn();
    const view = render(
      <ThemeProvider colorScheme="light">
        <I18nProvider i18n={i18n}>
          <AnansiGmailConnectionCard
            accessToken="old-token"
            returnTarget="profile"
            navigate={navigate}
          />
        </I18nProvider>
      </ThemeProvider>,
    );

    view.rerender(
      <ThemeProvider colorScheme="light">
        <I18nProvider i18n={i18n}>
          <AnansiGmailConnectionCard
            accessToken="next-token"
            returnTarget="profile"
            navigate={navigate}
          />
        </I18nProvider>
      </ThemeProvider>,
    );
    expect(await screen.findByText('next@example.com')).toBeInTheDocument();

    await act(async () => {
      resolveOldStatus(jsonOk(connectedStatus));
      await oldStatusResponse;
    });

    expect(screen.getByText('next@example.com')).toBeInTheDocument();
    expect(screen.queryByText('main@example.com')).not.toBeInTheDocument();
  });
});
