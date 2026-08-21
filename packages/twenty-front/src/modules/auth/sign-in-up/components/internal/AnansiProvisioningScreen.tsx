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

type ProvisioningPhase = 'creating' | 'denied' | 'requestSent' | 'error';

// Workspace name = email local-part, capitalized. Dumb and predictable on
// purpose (e.g. jane.doe@gmail.com -> "Jane.doe") — there is no form for the
// user to name it themselves.
const getWorkspaceDisplayNameFromEmail = (email: string): string => {
  const localPart = email.split('@')[0] || email;
  return localPart.charAt(0).toUpperCase() + localPart.slice(1);
};

// Best-effort call to Anansi Core. A failure here (401/403/5xx/timeout/
// network) never blocks the redirect into the workspace — Core can
// re-provision on its own next check — but it is logged so it's not silent.
const provisionWorkspace = async (accessToken: string): Promise<void> => {
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
      console.error(
        `ANANSI: /v1/provision returned ${response.status}; core will re-provision on next check`,
      );
    }
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.error('ANANSI: /v1/provision request failed', error);
  } finally {
    clearTimeout(timeoutId);
  }
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
  const hasStartedRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
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
          await provisionWorkspace(accessToken);
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

        if (isGraphqlErrorOfType(error, 'FORBIDDEN_EXCEPTION')) {
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
