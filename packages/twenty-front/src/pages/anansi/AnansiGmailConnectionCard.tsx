import { styled } from '@linaria/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader } from 'twenty-ui/feedback';
import { InputHint, LightButton, MainButton } from 'twenty-ui/input';
import { H2Title } from 'twenty-ui/typography';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ANANSI_GMAIL_OAUTH_COMPLETION_KEY } from '@/app/effect-components/CaptureAnansiGmailOAuthFragmentEffect';
import {
  AnansiApiError,
  type AnansiGmailConnection,
  type AnansiGmailStatus,
  completeAnansiGmailOAuth,
  disconnectAnansiGmail,
  getAnansiGmailStatus,
  setAnansiPrimaryGmail,
  startAnansiGmailOAuth,
} from '~/pages/anansi/anansiProfileApi';

export const ANANSI_GMAIL_ONBOARDING_RETURN_KEY =
  'anansi:gmail-onboarding-return';

const MAX_AUTOMATIC_COMPLETION_RETRIES = 4;
const MAX_AUTOMATIC_RETRY_MULTIPLIER = 8;

const StyledSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledConnectionList = styled.div`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
`;

const StyledConnectionRow = styled.div`
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

const StyledConnectionIdentity = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledAddress = styled.span`
  color: ${themeCssVariables.font.color.primary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

const isHealthy = (connection: AnansiGmailConnection): boolean =>
  connection.state === 'ok' && connection.error_code == null;

const connectionStatusLabel = (connection: AnansiGmailConnection): string => {
  if (isHealthy(connection)) {
    return connection.is_primary ? 'Main application email' : 'Connected';
  }
  if (connection.state === 'disconnected') {
    return 'Disconnected';
  }
  return 'Needs reconnect';
};

const readPendingCompletion = (): string | null => {
  try {
    return window.sessionStorage.getItem(ANANSI_GMAIL_OAUTH_COMPLETION_KEY);
  } catch {
    return null;
  }
};

const clearPendingCompletion = () => {
  try {
    window.sessionStorage.removeItem(ANANSI_GMAIL_OAUTH_COMPLETION_KEY);
  } catch {
    // The URL fragment was already removed. A blocked storage API has no token
    // left for this page to clear.
  }
};

type AnansiGmailConnectionCardProps = {
  accessToken: string;
  returnTarget: 'onboarding' | 'profile';
  beforeRedirect?: () => Promise<void>;
  onHealthyPrimaryChange?: (isReady: boolean) => void;
  navigate?: (authorizeUrl: string) => void;
};

export const AnansiGmailConnectionCard = ({
  accessToken,
  returnTarget,
  beforeRedirect,
  onHealthyPrimaryChange,
  navigate = (authorizeUrl) => window.location.assign(authorizeUrl),
}: AnansiGmailConnectionCardProps) => {
  const [status, setStatus] = useState<AnansiGmailStatus>();
  const [statusAccessToken, setStatusAccessToken] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [statusLoadFailed, setStatusLoadFailed] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [busyConnectionId, setBusyConnectionId] = useState<string>();
  const [confirmDisconnectId, setConfirmDisconnectId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [completionRetry, setCompletionRetry] = useState(0);
  // oxlint-disable-next-line twenty/no-state-useref
  const completionAttemptRef = useRef<
    { accessToken: string; nonce: string } | undefined
  >(undefined);
  // oxlint-disable-next-line twenty/no-state-useref
  const statusRef = useRef<
    { accessToken: string; status: AnansiGmailStatus } | undefined
  >(undefined);
  // oxlint-disable-next-line twenty/no-state-useref
  const statusRequestRef = useRef(0);
  // oxlint-disable-next-line twenty/no-state-useref
  const currentAccessTokenRef = useRef(accessToken);
  currentAccessTokenRef.current = accessToken;
  // oxlint-disable-next-line twenty/no-state-useref
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setIsConnecting(false);
    setIsCompleting(false);
    setBusyConnectionId(undefined);
    setConfirmDisconnectId(undefined);
    setMessage(undefined);
    setError(undefined);
  }, [accessToken]);

  const loadStatus = useCallback(async () => {
    const requestId = statusRequestRef.current + 1;
    statusRequestRef.current = requestId;
    let nextStatus: AnansiGmailStatus;
    try {
      nextStatus = await getAnansiGmailStatus(accessToken);
    } catch (loadError) {
      if (
        !isMountedRef.current ||
        currentAccessTokenRef.current !== accessToken ||
        statusRequestRef.current !== requestId
      ) {
        return undefined;
      }
      throw loadError;
    }
    if (
      isMountedRef.current &&
      currentAccessTokenRef.current === accessToken &&
      statusRequestRef.current === requestId
    ) {
      statusRef.current = { accessToken, status: nextStatus };
      setStatus(nextStatus);
      setStatusAccessToken(accessToken);
      setStatusLoadFailed(false);
      setError(undefined);
      setIsLoading(false);
    }
    return nextStatus;
  }, [accessToken]);

  useEffect(() => {
    setIsLoading(true);
    setStatusLoadFailed(false);
    void loadStatus().catch(() => {
      if (
        isMountedRef.current &&
        currentAccessTokenRef.current === accessToken
      ) {
        setIsLoading(false);
        setStatusLoadFailed(true);
        setError("Couldn't load Gmail connections. Please try again.");
      }
    });
  }, [accessToken, loadStatus]);

  useEffect(() => {
    const pendingCompletion = readPendingCompletion();
    if (pendingCompletion === null) {
      return;
    }
    if (pendingCompletion === 'cancelled') {
      clearPendingCompletion();
      setMessage('Gmail connection cancelled.');
      return;
    }
    if (
      completionAttemptRef.current?.nonce === pendingCompletion &&
      completionAttemptRef.current.accessToken === accessToken
    ) {
      return;
    }
    completionAttemptRef.current = {
      accessToken,
      nonce: pendingCompletion,
    };

    let stopped = false;
    let retryTimer: number | undefined;
    let automaticRetryCount = 0;

    const scheduleAutomaticRetry = (baseDelayMs: number): boolean => {
      if (automaticRetryCount >= MAX_AUTOMATIC_COMPLETION_RETRIES) {
        return false;
      }
      const retryDelay =
        baseDelayMs *
        Math.min(2 ** automaticRetryCount, MAX_AUTOMATIC_RETRY_MULTIPLIER);
      automaticRetryCount += 1;
      retryTimer = window.setTimeout(() => {
        void finishCompletion();
      }, retryDelay);
      return true;
    };

    const finishCompletion = async () => {
      if (stopped) {
        return;
      }
      setIsCompleting(true);
      setError(undefined);
      setMessage(undefined);

      try {
        const result = await completeAnansiGmailOAuth(
          accessToken,
          pendingCompletion,
        );
        if ('status' in result) {
          if (scheduleAutomaticRetry(1_000)) {
            return;
          }
          setError("Couldn't finish connecting Gmail. Try again.");
          setIsCompleting(false);
          return;
        }

        clearPendingCompletion();
        try {
          await loadStatus();
        } catch {
          if (
            !stopped &&
            isMountedRef.current &&
            currentAccessTokenRef.current === accessToken
          ) {
            const previousStatus =
              statusRef.current?.accessToken === accessToken
                ? statusRef.current.status
                : undefined;
            const nextConnection = {
              ...result,
              last_success_at: null,
              error_code: null,
            };
            const otherConnections = (previousStatus?.connections ?? [])
              .filter((connection) => connection.id !== result.id)
              .map((connection) => ({
                ...connection,
                is_primary: result.is_primary ? false : connection.is_primary,
              }));
            const nextStatus: AnansiGmailStatus = {
              connections: [...otherConnections, nextConnection],
              primary_connection_id: result.is_primary
                ? result.id
                : (previousStatus?.primary_connection_id ?? null),
              main_application_email: result.is_primary
                ? result.address
                : (previousStatus?.main_application_email ?? null),
            };
            statusRef.current = { accessToken, status: nextStatus };
            setStatus(nextStatus);
            setStatusAccessToken(accessToken);
            setStatusLoadFailed(false);
            setError(undefined);
            setIsLoading(false);
          }
        }
        if (
          !stopped &&
          isMountedRef.current &&
          currentAccessTokenRef.current === accessToken
        ) {
          setMessage(`${result.address} is connected.`);
          setIsCompleting(false);
        }
      } catch (completionError) {
        try {
          await loadStatus();
        } catch {
          // Completion error remains the actionable result below.
        }
        if (
          stopped ||
          !isMountedRef.current ||
          currentAccessTokenRef.current !== accessToken
        ) {
          return;
        }

        if (
          completionError instanceof AnansiApiError &&
          completionError.status === 503 &&
          scheduleAutomaticRetry(2_000)
        ) {
          return;
        }

        if (
          completionError instanceof AnansiApiError &&
          (completionError.status === 400 || completionError.status === 409)
        ) {
          clearPendingCompletion();
        }
        setError(
          completionError instanceof AnansiApiError &&
            completionError.status === 409
            ? 'Gmail reconnect required.'
            : "Couldn't finish connecting Gmail. Try again.",
        );
        setIsCompleting(false);
      }
    };

    void finishCompletion();
    return () => {
      stopped = true;
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [accessToken, completionRetry, loadStatus]);

  const visibleStatus = statusAccessToken === accessToken ? status : undefined;
  const hasHealthyPrimary = useMemo(
    () =>
      visibleStatus?.connections.some(
        (connection) => connection.is_primary && isHealthy(connection),
      ) ?? false,
    [visibleStatus],
  );

  useEffect(() => {
    onHealthyPrimaryChange?.(hasHealthyPrimary);
  }, [hasHealthyPrimary, onHealthyPrimaryChange]);

  const beginOAuth = useCallback(
    async (accountBehavior: 'default_account' | 'choose_account') => {
      if (isConnecting) {
        return;
      }
      setIsConnecting(true);
      setError(undefined);
      setMessage(undefined);
      try {
        await beforeRedirect?.();
        if (currentAccessTokenRef.current !== accessToken) {
          if (isMountedRef.current) {
            setIsConnecting(false);
          }
          return;
        }
        if (returnTarget === 'onboarding') {
          window.sessionStorage.setItem(
            ANANSI_GMAIL_ONBOARDING_RETURN_KEY,
            'screen-7',
          );
        }
        const started = await startAnansiGmailOAuth(
          accessToken,
          returnTarget,
          accountBehavior,
        );
        if (currentAccessTokenRef.current !== accessToken) {
          if (isMountedRef.current) {
            setIsConnecting(false);
          }
          return;
        }
        navigate(started.authorize_url);
      } catch {
        if (
          isMountedRef.current &&
          currentAccessTokenRef.current === accessToken
        ) {
          setError("Couldn't start Gmail connection. Please try again.");
          setIsConnecting(false);
        }
      }
    },
    [accessToken, beforeRedirect, isConnecting, navigate, returnTarget],
  );

  const selectPrimary = useCallback(
    async (connectionId: string) => {
      setBusyConnectionId(connectionId);
      setError(undefined);
      try {
        await setAnansiPrimaryGmail(accessToken, connectionId);
        await loadStatus();
      } catch {
        if (
          isMountedRef.current &&
          currentAccessTokenRef.current === accessToken
        ) {
          setError("Couldn't change the main application email.");
        }
      } finally {
        if (
          isMountedRef.current &&
          currentAccessTokenRef.current === accessToken
        ) {
          setBusyConnectionId(undefined);
        }
      }
    },
    [accessToken, loadStatus],
  );

  const disconnect = useCallback(
    async (connectionId: string) => {
      setBusyConnectionId(connectionId);
      setError(undefined);
      try {
        await disconnectAnansiGmail(accessToken, connectionId);
        setConfirmDisconnectId(undefined);
        await loadStatus();
      } catch {
        if (
          isMountedRef.current &&
          currentAccessTokenRef.current === accessToken
        ) {
          setError("Couldn't disconnect Gmail. Please try again.");
        }
      } finally {
        if (
          isMountedRef.current &&
          currentAccessTokenRef.current === accessToken
        ) {
          setBusyConnectionId(undefined);
        }
      }
    },
    [accessToken, loadStatus],
  );

  const retryAfterError = useCallback(() => {
    if (readPendingCompletion() !== null) {
      completionAttemptRef.current = undefined;
      setCompletionRetry((current) => current + 1);
      return;
    }

    setError(undefined);
    setStatusLoadFailed(false);
    setIsLoading(true);
    void loadStatus().catch(() => {
      if (
        isMountedRef.current &&
        currentAccessTokenRef.current === accessToken
      ) {
        setIsLoading(false);
        setStatusLoadFailed(true);
        setError("Couldn't load Gmail connections. Please try again.");
      }
    });
  }, [accessToken, loadStatus]);

  return (
    <StyledSection>
      <H2Title
        title="Gmail"
        description="Anansi reads application mail and sends from connected Gmail accounts."
      />
      {isLoading && (
        <StyledLoaderRow>
          <Loader color="gray" />
        </StyledLoaderRow>
      )}
      {!isLoading && visibleStatus && visibleStatus.connections.length > 0 && (
        <StyledConnectionList>
          {visibleStatus.connections.map((connection) => (
            <StyledConnectionRow key={connection.id}>
              <StyledConnectionIdentity>
                <StyledAddress>{connection.address}</StyledAddress>
                <StyledStatus>{connectionStatusLabel(connection)}</StyledStatus>
              </StyledConnectionIdentity>
              <StyledActions>
                {!isHealthy(connection) && (
                  <LightButton
                    title={`Reconnect ${connection.address}`}
                    disabled={isConnecting}
                    onClick={() => void beginOAuth('choose_account')}
                  />
                )}
                {returnTarget === 'profile' &&
                  isHealthy(connection) &&
                  !connection.is_primary && (
                    <LightButton
                      title={`Use ${connection.address} as main`}
                      disabled={busyConnectionId === connection.id}
                      onClick={() => void selectPrimary(connection.id)}
                    />
                  )}
                {returnTarget === 'profile' &&
                  connection.state !== 'disconnected' &&
                  (confirmDisconnectId === connection.id ? (
                    <>
                      <LightButton
                        title="Keep Gmail"
                        onClick={() => setConfirmDisconnectId(undefined)}
                      />
                      <LightButton
                        title={`Confirm disconnect ${connection.address}`}
                        disabled={busyConnectionId === connection.id}
                        onClick={() => void disconnect(connection.id)}
                      />
                    </>
                  ) : (
                    <LightButton
                      title={`Disconnect ${connection.address}`}
                      disabled={busyConnectionId === connection.id}
                      onClick={() => setConfirmDisconnectId(connection.id)}
                    />
                  ))}
              </StyledActions>
            </StyledConnectionRow>
          ))}
        </StyledConnectionList>
      )}
      {!isLoading && visibleStatus && !hasHealthyPrimary && (
        <MainButton
          title={isConnecting ? 'Opening Google…' : 'Connect Gmail'}
          disabled={isConnecting || isCompleting}
          onClick={() => void beginOAuth('default_account')}
          fullWidth
        />
      )}
      {!isLoading && hasHealthyPrimary && (
        <LightButton
          title={isConnecting ? 'Opening Google…' : 'Add another Gmail'}
          disabled={isConnecting || isCompleting}
          onClick={() => void beginOAuth('choose_account')}
        />
      )}
      {isCompleting && <InputHint>Connecting Gmail…</InputHint>}
      {message && <InputHint>{message}</InputHint>}
      {error && (
        <>
          <InputHint danger>{error}</InputHint>
          {(readPendingCompletion() !== null || statusLoadFailed) && (
            <LightButton title="Try again" onClick={retryAfterError} />
          )}
        </>
      )}
    </StyledSection>
  );
};
