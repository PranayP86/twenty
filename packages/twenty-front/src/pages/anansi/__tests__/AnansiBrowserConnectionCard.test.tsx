import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { ANANSI_API_URL } from '@/auth/constants/AnansiApiUrl';
import { ANANSI_BROWSER_EXTENSION_ID } from '@/auth/constants/AnansiBrowserExtensionId';
import { AnansiBrowserConnectionCard } from '~/pages/anansi/AnansiBrowserConnectionCard';
import { dynamicActivate } from '~/utils/i18n/dynamicActivate';

dynamicActivate(SOURCE_LOCALE);

const ACCESS_TOKEN = 'fake-access-token';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const INTENT_ID = '22222222-2222-4222-8222-222222222222';
const DEVICE_ID = '33333333-3333-4333-8333-333333333333';
const PAIRING_TOKEN = 't'.repeat(43);
const PAIRING_NONCE = 'n'.repeat(43);
const WORKSPACE_ORIGIN = 'https://friend.anansi.work';

const device = {
  id: DEVICE_ID,
  key_thumbprint: 'thumbprint',
  extension_id: ANANSI_BROWSER_EXTENSION_ID,
  workspace_origin: WORKSPACE_ORIGIN,
  last_heartbeat_at: '2026-08-27T12:00:00Z',
  revoked_at: null,
  version: 1,
};

const unavailableBrowserPreference = {
  preferred_runtime: 'extension',
  remote_fallback_enabled: false,
  extension_state: 'unavailable',
  remote_state: 'unavailable',
  last_health_at: null,
  version: 0,
};

const jsonOk = (body: unknown, status = 200) => ({
  ok: true,
  status,
  headers: new Headers(),
  json: () => Promise.resolve(body),
});

type MockResponse = ReturnType<typeof jsonOk>;

const mockFetchRouter = (responses: Record<string, MockResponse[]>) => {
  const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = String(input).replace(ANANSI_API_URL, '');
    const key = `${method} ${path}`;
    const queue = responses[key];
    if (queue === undefined || queue.length === 0) {
      if (key === 'GET /v1/browser/preferences') {
        return Promise.resolve(jsonOk(unavailableBrowserPreference));
      }
      throw new Error(`Unmocked ANANSI fetch: ${key}`);
    }
    return Promise.resolve(queue.shift());
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

const setChromeRuntime = (sendMessage: jest.Mock) => {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        sendMessage,
      },
    },
  });
};

const clearChromeRuntime = () => {
  Reflect.deleteProperty(globalThis, 'chrome');
};

const setLocalChromeStatus = (response: unknown) => {
  const sendMessage = jest.fn(
    (
      _extensionId: string,
      message: { type?: string },
      callback: (value: unknown) => void,
    ) => {
      if (message.type === 'anansi.browser.status.v1') {
        callback(response);
      }
    },
  );
  setChromeRuntime(sendMessage);
  return sendMessage;
};

const renderCard = (
  props: Partial<React.ComponentProps<typeof AnansiBrowserConnectionCard>> = {},
) =>
  render(
    <ThemeProvider colorScheme="light">
      <I18nProvider i18n={i18n}>
        <AnansiBrowserConnectionCard
          accessToken={props.accessToken ?? ACCESS_TOKEN}
          onPairedChange={props.onPairedChange}
          workspaceOrigin={props.workspaceOrigin ?? WORKSPACE_ORIGIN}
          now={props.now ?? (() => new Date('2026-08-27T12:10:00Z'))}
        />
      </I18nProvider>
    </ThemeProvider>,
  );

describe('AnansiBrowserConnectionCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearChromeRuntime();
  });

  afterEach(() => {
    clearChromeRuntime();
  });

  it('pairs exact extension and never persists or renders pairing secrets', async () => {
    const onPairedChange = jest.fn();
    const fetchMock = mockFetchRouter({
      'GET /v1/browser/devices': [jsonOk([]), jsonOk([device])],
      'POST /v1/browser/pairing/start': [
        jsonOk(
          {
            user_id: USER_ID,
            intent_id: INTENT_ID,
            token: PAIRING_TOKEN,
            nonce: PAIRING_NONCE,
            extension_id: ANANSI_BROWSER_EXTENSION_ID,
            workspace_origin: WORKSPACE_ORIGIN,
            expires_at: '2026-08-27T12:05:00Z',
          },
          201,
        ),
      ],
    });
    let locallyPaired = false;
    const sendMessage = jest.fn(
      (
        _extensionId: string,
        message: { type?: string },
        callback: (response: unknown) => void,
      ) => {
        if (message.type === 'anansi.browser.status.v1') {
          callback(
            locallyPaired
              ? {
                  ok: true,
                  paired: true,
                  deviceId: DEVICE_ID,
                  userId: USER_ID,
                  workspaceOrigin: WORKSPACE_ORIGIN,
                }
              : { ok: true, paired: false },
          );
          return;
        }
        locallyPaired = true;
        callback({
          ok: true,
          deviceId: DEVICE_ID,
          tokenExpiresAt: '2026-08-27T12:05:00Z',
          replayed: false,
        });
      },
    );
    setChromeRuntime(sendMessage);

    renderCard({ onPairedChange });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Pair this Chrome' }),
    );

    expect(await screen.findByText('Browser ready')).toBeInTheDocument();
    expect(sendMessage).toHaveBeenCalledWith(
      ANANSI_BROWSER_EXTENSION_ID,
      {
        type: 'anansi.browser.pair.v1',
        userId: USER_ID,
        intentId: INTENT_ID,
        token: PAIRING_TOKEN,
        nonce: PAIRING_NONCE,
        extensionId: ANANSI_BROWSER_EXTENSION_ID,
        workspaceOrigin: WORKSPACE_ORIGIN,
      },
      expect.any(Function),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/browser/pairing/start`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ extension_id: ANANSI_BROWSER_EXTENSION_ID }),
      }),
    );
    expect(document.body.textContent).not.toContain(PAIRING_TOKEN);
    expect(document.body.textContent).not.toContain(PAIRING_NONCE);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    await waitFor(() => expect(onPairedChange).toHaveBeenLastCalledWith(true));
  });

  it('does not offer duplicate pairing after paired-device refresh loss', async () => {
    mockFetchRouter({
      'GET /v1/browser/devices': [jsonOk([])],
      'POST /v1/browser/pairing/start': [
        jsonOk(
          {
            user_id: USER_ID,
            intent_id: INTENT_ID,
            token: PAIRING_TOKEN,
            nonce: PAIRING_NONCE,
            extension_id: ANANSI_BROWSER_EXTENSION_ID,
            workspace_origin: WORKSPACE_ORIGIN,
            expires_at: '2026-08-27T12:15:00Z',
          },
          201,
        ),
      ],
    });
    const sendMessage = jest.fn(
      (
        _extensionId: string,
        message: { type?: string },
        callback: (response: unknown) => void,
      ) =>
        callback(
          message.type === 'anansi.browser.status.v1'
            ? { ok: true, paired: false }
            : {
                ok: true,
                deviceId: DEVICE_ID,
                tokenExpiresAt: '2026-08-27T12:15:00Z',
                replayed: false,
              },
        ),
    );
    setChromeRuntime(sendMessage);
    renderCard();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Pair this Chrome' }),
    );

    expect(
      await screen.findByText(
        'Chrome paired. Refresh browser status to finish.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Pair this Chrome' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Couldn't pair this Chrome. Please try again."),
    ).not.toBeInTheDocument();
  });

  it('fails closed when Core returns malformed browser preferences', async () => {
    const onPairedChange = jest.fn();
    mockFetchRouter({
      'GET /v1/browser/devices': [jsonOk([])],
      'GET /v1/browser/preferences': [
        jsonOk({
          ...unavailableBrowserPreference,
          remote_fallback_enabled: true,
          remote_state: 'healthy',
          version: '1',
        }),
      ],
    });
    setLocalChromeStatus({ ok: true, paired: false });

    renderCard({ onPairedChange });

    expect(
      await screen.findByText(
        "Couldn't load browser connections. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Remote fallback ready')).not.toBeInTheDocument();
    expect(onPairedChange).not.toHaveBeenCalledWith(true);
  });

  it('fails closed when a browser device has a non-origin workspace URL', async () => {
    const onPairedChange = jest.fn();
    mockFetchRouter({
      'GET /v1/browser/devices': [
        jsonOk([
          {
            ...device,
            workspace_origin: `${WORKSPACE_ORIGIN}/profile`,
          },
        ]),
      ],
    });
    setLocalChromeStatus({ ok: true, paired: false });

    renderCard({ onPairedChange });

    expect(
      await screen.findByText(
        "Couldn't load browser connections. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Other browser ready')).not.toBeInTheDocument();
    expect(onPairedChange).not.toHaveBeenCalledWith(true);
  });

  it('ignores devices paired to another workspace origin', async () => {
    const onPairedChange = jest.fn();
    mockFetchRouter({
      'GET /v1/browser/devices': [
        jsonOk([
          {
            ...device,
            workspace_origin: 'https://other.anansi.work',
          },
        ]),
      ],
    });
    setLocalChromeStatus({ ok: true, paired: false });

    renderCard({ onPairedChange });

    expect(
      await screen.findByRole('button', { name: 'Pair this Chrome' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Other browser ready')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Revoke Chrome extension' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(onPairedChange).toHaveBeenLastCalledWith(false));
  });

  it('does not forward a malformed Core pairing intent to Chrome', async () => {
    mockFetchRouter({
      'GET /v1/browser/devices': [jsonOk([])],
      'POST /v1/browser/pairing/start': [
        jsonOk(
          {
            user_id: USER_ID,
            intent_id: INTENT_ID,
            token: PAIRING_TOKEN,
            extension_id: ANANSI_BROWSER_EXTENSION_ID,
            workspace_origin: WORKSPACE_ORIGIN,
            expires_at: '2026-08-27T12:15:00Z',
          },
          201,
        ),
      ],
    });
    const sendMessage = jest.fn(
      (
        _extensionId: string,
        message: { type?: string },
        callback: (response: unknown) => void,
      ) => {
        if (message.type === 'anansi.browser.status.v1') {
          callback({ ok: true, paired: false });
          return;
        }
        callback({
          ok: true,
          deviceId: DEVICE_ID,
          tokenExpiresAt: '2026-08-27T12:15:00Z',
          replayed: false,
        });
      },
    );
    setChromeRuntime(sendMessage);
    renderCard();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Pair this Chrome' }),
    );

    expect(
      await screen.findByText("Couldn't pair this Chrome. Please try again."),
    ).toBeInTheDocument();
    expect(sendMessage).not.toHaveBeenCalledWith(
      ANANSI_BROWSER_EXTENSION_ID,
      expect.objectContaining({ type: 'anansi.browser.pair.v1' }),
      expect.any(Function),
    );
  });

  it('checks local extension availability before creating a Core intent', async () => {
    const fetchMock = mockFetchRouter({
      'GET /v1/browser/devices': [jsonOk([])],
    });
    renderCard();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Pair this Chrome' }),
    );

    expect(
      await screen.findByText(
        'Install or enable the Anansi Chrome extension, then try again.',
      ),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/browser/pairing/start`,
      expect.anything(),
    );
    expect(document.body.textContent).not.toContain(PAIRING_TOKEN);
    expect(document.body.textContent).not.toContain(PAIRING_NONCE);
  });

  it('does not mistake another computer device for this Chrome', async () => {
    const otherDevice = {
      ...device,
      id: '44444444-4444-4444-8444-444444444444',
    };
    mockFetchRouter({
      'GET /v1/browser/devices': [jsonOk([otherDevice])],
    });
    setLocalChromeStatus({ ok: true, paired: false });

    renderCard();

    expect(
      await screen.findByRole('button', { name: 'Pair this Chrome' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Browser ready')).not.toBeInTheDocument();
  });

  it('requires a fresh heartbeat for the exact local device', async () => {
    const onPairedChange = jest.fn();
    const staleDevice = {
      ...device,
      last_heartbeat_at: '2026-08-26T12:10:00Z',
    };
    mockFetchRouter({
      'GET /v1/browser/devices': [jsonOk([staleDevice])],
    });
    setLocalChromeStatus({
      ok: true,
      paired: true,
      deviceId: DEVICE_ID,
      userId: USER_ID,
      workspaceOrigin: WORKSPACE_ORIGIN,
    });

    renderCard({ onPairedChange });

    expect(
      await screen.findByText('This Chrome needs reconnect'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Pair this Chrome' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(onPairedChange).toHaveBeenLastCalledWith(false));
  });

  it('distinguishes an installed extension pairing failure from an unavailable extension', async () => {
    mockFetchRouter({
      'GET /v1/browser/devices': [jsonOk([])],
      'POST /v1/browser/pairing/start': [
        jsonOk(
          {
            user_id: USER_ID,
            intent_id: INTENT_ID,
            token: PAIRING_TOKEN,
            nonce: PAIRING_NONCE,
            extension_id: ANANSI_BROWSER_EXTENSION_ID,
            workspace_origin: WORKSPACE_ORIGIN,
            expires_at: '2026-08-27T12:15:00Z',
          },
          201,
        ),
      ],
    });
    const sendMessage = jest.fn(
      (
        _extensionId: string,
        message: { type?: string },
        callback: (value: unknown) => void,
      ) => {
        callback(
          message.type === 'anansi.browser.status.v1'
            ? { ok: true, paired: false }
            : { ok: false, error: 'browser pairing failed' },
        );
      },
    );
    setChromeRuntime(sendMessage);
    renderCard();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Pair this Chrome' }),
    );

    expect(
      await screen.findByText("Couldn't pair this Chrome. Please try again."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Install or enable the Anansi Chrome extension, then try again.',
      ),
    ).not.toBeInTheDocument();
  });

  it('enables an explicit healthy remote fallback by exact preference version', async () => {
    const onPairedChange = jest.fn();
    const remoteAvailablePreference = {
      ...unavailableBrowserPreference,
      remote_state: 'healthy',
      last_health_at: '2026-08-27T12:09:00Z',
      version: 2,
    };
    const remoteEnabledPreference = {
      ...remoteAvailablePreference,
      preferred_runtime: 'remote',
      remote_fallback_enabled: true,
      version: 3,
    };
    const fetchMock = mockFetchRouter({
      'GET /v1/browser/devices': [jsonOk([])],
      'GET /v1/browser/preferences': [jsonOk(remoteAvailablePreference)],
      'PATCH /v1/browser/preferences': [jsonOk(remoteEnabledPreference)],
    });
    setLocalChromeStatus({ ok: true, paired: false });

    renderCard({ onPairedChange });

    expect(
      await screen.findByText('Remote fallback available'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Enable remote fallback' }),
    );

    expect(
      await screen.findByText('Remote fallback ready'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/browser/preferences`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          preferred_runtime: 'remote',
          remote_fallback_enabled: true,
          expected_version: 2,
        }),
      }),
    );
    await waitFor(() => expect(onPairedChange).toHaveBeenLastCalledWith(true));
  });

  it('shows stale, revoked, and unavailable browser states without claiming readiness', async () => {
    const staleDevice = {
      ...device,
      last_heartbeat_at: '2026-08-26T12:10:00Z',
    };
    const revokedDevice = {
      ...device,
      id: '44444444-4444-4444-8444-444444444444',
      revoked_at: '2026-08-27T12:00:00Z',
      version: 2,
    };
    mockFetchRouter({
      'GET /v1/browser/devices': [jsonOk([staleDevice, revokedDevice])],
      'GET /v1/browser/preferences': [
        jsonOk({
          ...unavailableBrowserPreference,
          remote_fallback_enabled: true,
          remote_state: 'unhealthy',
          version: 4,
        }),
      ],
    });
    setLocalChromeStatus({ ok: true, paired: false });

    renderCard();

    expect(await screen.findByText('Browser stale')).toBeInTheDocument();
    expect(screen.getByText('Browser revoked')).toBeInTheDocument();
    expect(screen.getByText('Remote fallback unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Browser ready')).not.toBeInTheDocument();
    expect(screen.queryByText('Remote fallback ready')).not.toBeInTheDocument();
  });

  it('revokes a paired device immediately by exact version', async () => {
    const revoked = {
      ...device,
      revoked_at: '2026-08-27T12:10:00Z',
      version: 2,
    };
    const fetchMock = mockFetchRouter({
      'GET /v1/browser/devices': [jsonOk([device]), jsonOk([revoked])],
      [`POST /v1/browser/devices/${DEVICE_ID}/revoke`]: [jsonOk(revoked)],
    });
    setLocalChromeStatus({
      ok: true,
      paired: true,
      deviceId: DEVICE_ID,
      userId: USER_ID,
      workspaceOrigin: WORKSPACE_ORIGIN,
    });
    renderCard();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Revoke Chrome extension' }),
    );

    expect(
      await screen.findByRole('button', { name: 'Pair this Chrome' }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `${ANANSI_API_URL}/v1/browser/devices/${DEVICE_ID}/revoke`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ expected_version: 1 }),
      }),
    );
    expect(
      screen.queryByRole('button', { name: 'Confirm revoke Chrome extension' }),
    ).not.toBeInTheDocument();
  });

  it('applies a successful revoke even when the list refresh fails', async () => {
    const revoked = {
      ...device,
      revoked_at: '2026-08-27T12:10:00Z',
      version: 2,
    };
    mockFetchRouter({
      'GET /v1/browser/devices': [jsonOk([device])],
      [`POST /v1/browser/devices/${DEVICE_ID}/revoke`]: [jsonOk(revoked)],
    });
    setLocalChromeStatus({
      ok: true,
      paired: true,
      deviceId: DEVICE_ID,
      userId: USER_ID,
      workspaceOrigin: WORKSPACE_ORIGIN,
    });
    renderCard();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Revoke Chrome extension' }),
    );

    expect(
      await screen.findByRole('button', { name: 'Pair this Chrome' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Couldn't revoke the Chrome extension. Please try again.",
      ),
    ).not.toBeInTheDocument();
  });
});
