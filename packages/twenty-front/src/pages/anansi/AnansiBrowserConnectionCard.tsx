import { styled } from '@linaria/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader } from 'twenty-ui/feedback';
import { InputHint, LightButton, MainButton } from 'twenty-ui/input';
import { H2Title } from 'twenty-ui/typography';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ANANSI_BROWSER_EXTENSION_ID } from '@/auth/constants/AnansiBrowserExtensionId';
import {
  type AnansiBrowserDevice,
  type AnansiBrowserPairingStart,
  type AnansiBrowserPreference,
  getAnansiBrowserDevices,
  getAnansiBrowserPreferences,
  patchAnansiBrowserPreferences,
  revokeAnansiBrowserDevice,
  startAnansiBrowserPairing,
} from '~/pages/anansi/anansiProfileApi';

const EXTENSION_RESPONSE_TIMEOUT_MS = 15_000;
const HEALTHY_HEARTBEAT_WINDOW_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const currentDate = () => new Date();

const StyledSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledDeviceList = styled.div`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
`;

const StyledDeviceRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: space-between;
  min-width: 0;
  padding: ${themeCssVariables.spacing[3]};

  & + & {
    border-top: 1px solid ${themeCssVariables.border.color.light};
  }
`;

const StyledDeviceIdentity = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledDeviceName = styled.span`
  color: ${themeCssVariables.font.color.primary};
`;

const StyledStatus = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
`;

const StyledLoaderRow = styled.div`
  display: flex;
  justify-content: center;
  padding: ${themeCssVariables.spacing[4]};
`;

type ChromeRuntimePort = {
  lastError?: { message?: string };
  sendMessage(
    extensionId: string,
    message: unknown,
    callback: (response: unknown) => void,
  ): void;
};

type ExternalPairingResponse = {
  ok: true;
  deviceId: string;
  tokenExpiresAt: string;
  replayed: boolean;
};

type ExternalStatusResponse =
  | { ok: true; paired: false }
  | {
      ok: true;
      paired: true;
      deviceId: string;
      userId: string;
      workspaceOrigin: string;
    };

class BrowserExtensionUnavailable extends Error {}

const getChromeRuntime = (): ChromeRuntimePort | undefined =>
  (
    globalThis as typeof globalThis & {
      chrome?: { runtime?: ChromeRuntimePort };
    }
  ).chrome?.runtime;

const isPairingResponse = (
  value: unknown,
): value is ExternalPairingResponse => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const response = value as Partial<ExternalPairingResponse>;
  return (
    response.ok === true &&
    typeof response.deviceId === 'string' &&
    UUID_PATTERN.test(response.deviceId) &&
    typeof response.tokenExpiresAt === 'string' &&
    !Number.isNaN(Date.parse(response.tokenExpiresAt)) &&
    typeof response.replayed === 'boolean'
  );
};

const isStatusResponse = (value: unknown): value is ExternalStatusResponse => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const response = value as Partial<ExternalStatusResponse>;
  if (response.ok !== true || typeof response.paired !== 'boolean') {
    return false;
  }
  if (!response.paired) {
    return true;
  }
  return (
    typeof response.deviceId === 'string' &&
    UUID_PATTERN.test(response.deviceId) &&
    typeof response.userId === 'string' &&
    UUID_PATTERN.test(response.userId) &&
    typeof response.workspaceOrigin === 'string'
  );
};

const sendExtensionMessage = <T,>(
  message: unknown,
  isResponse: (value: unknown) => value is T,
): Promise<T> => {
  const runtime = getChromeRuntime();
  if (runtime === undefined || typeof runtime.sendMessage !== 'function') {
    return Promise.reject(new BrowserExtensionUnavailable());
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = globalThis.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new BrowserExtensionUnavailable());
      }
    }, EXTENSION_RESPONSE_TIMEOUT_MS);
    const finish = (response: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timeoutId);
      if (runtime.lastError !== undefined) {
        reject(new BrowserExtensionUnavailable());
        return;
      }
      if (!isResponse(response)) {
        reject(new Error('browser extension response changed'));
        return;
      }
      resolve(response);
    };

    try {
      runtime.sendMessage(ANANSI_BROWSER_EXTENSION_ID, message, finish);
    } catch {
      globalThis.clearTimeout(timeoutId);
      settled = true;
      reject(new BrowserExtensionUnavailable());
    }
  });
};

const getLocalChromeStatus = (): Promise<ExternalStatusResponse> =>
  sendExtensionMessage({ type: 'anansi.browser.status.v1' }, isStatusResponse);

const sendPairingToExtension = (
  pairing: AnansiBrowserPairingStart,
  workspaceOrigin: string,
): Promise<ExternalPairingResponse> => {
  if (
    pairing.extension_id !== ANANSI_BROWSER_EXTENSION_ID ||
    pairing.workspace_origin !== workspaceOrigin
  ) {
    throw new Error('browser pairing changed');
  }

  return sendExtensionMessage(
    {
      type: 'anansi.browser.pair.v1',
      userId: pairing.user_id,
      intentId: pairing.intent_id,
      token: pairing.token,
      nonce: pairing.nonce,
      extensionId: pairing.extension_id,
      workspaceOrigin: pairing.workspace_origin,
    },
    isPairingResponse,
  );
};

const belongsToConfiguredExtension = (device: AnansiBrowserDevice): boolean =>
  device.extension_id === ANANSI_BROWSER_EXTENSION_ID;

const activeDevice = (device: AnansiBrowserDevice): boolean =>
  device.revoked_at === null && belongsToConfiguredExtension(device);

const healthyDevice = (device: AnansiBrowserDevice, now: Date): boolean => {
  if (device.last_heartbeat_at === null) {
    return false;
  }
  const heartbeatAt = Date.parse(device.last_heartbeat_at);
  return (
    !Number.isNaN(heartbeatAt) &&
    heartbeatAt > now.getTime() - HEALTHY_HEARTBEAT_WINDOW_MS
  );
};

const lastSeenLabel = (device: AnansiBrowserDevice): string =>
  device.last_heartbeat_at === null
    ? 'Paired'
    : `Last seen ${new Date(device.last_heartbeat_at).toLocaleString()}`;

type AnansiBrowserConnectionCardProps = {
  accessToken: string;
  onPairedChange?: (isPaired: boolean) => void;
  workspaceOrigin?: string;
  now?: () => Date;
};

export const AnansiBrowserConnectionCard = ({
  accessToken,
  onPairedChange,
  workspaceOrigin = globalThis.location.origin,
  now = currentDate,
}: AnansiBrowserConnectionCardProps) => {
  const [devices, setDevices] = useState<AnansiBrowserDevice[]>();
  const [preference, setPreference] = useState<AnansiBrowserPreference>();
  const [localStatus, setLocalStatus] = useState<ExternalStatusResponse>();
  const [stateAccessToken, setStateAccessToken] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [isPairing, setIsPairing] = useState(false);
  const [isSavingRemote, setIsSavingRemote] = useState(false);
  const [busyDeviceId, setBusyDeviceId] = useState<string>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  // oxlint-disable-next-line twenty/no-state-useref
  const isMountedRef = useRef(true);
  // oxlint-disable-next-line twenty/no-state-useref
  const currentAccessTokenRef = useRef(accessToken);
  currentAccessTokenRef.current = accessToken;
  // oxlint-disable-next-line twenty/no-state-useref
  const requestIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadState = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    let nextDevices: AnansiBrowserDevice[];
    let nextPreference: AnansiBrowserPreference;
    try {
      [nextDevices, nextPreference] = await Promise.all([
        getAnansiBrowserDevices(accessToken),
        getAnansiBrowserPreferences(accessToken),
      ]);
    } catch (loadError) {
      if (
        !isMountedRef.current ||
        currentAccessTokenRef.current !== accessToken ||
        requestIdRef.current !== requestId
      ) {
        return undefined;
      }
      throw loadError;
    }
    const nextLocalStatus = await getLocalChromeStatus().catch(() => ({
      ok: true as const,
      paired: false as const,
    }));
    if (
      isMountedRef.current &&
      currentAccessTokenRef.current === accessToken &&
      requestIdRef.current === requestId
    ) {
      setDevices(nextDevices);
      setPreference(nextPreference);
      setLocalStatus(nextLocalStatus);
      setStateAccessToken(accessToken);
      setLoadFailed(false);
      setError(undefined);
      setIsLoading(false);
    }
    return nextDevices;
  }, [accessToken]);

  useEffect(() => {
    setDevices(undefined);
    setPreference(undefined);
    setLocalStatus(undefined);
    setStateAccessToken(undefined);
    setIsLoading(true);
    setIsPairing(false);
    setIsSavingRemote(false);
    setBusyDeviceId(undefined);
    setMessage(undefined);
    setError(undefined);
    setLoadFailed(false);
    void loadState().catch(() => {
      if (
        isMountedRef.current &&
        currentAccessTokenRef.current === accessToken
      ) {
        setIsLoading(false);
        setLoadFailed(true);
        setError("Couldn't load browser connections. Please try again.");
      }
    });
  }, [accessToken, loadState]);

  const visibleDevices = stateAccessToken === accessToken ? devices : undefined;
  const visiblePreference =
    stateAccessToken === accessToken ? preference : undefined;
  const visibleLocalStatus =
    stateAccessToken === accessToken ? localStatus : undefined;
  const configuredDevices = useMemo(
    () =>
      visibleDevices?.filter(
        (device) =>
          belongsToConfiguredExtension(device) &&
          device.workspace_origin === workspaceOrigin,
      ) ?? [],
    [visibleDevices, workspaceOrigin],
  );
  const activeDevices = useMemo(
    () => configuredDevices.filter(activeDevice),
    [configuredDevices],
  );
  const localDevice = useMemo(() => {
    if (
      visibleLocalStatus?.paired !== true ||
      visibleLocalStatus.workspaceOrigin !== workspaceOrigin
    ) {
      return undefined;
    }
    return activeDevices.find(
      (device) =>
        device.id === visibleLocalStatus.deviceId &&
        device.workspace_origin === workspaceOrigin,
    );
  }, [activeDevices, visibleLocalStatus, workspaceOrigin]);
  const isPaired =
    localDevice !== undefined && healthyDevice(localDevice, now());
  const isRemoteReady =
    visiblePreference?.remote_fallback_enabled === true &&
    visiblePreference.remote_state === 'healthy';
  const isBrowserReady =
    activeDevices.some((device) => healthyDevice(device, now())) ||
    isRemoteReady;
  const needsReconnect = visibleLocalStatus?.paired === true && !isPaired;
  const localDeviceId =
    visibleLocalStatus?.paired === true
      ? visibleLocalStatus.deviceId
      : undefined;
  const otherDevices = configuredDevices.filter(
    (device) => device.id !== localDeviceId,
  );
  const displayedDevices = localDevice
    ? [localDevice, ...otherDevices]
    : otherDevices;

  useEffect(() => {
    onPairedChange?.(isBrowserReady);
  }, [isBrowserReady, onPairedChange]);

  const pair = useCallback(async () => {
    if (isPairing) {
      return;
    }
    setIsPairing(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await getLocalChromeStatus();
      const pairing = await startAnansiBrowserPairing(
        accessToken,
        ANANSI_BROWSER_EXTENSION_ID,
      );
      if (
        !isMountedRef.current ||
        currentAccessTokenRef.current !== accessToken
      ) {
        return;
      }
      const paired = await sendPairingToExtension(pairing, workspaceOrigin);
      if (
        !isMountedRef.current ||
        currentAccessTokenRef.current !== accessToken
      ) {
        return;
      }
      try {
        await loadState();
      } catch {
        if (
          isMountedRef.current &&
          currentAccessTokenRef.current === accessToken
        ) {
          setLocalStatus({
            ok: true,
            paired: true,
            deviceId: paired.deviceId,
            userId: pairing.user_id,
            workspaceOrigin: pairing.workspace_origin,
          });
          setStateAccessToken(accessToken);
          setLoadFailed(true);
          setIsLoading(false);
          setMessage('Chrome paired. Refresh browser status to finish.');
          setError(undefined);
        }
        return;
      }
      if (
        isMountedRef.current &&
        currentAccessTokenRef.current === accessToken
      ) {
        setMessage('Chrome paired.');
      }
    } catch (pairingError) {
      if (
        isMountedRef.current &&
        currentAccessTokenRef.current === accessToken
      ) {
        setError(
          pairingError instanceof BrowserExtensionUnavailable
            ? 'Install or enable the Anansi Chrome extension, then try again.'
            : "Couldn't pair this Chrome. Please try again.",
        );
      }
    } finally {
      if (
        isMountedRef.current &&
        currentAccessTokenRef.current === accessToken
      ) {
        setIsPairing(false);
      }
    }
  }, [accessToken, isPairing, loadState, workspaceOrigin]);

  const revoke = useCallback(
    async (device: AnansiBrowserDevice) => {
      setBusyDeviceId(device.id);
      setError(undefined);
      try {
        const revoked = await revokeAnansiBrowserDevice(
          accessToken,
          device.id,
          device.version,
        );
        if (
          !isMountedRef.current ||
          currentAccessTokenRef.current !== accessToken
        ) {
          return;
        }
        setDevices((current) =>
          current?.map((candidate) =>
            candidate.id === revoked.id ? revoked : candidate,
          ),
        );
        await loadState().catch(() => undefined);
      } catch {
        if (
          isMountedRef.current &&
          currentAccessTokenRef.current === accessToken
        ) {
          setError("Couldn't revoke the Chrome extension. Please try again.");
        }
      } finally {
        if (
          isMountedRef.current &&
          currentAccessTokenRef.current === accessToken
        ) {
          setBusyDeviceId(undefined);
        }
      }
    },
    [accessToken, loadState],
  );

  const setRemoteFallback = useCallback(
    async (enabled: boolean) => {
      if (visiblePreference === undefined || isSavingRemote) {
        return;
      }
      setIsSavingRemote(true);
      setError(undefined);
      setMessage(undefined);
      try {
        const nextPreference = await patchAnansiBrowserPreferences(
          accessToken,
          {
            preferred_runtime: enabled ? 'remote' : 'extension',
            remote_fallback_enabled: enabled,
            expected_version: visiblePreference.version,
          },
        );
        if (
          isMountedRef.current &&
          currentAccessTokenRef.current === accessToken
        ) {
          setPreference(nextPreference);
          setStateAccessToken(accessToken);
          setMessage(
            enabled ? 'Remote fallback enabled.' : 'Remote fallback disabled.',
          );
        }
      } catch {
        if (
          isMountedRef.current &&
          currentAccessTokenRef.current === accessToken
        ) {
          setError("Couldn't update remote fallback. Please try again.");
        }
      } finally {
        if (
          isMountedRef.current &&
          currentAccessTokenRef.current === accessToken
        ) {
          setIsSavingRemote(false);
        }
      }
    },
    [accessToken, isSavingRemote, visiblePreference],
  );

  const retryLoad = useCallback(() => {
    setIsLoading(true);
    setLoadFailed(false);
    setError(undefined);
    void loadState().catch(() => {
      if (
        isMountedRef.current &&
        currentAccessTokenRef.current === accessToken
      ) {
        setIsLoading(false);
        setLoadFailed(true);
        setError("Couldn't load browser connections. Please try again.");
      }
    });
  }, [accessToken, loadState]);

  return (
    <StyledSection>
      <H2Title
        title="Browser automation"
        description="Pair Anansi with Chrome to fill supported job applications."
      />
      {isLoading && (
        <StyledLoaderRow>
          <Loader color="gray" />
        </StyledLoaderRow>
      )}
      {!isLoading && displayedDevices.length > 0 && (
        <StyledDeviceList>
          {displayedDevices.map((device) => {
            const isThisChrome = device.id === localDevice?.id;
            const isRevoked = device.revoked_at !== null;
            const isHealthy = !isRevoked && healthyDevice(device, now());
            return (
              <StyledDeviceRow key={device.id}>
                <StyledDeviceIdentity>
                  <StyledDeviceName>
                    {isRevoked
                      ? 'Browser revoked'
                      : isHealthy
                        ? isThisChrome
                          ? 'Browser ready'
                          : 'Other browser ready'
                        : 'Browser stale'}
                  </StyledDeviceName>
                  <StyledStatus>{lastSeenLabel(device)}</StyledStatus>
                </StyledDeviceIdentity>
                {!isRevoked && (
                  <StyledActions>
                    <LightButton
                      title="Revoke Chrome extension"
                      disabled={busyDeviceId === device.id}
                      onClick={() => void revoke(device)}
                    />
                  </StyledActions>
                )}
              </StyledDeviceRow>
            );
          })}
        </StyledDeviceList>
      )}
      {!isLoading && needsReconnect && (
        <InputHint danger>This Chrome needs reconnect</InputHint>
      )}
      {!isLoading && visiblePreference !== undefined && (
        <StyledDeviceRow>
          <StyledDeviceIdentity>
            <StyledDeviceName>
              {visiblePreference.remote_fallback_enabled
                ? isRemoteReady
                  ? 'Remote fallback ready'
                  : 'Remote fallback unavailable'
                : visiblePreference.remote_state === 'healthy'
                  ? 'Remote fallback available'
                  : 'Remote fallback unavailable'}
            </StyledDeviceName>
            <StyledStatus>
              {visiblePreference.last_health_at === null
                ? 'No remote heartbeat'
                : `Last checked ${new Date(
                    visiblePreference.last_health_at,
                  ).toLocaleString()}`}
            </StyledStatus>
          </StyledDeviceIdentity>
          <StyledActions>
            <LightButton
              title={
                visiblePreference.remote_fallback_enabled
                  ? 'Disable remote fallback'
                  : 'Enable remote fallback'
              }
              disabled={isSavingRemote}
              onClick={() =>
                void setRemoteFallback(
                  !visiblePreference.remote_fallback_enabled,
                )
              }
            />
          </StyledActions>
        </StyledDeviceRow>
      )}
      {!isLoading && !isPaired && !loadFailed && (
        <MainButton
          title={isPairing ? 'Pairing Chrome…' : 'Pair this Chrome'}
          disabled={isPairing}
          onClick={() => void pair()}
          fullWidth
        />
      )}
      {message && <InputHint>{message}</InputHint>}
      {error && <InputHint danger>{error}</InputHint>}
      {loadFailed && <LightButton title="Try again" onClick={retryLoad} />}
    </StyledSection>
  );
};
