// ANANSI PATCH: whole file — zero-form auto-provisioning screen shown to
// non-admin users reaching WorkspaceCreation. Auto-submits workspace
// creation, provisions the new workspace against Anansi Core, then follows
// the stock post-creation redirect. Renders an invite-only request-access
// card if the server denies creation (allowlist gate, see task 9), or a
// simple retry state on transient failures.
import { ANANSI_API_URL } from '@/auth/constants/AnansiApiUrl';
import { SubTitle } from '@/auth/components/SubTitle';
import { Title } from '@/auth/components/Title';
import { currentUserState } from '@/auth/states/currentUserState';
import { isCreatingWorkspaceState } from '@/auth/states/isCreatingWorkspaceState';
import { isMultiWorkspaceEnabledState } from '@/client-config/states/isMultiWorkspaceEnabledState';
import { useRedirectToWorkspaceDomain } from '@/domain-manager/hooks/useRedirectToWorkspaceDomain';
import { OnboardingModalCircularIcon } from '@/onboarding/components/OnboardingModalCircularIcon';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef, useState } from 'react';
import { AppPath } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Loader } from 'twenty-ui/feedback';
import { IconAlertTriangle, IconLock, IconMail } from 'twenty-ui/icon';
import { MainButton } from 'twenty-ui/input';
import { AnimatedEaseIn } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  GetAuthTokensFromLoginTokenDocument,
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

  const [signUpInNewWorkspaceMutation] = useMutation(
    SignUpInNewWorkspaceDocument,
  );
  const [getAuthTokensFromLoginTokenMutation] = useMutation(
    GetAuthTokensFromLoginTokenDocument,
  );

  const [phase, setPhase] = useState<ProvisioningPhase>('creating');
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);
  // ANANSI PATCH (WS-B): provision failures block + retry — the workspace
  // and login token already exist by the time provisioning can fail, so a
  // manual retry only needs to re-call provision, not redo signup. Kept in
  // a ref (not state) since it's write-once-per-attempt-cycle context, not
  // something a render should react to.
  const provisionRetryContextRef = useRef<{
    accessToken: string;
    workspaceUrl: string;
    loginToken: string;
  } | null>(null);
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

        let accessToken: string | undefined;

        if (isMultiWorkspaceEnabled) {
          // The stock redirect below is a full cross-origin navigation to
          // the new workspace's own subdomain, where the login token would
          // normally get exchanged for real auth tokens (useVerifyLogin on
          // the Verify page). We need that access token *before* we
          // navigate away (to provision with it), so we exchange it here
          // ourselves first — passing the new workspace's own URL as
          // origin (not window.location.origin, which is still the
          // default domain at this point) so the server resolves the
          // workspace the token was actually issued for. The login token
          // is a signed JWT, not single-use, so the Verify page's own
          // exchange after the redirect is unaffected.
          try {
            const { data: tokenData } =
              await getAuthTokensFromLoginTokenMutation({
                variables: { loginToken: loginToken.token, origin: workspaceUrl },
              });
            accessToken =
              tokenData?.getAuthTokensFromLoginToken.tokens
                .accessOrWorkspaceAgnosticToken.token;
          } catch (tokenError) {
            // oxlint-disable-next-line no-console
            console.error(
              'ANANSI: could not exchange login token for provisioning',
              tokenError,
            );
          }
        }

        if (isDefined(accessToken)) {
          // ANANSI PATCH (WS-B): provision failures block + retry — a
          // failed provision (after the silent retry) now stops the flow
          // here instead of falling through to the redirect below.
          const isProvisioned = await provisionWorkspaceWithSilentRetry(
            accessToken,
          );

          if (!isProvisioned) {
            if (!isMountedRef.current) {
              return;
            }

            provisionRetryContextRef.current = {
              accessToken,
              workspaceUrl,
              loginToken: loginToken.token,
            };
            setIsCreatingWorkspace(false);
            setPhase('provisionError');
            return;
          }
        } else {
          // oxlint-disable-next-line no-console
          console.error(
            'ANANSI: no access token available for provisioning; core will re-provision on next check',
          );
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
    currentUser?.email,
    getAuthTokensFromLoginTokenMutation,
    isMultiWorkspaceEnabled,
    redirectToWorkspaceDomain,
    setIsCreatingWorkspace,
    signUpInNewWorkspaceMutation,
  ]);

  const handleRetry = () => {
    hasStartedRef.current = false;
    setPhase('creating');
  };

  // ANANSI PATCH (WS-B): provision failures block + retry — the workspace
  // already exists (server-side idempotent), so retry re-calls provision
  // only; it does not go through handleRetry's full signup re-run above.
  const handleRetryProvision = async () => {
    const retryContext = provisionRetryContextRef.current;

    if (!isDefined(retryContext) || isRetryingProvision) {
      return;
    }

    setIsRetryingProvision(true);

    const isProvisioned = await provisionWorkspace(retryContext.accessToken);

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
