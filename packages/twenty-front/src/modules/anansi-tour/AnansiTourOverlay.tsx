// ANANSI PATCH (WS-C): root-mounted, portal-backed guided tour for completed
// Anansi onboarding. Anchors are resolved after route navigation and missing
// anchors are skipped after a bounded wait so the overlay never traps the UI.
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { isDefined } from 'twenty-shared/utils';
import { Button, LightButton } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { useIsLogged } from '@/auth/hooks/useIsLogged';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { ANANSI_TOUR_STEPS } from '@/anansi-tour/anansiTourSteps';
import { anansiTourRequestedState } from '@/anansi-tour/states/anansiTourRequestedState';
import { useOnboardingStatus } from '@/onboarding/hooks/useOnboardingStatus';
import { isWelcomeAnimationVisibleState } from '@/onboarding/states/isWelcomeAnimationVisibleState';
import { RootStackingContextZIndices } from '@/ui/layout/constants/RootStackingContextZIndices';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { OnboardingStatus } from '~/generated-metadata/graphql';
import {
  getAnansiMe,
  patchAnansiMe,
} from '~/pages/anansi/anansiProfileApi';

const ANCHOR_TIMEOUT_MS = 4000;
const VIEWPORT_MARGIN_PX = 16;
const POPOVER_GAP_PX = 12;
const POPOVER_WIDTH_PX = 320;
const POPOVER_ESTIMATED_HEIGHT_PX = 230;

const StyledHighlight = styled.div`
  border-radius: 8px;
  box-shadow:
    0 0 0 4px ${themeCssVariables.accent.accent9},
    0 0 0 9999px rgba(0, 0, 0, 0.45);
  box-sizing: border-box;
  pointer-events: none;
  position: absolute;
  transition: opacity 200ms ease-out;
  z-index: ${RootStackingContextZIndices.WelcomeOverlay};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const StyledPopover = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  box-shadow: ${themeCssVariables.boxShadow.strong};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[4]};
  position: fixed;
  transition: opacity 200ms ease-out;
  width: min(320px, calc(100vw - 32px));
  z-index: ${RootStackingContextZIndices.WelcomeOverlay};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const StyledCounter = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledBody = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  line-height: 1.5;
`;

const StyledActions = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledNavigationActions = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

export const AnansiTourOverlay = () => {
  const { t } = useLingui();
  const isLogged = useIsLogged();
  const onboardingStatus = useOnboardingStatus();
  const tokenPair = useAtomStateValue(tokenPairState);
  const accessToken = tokenPair?.accessOrWorkspaceAgnosticToken.token;
  const isTourRequested = useAtomStateValue(anansiTourRequestedState);
  const isWelcomeAnimationVisible = useAtomStateValue(
    isWelcomeAnimationVisibleState,
  );
  const setIsTourRequested = useSetAtomState(anansiTourRequestedState);
  const navigate = useNavigate();
  const location = useLocation();

  const [isActive, setIsActive] = useState(false);
  const [isAutoStartEligible, setIsAutoStartEligible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const eligibilityCheckedForTokenRef = useRef<string | undefined>(undefined);
  const navigatedRoutesRef = useRef(new Set<string>());
  const isMountedRef = useRef(true);

  const startTour = useCallback(() => {
    // ANANSI PATCH (WS-C): each configured route is navigated at most once per
    // run. Twenty redirects `/` to the configured home route, and steps 1-2
    // intentionally share it; retrying on every pathname change would loop.
    navigatedRoutesRef.current.clear();
    setStepIndex(0);
    setIsActive(true);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ANANSI PATCH (WS-C): Core is the per-user source of truth. The token ref
  // makes this one GET per authenticated session even as workspace routes move.
  useEffect(() => {
    if (
      !isLogged ||
      onboardingStatus !== OnboardingStatus.COMPLETED ||
      !isDefined(accessToken) ||
      eligibilityCheckedForTokenRef.current === accessToken
    ) {
      return;
    }

    eligibilityCheckedForTokenRef.current = accessToken;

    void getAnansiMe(accessToken)
      .then((me) => {
        if (
          isMountedRef.current &&
          me.onboarding_completed_at !== null &&
          me.tour_seen_at === null
        ) {
          setIsAutoStartEligible(true);
        }
      })
      .catch((error: unknown) => {
        // oxlint-disable-next-line no-console
        console.error('ANANSI: could not load guided-tour state', error);
      });
  }, [accessToken, isLogged, onboardingStatus]);

  // ANANSI PATCH (WS-C): Twenty's completion welcome animation owns the same
  // portal layer; wait until it has left before consuming the one-shot start.
  useEffect(() => {
    if (!isAutoStartEligible || isWelcomeAnimationVisible) {
      return;
    }

    setIsAutoStartEligible(false);
    startTour();
  }, [isAutoStartEligible, isWelcomeAnimationVisible, startTour]);

  // ANANSI PATCH (WS-C): a successful Profile reset starts immediately rather
  // than waiting for another eligibility GET or application remount.
  useEffect(() => {
    if (
      !isTourRequested ||
      !isLogged ||
      onboardingStatus !== OnboardingStatus.COMPLETED ||
      !isDefined(accessToken)
    ) {
      return;
    }

    setIsTourRequested(false);
    startTour();
  }, [
    accessToken,
    isLogged,
    isTourRequested,
    onboardingStatus,
    setIsTourRequested,
    startTour,
  ]);

  const closeAndMarkSeen = useCallback(() => {
    setIsActive(false);
    setAnchorElement(null);
    setAnchorRect(null);

    if (!isDefined(accessToken)) {
      return;
    }

    // ANANSI PATCH (WS-C): persistence must never hold the overlay open. A
    // transient Core error is logged, while the current UI closes immediately.
    void patchAnansiMe(accessToken, { tour_seen: true }).catch(
      (error: unknown) => {
        // oxlint-disable-next-line no-console
        console.error('ANANSI: could not mark guided tour seen', error);
      },
    );
  }, [accessToken]);

  // ANANSI PATCH (WS-C): navigate first, then poll the live document for up to
  // four seconds. Late dashboard metadata is tolerated; absent stops disappear
  // silently, including a missing final stop which completes the tour.
  useEffect(() => {
    if (!isActive) {
      return;
    }

    const step = ANANSI_TOUR_STEPS[stepIndex];
    if (!isDefined(step)) {
      closeAndMarkSeen();
      return;
    }

    setAnchorElement(null);
    setAnchorRect(null);
    setIsVisible(false);

    if (
      isDefined(step.route) &&
      !navigatedRoutesRef.current.has(step.route)
    ) {
      navigatedRoutesRef.current.add(step.route);
      if (location.pathname !== step.route) {
        navigate(step.route);
      }
    }

    let animationFrameId = 0;
    let firstFrameTime: number | undefined;
    let isCancelled = false;

    const findAnchor = (frameTime: number) => {
      if (isCancelled) {
        return;
      }

      firstFrameTime ??= frameTime;
      const element = document.querySelector<HTMLElement>(step.selector);

      if (isDefined(element)) {
        setAnchorElement(element);
        setAnchorRect(element.getBoundingClientRect());
        animationFrameId = requestAnimationFrame(() => setIsVisible(true));
        return;
      }

      if (frameTime - firstFrameTime >= ANCHOR_TIMEOUT_MS) {
        if (stepIndex === ANANSI_TOUR_STEPS.length - 1) {
          closeAndMarkSeen();
        } else {
          setStepIndex((current) => current + 1);
        }
        return;
      }

      animationFrameId = requestAnimationFrame(findAnchor);
    };

    animationFrameId = requestAnimationFrame(findAnchor);

    return () => {
      isCancelled = true;
      cancelAnimationFrame(animationFrameId);
    };
  }, [closeAndMarkSeen, isActive, location.pathname, navigate, stepIndex]);

  // ANANSI PATCH (WS-C): keep the ring and popover attached to moving anchors;
  // capture sees nested scroll containers, and both listeners are cleaned up.
  useEffect(() => {
    if (!isActive || !isDefined(anchorElement)) {
      return;
    }

    const measureAnchor = () => {
      setAnchorRect(anchorElement.getBoundingClientRect());
    };

    window.addEventListener('resize', measureAnchor);
    window.addEventListener('scroll', measureAnchor, {
      capture: true,
      passive: true,
    });

    return () => {
      window.removeEventListener('resize', measureAnchor);
      window.removeEventListener('scroll', measureAnchor, true);
    };
  }, [anchorElement, isActive]);

  if (!isActive || !isDefined(anchorRect)) {
    return null;
  }

  const step = ANANSI_TOUR_STEPS[stepIndex];
  if (!isDefined(step)) {
    return null;
  }

  const popoverWidth = Math.min(
    POPOVER_WIDTH_PX,
    Math.max(0, window.innerWidth - VIEWPORT_MARGIN_PX * 2),
  );
  const popoverLeft = clamp(
    anchorRect.left + anchorRect.width / 2 - popoverWidth / 2,
    VIEWPORT_MARGIN_PX,
    window.innerWidth - popoverWidth - VIEWPORT_MARGIN_PX,
  );
  const popoverTop = clamp(
    anchorRect.bottom + POPOVER_GAP_PX,
    VIEWPORT_MARGIN_PX,
    window.innerHeight -
      POPOVER_ESTIMATED_HEIGHT_PX -
      VIEWPORT_MARGIN_PX,
  );

  const highlightStyle: CSSProperties = {
    height: anchorRect.height,
    left: anchorRect.left + window.scrollX,
    opacity: isVisible ? 1 : 0,
    top: anchorRect.top + window.scrollY,
    width: anchorRect.width,
  };
  const popoverStyle: CSSProperties = {
    left: popoverLeft,
    opacity: isVisible ? 1 : 0,
    top: popoverTop,
  };
  const isLastStep = stepIndex === ANANSI_TOUR_STEPS.length - 1;

  return createPortal(
    <>
      <StyledHighlight aria-hidden="true" style={highlightStyle} />
      <StyledPopover
        aria-label={t`Anansi guided tour`}
        aria-modal="false"
        role="dialog"
        style={popoverStyle}
      >
        <StyledCounter>
          {stepIndex + 1} {t`of`} {ANANSI_TOUR_STEPS.length}
        </StyledCounter>
        <StyledTitle>{step.title}</StyledTitle>
        <StyledBody>{step.body}</StyledBody>
        <StyledActions>
          <LightButton title={t`Skip tour`} onClick={closeAndMarkSeen} />
          <StyledNavigationActions>
            <LightButton
              disabled={stepIndex === 0}
              title={t`Back`}
              onClick={() =>
                setStepIndex((current) => Math.max(0, current - 1))
              }
            />
            <Button
              ariaLabel={isLastStep ? t`Finish` : t`Next`}
              title={isLastStep ? t`Finish` : t`Next`}
              onClick={
                isLastStep
                  ? closeAndMarkSeen
                  : () => setStepIndex((current) => current + 1)
              }
            />
          </StyledNavigationActions>
        </StyledActions>
      </StyledPopover>
    </>,
    document.body,
  );
};
