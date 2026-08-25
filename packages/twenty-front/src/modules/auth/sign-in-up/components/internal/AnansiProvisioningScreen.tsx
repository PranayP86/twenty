// ANANSI PATCH: whole file — zero-form auto-provisioning screen shown to
// non-admin users reaching WorkspaceCreation. Auto-submits workspace
// creation, provisions the new workspace against Anansi Core, then follows
// the stock post-creation redirect. Renders an invite-only request-access
// card if the server denies creation (allowlist gate, see task 9), or a
// simple retry state on transient failures.
import { ANANSI_API_URL } from '@/auth/constants/AnansiApiUrl';
import { SubTitle } from '@/auth/components/SubTitle';
import { Title } from '@/auth/components/Title';
import { renewToken } from '@/auth/services/AuthService';
import { useSignInWithGoogle } from '@/auth/sign-in-up/hooks/useSignInWithGoogle';
import { currentUserState } from '@/auth/states/currentUserState';
import { isCreatingWorkspaceState } from '@/auth/states/isCreatingWorkspaceState';
import { isMultiWorkspaceEnabledState } from '@/client-config/states/isMultiWorkspaceEnabledState';
import { useRedirectToWorkspaceDomain } from '@/domain-manager/hooks/useRedirectToWorkspaceDomain';
import { OnboardingModalCircularIcon } from '@/onboarding/components/OnboardingModalCircularIcon';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useApolloClient, useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppPath } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Loader } from 'twenty-ui/feedback';
import { IconAlertTriangle, IconLock, IconMail } from 'twenty-ui/icon';
import { MainButton } from 'twenty-ui/input';
import { AnimatedEaseIn } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  ActivateWorkspaceDocument,
  type AuthTokenPair,
  GetAuthTokensFromLoginTokenDocument,
  GetCurrentUserDocument,
  SignUpInNewWorkspaceDocument,
} from '~/generated-metadata/graphql';
import { getWorkspaceUrl } from '~/utils/getWorkspaceUrl';
import { isGraphqlErrorOfType } from '~/utils/is-graphql-error-of-type.util';
// ANANSI PATCH (WS-B): provision failures block + retry
import { sleep } from '~/utils/sleep';

const StyledContainer = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[8]};
  width: 100%;
`;

const StyledTextContainer = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  text-align: center;
`;

const StyledLoaderRow = styled.div`
  align-items: center;
  display: flex;
  justify-content: center;
`;

const StyledButtonContainer = styled.div`
  max-width: 240px;
  width: 100%;
`;

// ANANSI PATCH (WS-B): provision failures block + retry — 'provisionError' is
// a distinct blocking phase from 'error' (workspace creation itself failed):
// here the workspace already exists, only the Core provision call failed.
type ProvisioningPhase =
  | 'creating'
  | 'denied'
  | 'requestSent'
  | 'error'
  | 'provisionError';

type ProvisioningRetryContext = {
  loginToken: string;
  loginTokenExpiresAt?: string;
  tokenPair?: AuthTokenPair;
  workspaceId: string;
  workspaceUrl: string;
};

// Workspace name = email local-part, capitalized. Dumb and predictable on
// purpose (e.g. jane.doe@gmail.com -> "Jane.doe") — there is no form for the
// user to name it themselves.
const getWorkspaceDisplayNameFromEmail = (email: string): string => {
  const localPart = email.split('@')[0] || email;
  return localPart.charAt(0).toUpperCase() + localPart.slice(1);
};

// ANANSI PATCH (WS-B): provision failures block + retry — this call used to
// be best-effort (logged, never blocked the redirect). It now reports
// success/failure so the caller can hold the user out of the workspace
// until Core has actually provisioned it.
const provisionWorkspace = async (accessToken: string): Promise<boolean> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`${ANANSI_API_URL}/v1/provision`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: controller.signal,
    });

    if (!response.ok) {
      // oxlint-disable-next-line no-console
      console.error(`ANANSI: /v1/provision returned ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.error('ANANSI: /v1/provision request failed', error);
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
};

// ANANSI PATCH (WS-B): provision failures block + retry — one silent
// automatic retry after a short delay absorbs transient blips (a cold
// Core pod, a dropped connection) before surfacing the blocking card.
const PROVISION_RETRY_DELAY_MS = 2_000;

const provisionWorkspaceWithSilentRetry = async (
  accessToken: string,
): Promise<boolean> => {
  if (await provisionWorkspace(accessToken)) {
    return true;
  }

  await sleep(PROVISION_RETRY_DELAY_MS);

  return provisionWorkspace(accessToken);
};

export const AnansiProvisioningScreen = () => {
  const { t } = useLingui();
  const currentUser = useAtomStateValue(currentUserState);
  const isMultiWorkspaceEnabled = useAtomStateValue(
    isMultiWorkspaceEnabledState,
  );
  const setIsCreatingWorkspace = useSetAtomState(isCreatingWorkspaceState);
  const { redirectToWorkspaceDomain } = useRedirectToWorkspaceDomain();
  const { signInWithGoogle } = useSignInWithGoogle();
  const apolloClient = useApolloClient();

  const [signUpInNewWorkspaceMutation] = useMutation(
    SignUpInNewWorkspaceDocument,
  );
  const [getAuthTokensFromLoginTokenMutation] = useMutation(
    GetAuthTokensFromLoginTokenDocument,
  );
  const [activateWorkspaceMutation] = useMutation(ActivateWorkspaceDocument);

  const exchangeLoginToken = useCallback(
    async ({
      loginToken,
      workspaceUrl,
    }: ProvisioningRetryContext): Promise<AuthTokenPair | undefined> => {
      try {
        const { data } = await getAuthTokensFromLoginTokenMutation({
          variables: {
            loginToken,
            origin: workspaceUrl,
          },
        });

        return data?.getAuthTokensFromLoginToken.tokens;
      } catch (error) {
        // oxlint-disable-next-line no-console
        console.error(
          'ANANSI: could not exchange login token for provisioning',
          error,
        );
        return undefined;
      }
    },
    [getAuthTokensFromLoginTokenMutation],
  );

  const getFreshLoginToken = useCallback(
    async (
      retryContext: ProvisioningRetryContext,
    ): Promise<string | undefined> => {
      const accessToken =
        retryContext.tokenPair?.accessOrWorkspaceAgnosticToken.token;

      if (!isDefined(accessToken)) {
        return undefined;
      }

      try {
        const { data } = await apolloClient.query({
          query: GetCurrentUserDocument,
          fetchPolicy: 'network-only',
          context: {
            skipAuthToken: true,
            headers: {
              authorization: `Bearer ${accessToken}`,
            },
          },
        });
        const matchingWorkspace =
          data?.currentUser?.availableWorkspaces.availableWorkspacesForSignIn.find(
            (workspace) => workspace.id === retryContext.workspaceId,
          );

        if (!isDefined(matchingWorkspace?.loginToken)) {
          return undefined;
        }

        retryContext.loginToken = matchingWorkspace.loginToken;
        retryContext.loginTokenExpiresAt = undefined;
        return matchingWorkspace.loginToken;
      } catch (error) {
        // oxlint-disable-next-line no-console
        console.error(
          'ANANSI: could not refresh login token for provisioning',
          error,
        );
        return undefined;
      }
    },
    [apolloClient],
  );

  const getCurrentTokenPair = useCallback(
    async (
      retryContext: ProvisioningRetryContext,
    ): Promise<AuthTokenPair | undefined> => {
      const loginTokenIsExpired =
        isDefined(retryContext.loginTokenExpiresAt) &&
        Date.parse(retryContext.loginTokenExpiresAt) <= Date.now();
      const tokenPair = loginTokenIsExpired
        ? undefined
        : await exchangeLoginToken(retryContext);

      if (isDefined(tokenPair)) {
        retryContext.tokenPair = tokenPair;
        return tokenPair;
      }

      if (!isDefined(retryContext.tokenPair)) {
        if (loginTokenIsExpired) {
          signInWithGoogle({ action: 'list-available-workspaces' });
        }

        return undefined;
      }

      let freshLoginToken = await getFreshLoginToken(retryContext);

      if (!isDefined(freshLoginToken)) {
        try {
          const renewedTokenPair = await renewToken(
            `${retryContext.workspaceUrl}/metadata`,
            retryContext.tokenPair,
          );

          if (!isDefined(renewedTokenPair)) {
            return undefined;
          }

          retryContext.tokenPair = renewedTokenPair;
          freshLoginToken = await getFreshLoginToken(retryContext);
        } catch (error) {
          // oxlint-disable-next-line no-console
          console.error(
            'ANANSI: could not renew workspace token for provisioning',
            error,
          );
          return undefined;
        }
      }

      if (!isDefined(freshLoginToken)) {
        return undefined;
      }

      const refreshedTokenPair = await exchangeLoginToken(retryContext);

      if (isDefined(refreshedTokenPair)) {
        retryContext.tokenPair = refreshedTokenPair;
      }

      return refreshedTokenPair;
    },
    [exchangeLoginToken, getFreshLoginToken, signInWithGoogle],
  );

  const activateNewWorkspace = useCallback(
    async (accessToken: string): Promise<boolean> => {
      try {
        const result = await activateWorkspaceMutation({
          variables: { input: {} },
          context: {
            skipAuthToken: true,
            headers: {
              authorization: `Bearer ${accessToken}`,
            },
          },
        });

        return (
          !isDefined(result.error) &&
          isDefined(result.data?.activateWorkspace.id)
        );
      } catch (error) {
        // oxlint-disable-next-line no-console
        console.error('ANANSI: workspace activation failed', error);
        return false;
      }
    },
    [activateWorkspaceMutation],
  );

  const [phase, setPhase] = useState<ProvisioningPhase>('creating');
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);
  // ANANSI PATCH (WS-C): save workspace identity before token exchange. A
  // failed exchange must retry this workspace, never create another one.
  const provisionRetryContextRef = useRef<ProvisioningRetryContext | null>(
    null,
  );
  const [isRetryingProvision, setIsRetryingProvision] = useState(false);
  const hasStartedRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    // ANANSI PATCH: reset on (re-)mount, not only cleared in cleanup — under
    // StrictMode's dev-only double-invoke this ref would otherwise get stuck
    // `false` forever after the synthetic mount->cleanup->remount, silently
    // swallowing every later setPhase('denied'/'error') call.
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const email = currentUser?.email;

    if (hasStartedRef.current || !isDefined(email)) {
      return;
    }
    hasStartedRef.current = true;

    const run = async () => {
      setIsCreatingWorkspace(true);

      try {
        const { data } = await signUpInNewWorkspaceMutation({
          variables: {
            input: { displayName: getWorkspaceDisplayNameFromEmail(email) },
          },
        });

        if (!isDefined(data?.signUpInNewWorkspace)) {
          throw new Error('No signUpInNewWorkspace result');
        }

        const { workspace, loginToken } = data.signUpInNewWorkspace;
        const workspaceUrl = getWorkspaceUrl(workspace.workspaceUrls);

        if (isMultiWorkspaceEnabled) {
          // ANANSI PATCH (WS-C): save the created workspace before exchanging
          // its reusable login token. Exchange failure must block entry and
          // retry this same workspace instead of falling through or signing up
          // again.
          const retryContext: ProvisioningRetryContext = {
            loginToken: loginToken.token,
            loginTokenExpiresAt: loginToken.expiresAt,
            workspaceId: workspace.id,
            workspaceUrl,
          };
          provisionRetryContextRef.current = retryContext;

          const tokenPair = await getCurrentTokenPair(retryContext);

          if (!isDefined(tokenPair)) {
            if (isMountedRef.current) {
              setIsCreatingWorkspace(false);
              setPhase('provisionError');
            }
            return;
          }

          retryContext.tokenPair = tokenPair;
          const accessToken = tokenPair.accessOrWorkspaceAgnosticToken.token;

          const isActivated = await activateNewWorkspace(accessToken);

          // ANANSI PATCH (WS-B): activation or provision failures block +
          // retry. Core requires activation to create the Standard application
          // before provisioning can resolve its application ID.
          if (!isActivated) {
            if (!isMountedRef.current) {
              return;
            }

            setIsCreatingWorkspace(false);
            setPhase('provisionError');
            return;
          }

          const isProvisioned =
            await provisionWorkspaceWithSilentRetry(accessToken);

          if (!isProvisioned) {
            if (!isMountedRef.current) {
              return;
            }

            setIsCreatingWorkspace(false);
            setPhase('provisionError');
            return;
          }
        }

        if (isMultiWorkspaceEnabled) {
          await redirectToWorkspaceDomain(
            workspaceUrl,
            AppPath.Verify,
            { loginToken: loginToken.token },
            '_self',
          );
        }
        // Self-host (!isMultiWorkspaceEnabled): nothing left to do here —
        // matches the stock hook, which also does not navigate in this
        // branch; some other already-existing app effect picks up the
        // freshly-set auth tokens and moves the user forward.
      } catch (error) {
        if (!isMountedRef.current) {
          return;
        }

        // ANANSI PATCH: match only the allowlist-denial's dedicated subCode,
        // not the generic FORBIDDEN_EXCEPTION — the workspace-count-limit
        // throw (MAX_WORKSPACES_WITHOUT_ENTERPRISE_KEY) also uses
        // FORBIDDEN_EXCEPTION and is not an allowlist denial; it must fall
        // through to the transient/error retry path below, not this
        // invite-only card.
        if (isGraphqlErrorOfType(error, 'ANANSI_NOT_ALLOWLISTED')) {
          setIsCreatingWorkspace(false);
          setPhase('denied');
          return;
        }

        setIsCreatingWorkspace(false);
        setPhase('error');
      }
    };

    run();
  }, [
    activateNewWorkspace,
    currentUser?.email,
    getCurrentTokenPair,
    isMultiWorkspaceEnabled,
    redirectToWorkspaceDomain,
    setIsCreatingWorkspace,
    signUpInNewWorkspaceMutation,
  ]);

  const handleRetry = () => {
    hasStartedRef.current = false;
    setPhase('creating');
  };

  // ANANSI PATCH (WS-B): activation or provision failures block + retry.
  // The workspace already exists, so retry re-runs activation and provision
  // without repeating signup.
  const handleRetryProvision = async () => {
    const retryContext = provisionRetryContextRef.current;

    if (!isDefined(retryContext) || isRetryingProvision) {
      return;
    }

    setIsRetryingProvision(true);

    const tokenPair = await getCurrentTokenPair(retryContext);

    if (!isDefined(tokenPair)) {
      if (isMountedRef.current) {
        setIsRetryingProvision(false);
      }
      return;
    }

    retryContext.tokenPair = tokenPair;
    const accessToken = tokenPair.accessOrWorkspaceAgnosticToken.token;
    const isActivated = await activateNewWorkspace(accessToken);

    if (!isActivated) {
      if (isMountedRef.current) {
        setIsRetryingProvision(false);
      }
      return;
    }

    const isProvisioned = await provisionWorkspace(accessToken);

    if (!isMountedRef.current) {
      return;
    }

    setIsRetryingProvision(false);

    if (!isProvisioned) {
      // Stay on the provisionError card; the context ref is untouched so
      // another click can try again.
      return;
    }

    if (isMultiWorkspaceEnabled) {
      await redirectToWorkspaceDomain(
        retryContext.workspaceUrl,
        AppPath.Verify,
        { loginToken: retryContext.loginToken },
        '_self',
      );
    }
  };

  const handleRequestAccess = () => {
    const email = currentUser?.email;

    if (!isDefined(email) || isRequestingAccess) {
      return;
    }

    // Disable + show the confirmation optimistically: the server upsert is
    // idempotent, and a 429 (rate-limited) still means the request likely
    // already landed, so there is nothing useful a different UI state would
    // add here. No retry storm.
    setIsRequestingAccess(true);
    setPhase('requestSent');

    fetch(`${ANANSI_API_URL}/v1/allowlist/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch((error) => {
      // oxlint-disable-next-line no-console
      console.error('ANANSI: allowlist request failed', error);
    });
  };

  if (phase === 'denied' || phase === 'requestSent') {
    return (
      <StyledContainer>
        <AnimatedEaseIn>
          <OnboardingModalCircularIcon
            Icon={phase === 'requestSent' ? IconMail : IconLock}
          />
        </AnimatedEaseIn>
        <StyledTextContainer>
          <Title animate noMarginTop>
            {t`Anansi is invite-only`}
          </Title>
          {phase === 'requestSent' && (
            <SubTitle>{t`You'll get an email when you're approved.`}</SubTitle>
          )}
        </StyledTextContainer>
        {phase === 'denied' && (
          <StyledButtonContainer>
            <MainButton
              title={t`Request access`}
              onClick={handleRequestAccess}
              disabled={isRequestingAccess}
              fullWidth
            />
          </StyledButtonContainer>
        )}
      </StyledContainer>
    );
  }

  if (phase === 'error') {
    return (
      <StyledContainer>
        <AnimatedEaseIn>
          <OnboardingModalCircularIcon Icon={IconAlertTriangle} />
        </AnimatedEaseIn>
        <StyledTextContainer>
          <Title animate noMarginTop>
            {t`Something went wrong`}
          </Title>
          <SubTitle>{t`We couldn't set up your workspace. Please try again.`}</SubTitle>
        </StyledTextContainer>
        <StyledButtonContainer>
          <MainButton title={t`Try again`} onClick={handleRetry} fullWidth />
        </StyledButtonContainer>
      </StyledContainer>
    );
  }

  // ANANSI PATCH (WS-B): provision failures block + retry — distinct card
  // from the generic 'error' phase above: the workspace was created, only
  // the Core provision call failed, so the user must not fall through into
  // a half-provisioned workspace.
  if (phase === 'provisionError') {
    return (
      <StyledContainer>
        <AnimatedEaseIn>
          <OnboardingModalCircularIcon Icon={IconAlertTriangle} />
        </AnimatedEaseIn>
        <StyledTextContainer>
          <Title animate noMarginTop>
            {t`Couldn't finish setting up your workspace`}
          </Title>
        </StyledTextContainer>
        <StyledButtonContainer>
          <MainButton
            title={t`Try again`}
            onClick={handleRetryProvision}
            disabled={isRetryingProvision}
            fullWidth
          />
        </StyledButtonContainer>
      </StyledContainer>
    );
  }

  return (
    <StyledContainer>
      <StyledTextContainer>
        <Title animate noMarginTop>
          {t`Setting up your workspace…`}
        </Title>
      </StyledTextContainer>
      <StyledLoaderRow>
        <Loader color="gray" />
      </StyledLoaderRow>
    </StyledContainer>
  );
};
