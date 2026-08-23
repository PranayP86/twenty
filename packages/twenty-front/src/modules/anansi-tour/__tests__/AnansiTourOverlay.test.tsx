// ANANSI PATCH (WS-C): focused coverage for Core-gated auto-start, bounded
// missing-anchor skips, and non-blocking persistence on both close paths.
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
import { MemoryRouter, useLocation } from 'react-router-dom';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { AnansiTourOverlay } from '@/anansi-tour/AnansiTourOverlay';
import { anansiTourRequestedState } from '@/anansi-tour/states/anansiTourRequestedState';
import { ANANSI_API_URL } from '@/auth/constants/AnansiApiUrl';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { isWelcomeAnimationVisibleState } from '@/onboarding/states/isWelcomeAnimationVisibleState';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { OnboardingStatus } from '~/generated-metadata/graphql';
import { patchAnansiTourSeen } from '~/pages/anansi/anansiProfileApi';
import { dynamicActivate } from '~/utils/i18n/dynamicActivate';

const mockUseOnboardingStatus = jest.fn();

jest.mock('@/onboarding/hooks/useOnboardingStatus', () => ({
  useOnboardingStatus: () => mockUseOnboardingStatus(),
}));

dynamicActivate(SOURCE_LOCALE);

const ACCESS_TOKEN = 'fake-access-token';
const COMPLETED_AT = '2026-08-22T12:00:00+00:00';
const DASHBOARD_ROUTE = '/objects/dashboards/anansi-dashboard-id';

let animationFrameTime = 0;
let nextAnimationFrameId = 1;
let animationFrameCallbacks = new Map<number, FrameRequestCallback>();

const flushAnimationFrames = async (count: number) => {
  for (let frame = 0; frame < count; frame += 1) {
    await act(async () => {
      const callbacks = [...animationFrameCallbacks.values()];
      animationFrameCallbacks.clear();
      animationFrameTime += 1000;
      callbacks.forEach((callback) => callback(animationFrameTime));
      await Promise.resolve();
    });
  }
};

const waitForAnimationFrame = () =>
  waitFor(() => expect(animationFrameCallbacks.size).toBeGreaterThan(0));

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

const meResponse = (tourSeenAt: string | null, tourStateRevision = 0) => ({
  email: 'jane.doe@example.com',
  timezone: 'UTC',
  awake_hours: { start: '09:00', end: '18:00' },
  mode: 'live',
  onboarding_completed_at: COMPLETED_AT,
  tour_seen_at: tourSeenAt,
  tour_state_revision: tourStateRevision,
});

const jsonOk = (body: unknown) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
});

const jsonError = (status: number, detail: string) => ({
  ok: false,
  status,
  json: () => Promise.resolve({ detail }),
});

type MockResponse = ReturnType<typeof jsonOk> | ReturnType<typeof jsonError>;

const mockFetchRouter = (responses: Record<string, MockResponse[]>) => {
  const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = String(input).replace(ANANSI_API_URL, '');
    const key = `${method} ${path}`;
    const queue = responses[key];

    if (!queue || queue.length === 0) {
      throw new Error(`Unmocked ANANSI fetch: ${key}`);
    }

    return Promise.resolve(queue.shift());
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

const getTourPatchBody = (fetchMock: jest.Mock, index = 0) => {
  const patchCalls = fetchMock.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
  );
  const body = (patchCalls[index]?.[1] as RequestInit | undefined)?.body;

  if (typeof body !== 'string') {
    throw new Error(`Missing tour PATCH body at index ${index}`);
  }

  return JSON.parse(body) as {
    tour_seen: boolean;
    tour_state_revision: number;
  };
};

const appendAnchor = (
  attributes: Record<string, string>,
  elementName: 'a' | 'div' = 'div',
) => {
  const anchor = document.createElement(elementName);
  anchor.dataset.anansiTestAnchor = 'true';

  for (const [name, value] of Object.entries(attributes)) {
    anchor.setAttribute(name, value);
  }

  document.body.append(anchor);
  return anchor;
};

const appendAnansiDashboardAnchor = () =>
  appendAnchor({ id: 'nav-item-anansi-test', href: DASHBOARD_ROUTE }, 'a');

const appendAllAnchors = () => {
  appendAnansiDashboardAnchor();
  appendAnchor({ 'data-anansi-tour': 'widget-card' });
  appendAnchor({ 'data-anansi-tour': 'autonomy-toggle' });
  appendAnchor({ id: 'nav-item-jobs-test' });
};

const LocationProbe = () => {
  const location = useLocation();
  return <span data-testid="location-pathname">{location.pathname}</span>;
};

const renderOverlay = (initialEntry = '/') =>
  render(
    <JotaiProvider store={jotaiStore}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocationProbe />
        <ThemeProvider colorScheme="light">
          <I18nProvider i18n={i18n}>
            <AnansiTourOverlay />
          </I18nProvider>
        </ThemeProvider>
      </MemoryRouter>
    </JotaiProvider>,
  );

const showStop = async (title: string) => {
  await waitForAnimationFrame();
  await flushAnimationFrames(2);
  return screen.findByText(title);
};

const continueToLastStop = async () => {
  await showStop('Your dashboard');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await showStop('Live cards');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await showStop('Autonomy switches');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await showStop('Jobs');
};

describe('AnansiTourOverlay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetJotaiStore();
    setTokenPair();
    mockUseOnboardingStatus.mockReturnValue(OnboardingStatus.COMPLETED);
    animationFrameTime = 0;
    nextAnimationFrameId = 1;
    animationFrameCallbacks = new Map();

    // ANANSI PATCH (WS-C): setup has no rAF shim. Queue callbacks explicitly so
    // tests control the production polling loop and its four-second deadline.
    window.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
      const id = nextAnimationFrameId;
      nextAnimationFrameId += 1;
      animationFrameCallbacks.set(id, callback);
      return id;
    });
    window.cancelAnimationFrame = jest.fn((id: number) => {
      animationFrameCallbacks.delete(id);
    });
  });

  afterEach(() => {
    document
      .querySelectorAll('[data-anansi-test-anchor="true"]')
      .forEach((anchor) => anchor.remove());
  });

  it('does not activate when Core says the tour was already seen', async () => {
    const fetchMock = mockFetchRouter({
      'GET /v1/me': [jsonOk(meResponse(COMPLETED_AT))],
    });
    appendAnansiDashboardAnchor();

    renderOverlay();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Your dashboard')).not.toBeInTheDocument();
  });

  it('auto-starts once for a completed user with an unseen tour', async () => {
    const fetchMock = mockFetchRouter({
      'GET /v1/me': [jsonOk(meResponse(null))],
    });
    appendAnansiDashboardAnchor();

    renderOverlay();

    expect(await showStop('Your dashboard')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('1 of 4')).toBeInTheDocument();
  });

  it('ignores an eligibility response from the previous signed-in user', async () => {
    let resolveFirstResponse: (response: MockResponse) => void = () =>
      undefined;
    const firstResponse = new Promise<MockResponse>((resolve) => {
      resolveFirstResponse = resolve;
    });
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValueOnce(jsonOk(meResponse(COMPLETED_AT)));
    global.fetch = fetchMock as unknown as typeof fetch;
    appendAnansiDashboardAnchor();

    renderOverlay();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      setTokenPair('next-user-access-token');
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveFirstResponse(jsonOk(meResponse(null)));
      await Promise.resolve();
    });

    expect(animationFrameCallbacks.size).toBe(0);
    expect(screen.queryByText('Your dashboard')).not.toBeInTheDocument();
  });

  it('closes an active tour without writing when the signed-in user changes', async () => {
    const fetchMock = mockFetchRouter({
      'GET /v1/me': [
        jsonOk(meResponse(null)),
        jsonOk(meResponse(COMPLETED_AT)),
      ],
    });
    appendAnansiDashboardAnchor();

    renderOverlay();
    expect(await showStop('Your dashboard')).toBeInTheDocument();

    act(() => {
      setTokenPair('next-user-access-token');
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Your dashboard')).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
      ),
    ).toBe(false);
  });

  it('defers auto-start until the completion welcome animation leaves', async () => {
    const fetchMock = mockFetchRouter({
      'GET /v1/me': [jsonOk(meResponse(null))],
    });
    jotaiStore.set(isWelcomeAnimationVisibleState.atom, true);
    appendAnansiDashboardAnchor();

    renderOverlay();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Your dashboard')).not.toBeInTheDocument();
    expect(animationFrameCallbacks.size).toBe(0);

    act(() => {
      jotaiStore.set(isWelcomeAnimationVisibleState.atom, false);
    });

    expect(await showStop('Your dashboard')).toBeInTheDocument();
  });

  it('navigates to the direct Anansi dashboard before the first stop', async () => {
    mockFetchRouter({
      'GET /v1/me': [jsonOk(meResponse(null))],
    });
    appendAnansiDashboardAnchor();

    renderOverlay('/profile');

    expect(await showStop('Your dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('location-pathname')).toHaveTextContent(
      DASHBOARD_ROUTE,
    );
  });

  it('silently skips missing anchors until the next available stop', async () => {
    mockFetchRouter({
      'GET /v1/me': [jsonOk(meResponse(null))],
    });
    appendAnchor({ id: 'nav-item-jobs-test' });

    renderOverlay();

    await waitForAnimationFrame();
    await flushAnimationFrames(30);
    expect(await screen.findByText('Jobs')).toBeInTheDocument();
    expect(screen.getByText('4 of 4')).toBeInTheDocument();
  });

  it('navigates to the direct Anansi dashboard when Back leaves Profile', async () => {
    mockFetchRouter({
      'GET /v1/me': [jsonOk(meResponse(null))],
    });
    appendAllAnchors();

    renderOverlay();
    await showStop('Your dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await showStop('Live cards');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await showStop('Autonomy switches');
    expect(screen.getByTestId('location-pathname')).toHaveTextContent(
      '/profile',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() =>
      expect(screen.getByTestId('location-pathname')).toHaveTextContent(
        DASHBOARD_ROUTE,
      ),
    );
    expect(await showStop('Live cards')).toBeInTheDocument();
  });

  it('Finish closes immediately and marks the tour seen', async () => {
    const fetchMock = mockFetchRouter({
      'GET /v1/me': [jsonOk(meResponse(null)), jsonOk(meResponse(null))],
      'PATCH /v1/me': [jsonOk(meResponse(COMPLETED_AT, 1))],
    });
    appendAllAnchors();

    renderOverlay();
    await continueToLastStop();
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(screen.queryByText('Jobs')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
        ),
      ).toBe(true),
    );
    expect(getTourPatchBody(fetchMock)).toEqual({
      tour_seen: true,
      tour_state_revision: 0,
    });
  });

  it('Skip tour closes immediately and marks the tour seen', async () => {
    const fetchMock = mockFetchRouter({
      'GET /v1/me': [jsonOk(meResponse(null)), jsonOk(meResponse(null))],
      'PATCH /v1/me': [jsonOk(meResponse(COMPLETED_AT, 1))],
    });
    appendAnansiDashboardAnchor();

    renderOverlay();
    await showStop('Your dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));

    expect(screen.queryByText('Your dashboard')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
        ),
      ).toBe(true),
    );
    expect(getTourPatchBody(fetchMock)).toEqual({
      tour_seen: true,
      tour_state_revision: 0,
    });
  });

  it('closes a requested restart with the persisted restart revision', async () => {
    const fetchMock = mockFetchRouter({
      'GET /v1/me': [jsonOk(meResponse(COMPLETED_AT, 7))],
      'PATCH /v1/me': [jsonOk(meResponse(COMPLETED_AT, 8))],
    });
    jotaiStore.set(anansiTourRequestedState.atom, {
      accessToken: ACCESS_TOKEN,
      tourStateRevision: 7,
    });
    appendAnansiDashboardAnchor();

    renderOverlay();
    await showStop('Your dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
        ),
      ).toBe(true),
    );
    expect(getTourPatchBody(fetchMock)).toEqual({
      tour_seen: true,
      tour_state_revision: 7,
    });
  });

  it('ignores eligibility that resolves after an explicit restart', async () => {
    let resolveEligibility: (response: MockResponse) => void = () => undefined;
    const eligibilityResponse = new Promise<MockResponse>((resolve) => {
      resolveEligibility = resolve;
    });
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() => eligibilityResponse)
      .mockResolvedValueOnce(jsonOk(meResponse(COMPLETED_AT, 8)));
    global.fetch = fetchMock as unknown as typeof fetch;
    appendAnansiDashboardAnchor();

    renderOverlay();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => {
      jotaiStore.set(anansiTourRequestedState.atom, {
        accessToken: ACCESS_TOKEN,
        tourStateRevision: 7,
      });
    });
    await showStop('Your dashboard');

    await act(async () => {
      resolveEligibility(jsonOk(meResponse(null, 6)));
      await eligibilityResponse;
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(getTourPatchBody(fetchMock)).toEqual({
      tour_seen: true,
      tour_state_revision: 7,
    });
  });

  it('drops a requested restart from a previous access token', async () => {
    const fetchMock = mockFetchRouter({
      'GET /v1/me': [jsonOk(meResponse(COMPLETED_AT, 4))],
    });
    jotaiStore.set(anansiTourRequestedState.atom, {
      accessToken: 'previous-user-access-token',
      tourStateRevision: 3,
    });
    appendAnansiDashboardAnchor();

    renderOverlay();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(jotaiStore.get(anansiTourRequestedState.atom)).toBeNull();
    expect(screen.queryByText('Your dashboard')).not.toBeInTheDocument();
  });

  it('serializes close and restart writes across an access-token refresh', async () => {
    let resolveClosePatch: (response: MockResponse) => void = () => undefined;
    const closePatch = new Promise<MockResponse>((resolve) => {
      resolveClosePatch = resolve;
    });
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() => closePatch)
      .mockResolvedValueOnce(jsonOk(meResponse(COMPLETED_AT, 1)))
      .mockResolvedValueOnce(jsonOk(meResponse(null, 2)));
    global.fetch = fetchMock as unknown as typeof fetch;

    const markSeen = patchAnansiTourSeen('old-access-token', true, 0);
    const restart = patchAnansiTourSeen('refreshed-access-token', false);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolveClosePatch(jsonOk(meResponse(COMPLETED_AT, 1)));
    await expect(markSeen).resolves.toEqual(meResponse(COMPLETED_AT, 1));
    await expect(restart).resolves.toEqual(meResponse(null, 2));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getTourPatchBody(fetchMock, 0)).toEqual({
      tour_seen: true,
      tour_state_revision: 0,
    });
    expect(getTourPatchBody(fetchMock, 1)).toEqual({
      tour_seen: false,
      tour_state_revision: 1,
    });
  });

  it('keeps a restart when a timed-out close reaches the server later', async () => {
    jest.useFakeTimers();
    let serverTourSeenAt: string | null = null;
    let serverRevision = 0;
    let deliverCloseToServer = () => undefined;
    const fetchMock = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'GET') {
          return Promise.resolve(
            jsonOk(meResponse(serverTourSeenAt, serverRevision)),
          );
        }

        const body = JSON.parse(String(init?.body)) as {
          tour_seen: boolean;
          tour_state_revision: number;
        };
        if (body.tour_seen) {
          return new Promise<MockResponse>((_resolve, reject) => {
            deliverCloseToServer = () => {
              if (body.tour_state_revision === serverRevision) {
                serverTourSeenAt = COMPLETED_AT;
                serverRevision += 1;
              }
            };
            init?.signal?.addEventListener(
              'abort',
              () => {
                const error = new Error('Aborted');
                error.name = 'AbortError';
                reject(error);
              },
              { once: true },
            );
          });
        }

        if (body.tour_state_revision !== serverRevision) {
          return Promise.resolve(
            jsonError(409, 'tour state changed; refresh and retry'),
          );
        }
        serverTourSeenAt = null;
        serverRevision += 1;
        return Promise.resolve(
          jsonOk(meResponse(serverTourSeenAt, serverRevision)),
        );
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      const markSeen = patchAnansiTourSeen('old-access-token', true, 0);
      const restart = patchAnansiTourSeen('refreshed-access-token', false);

      await act(async () => {
        await Promise.resolve();
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(15_000);
      });

      await expect(markSeen).rejects.toMatchObject({ name: 'AbortError' });
      await expect(restart).resolves.toEqual(meResponse(null, 1));
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(getTourPatchBody(fetchMock, 0)).toEqual({
        tour_seen: true,
        tour_state_revision: 0,
      });
      expect(getTourPatchBody(fetchMock, 1)).toEqual({
        tour_seen: false,
        tour_state_revision: 0,
      });

      deliverCloseToServer();
      expect(serverTourSeenAt).toBeNull();
      expect(serverRevision).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not replay a stale close after a newer restart', async () => {
    const fetchMock = mockFetchRouter({
      'GET /v1/me': [jsonOk(meResponse(null, 1))],
      'PATCH /v1/me': [jsonError(409, 'tour state changed; refresh and retry')],
    });

    await expect(
      patchAnansiTourSeen('stale-close-token', true, 0),
    ).resolves.toEqual(meResponse(null, 1));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getTourPatchBody(fetchMock)).toEqual({
      tour_seen: true,
      tour_state_revision: 0,
    });
  });

  it('refetches and retries a restart once after a server conflict', async () => {
    const fetchMock = mockFetchRouter({
      'GET /v1/me': [
        jsonOk(meResponse(null, 0)),
        jsonOk(meResponse(COMPLETED_AT, 1)),
      ],
      'PATCH /v1/me': [
        jsonError(409, 'tour state changed; refresh and retry'),
        jsonOk(meResponse(null, 2)),
      ],
    });

    await expect(patchAnansiTourSeen('restart-token', false)).resolves.toEqual(
      meResponse(null, 2),
    );

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(getTourPatchBody(fetchMock, 0)).toEqual({
      tour_seen: false,
      tour_state_revision: 0,
    });
    expect(getTourPatchBody(fetchMock, 1)).toEqual({
      tour_seen: false,
      tour_state_revision: 1,
    });
  });
});
