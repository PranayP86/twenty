import { currentUserState } from '@/auth/states/currentUserState';
import { onboardingConfigState } from '@/client-config/states/onboardingConfigState';
import { OnboardingLayout } from '@/onboarding/components/OnboardingLayout';
import { OnboardingTransitionOutlet } from '@/onboarding/components/OnboardingTransitionOutlet';
import { PrefetchBookCallStepEffect } from '@/onboarding/effect-components/PrefetchBookCallStepEffect';
import { PrefetchPlanRequiredStepEffect } from '@/onboarding/effect-components/PrefetchPlanRequiredStepEffect';
import { useGoBackToPreviousOnboardingStep } from '@/onboarding/hooks/useGoBackToPreviousOnboardingStep';
import { useOnboardingFreeCreditsTotal } from '@/onboarding/hooks/useOnboardingFreeCreditsTotal';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { isDefined } from 'twenty-shared/utils';

type OnboardingStepLayoutProps = {
  // ANANSI PATCH (WS-C): the Anansi wizard owns its internal Back control and
  // must not expose the stock reversible-step Back button.
  hideBackButton?: boolean;
};

export const OnboardingStepLayout = ({
  hideBackButton = false,
}: OnboardingStepLayoutProps = {}) => {
  const onboardingConfig = useAtomStateValue(onboardingConfigState);
  const freeCreditsTotal = useOnboardingFreeCreditsTotal();
  const currentUser = useAtomStateValue(currentUserState);
  const {
    goBackToPreviousOnboardingStep,
    isGoingBackToPreviousOnboardingStep,
  } = useGoBackToPreviousOnboardingStep();

  const hasPreviousOnboardingStep =
    !hideBackButton &&
    isDefined(currentUser?.previousOnboardingStatus);

  return (
    <OnboardingLayout
      onBack={
        hasPreviousOnboardingStep
          ? () => {
              void goBackToPreviousOnboardingStep();
            }
          : undefined
      }
      isBackDisabled={isGoingBackToPreviousOnboardingStep}
      freeCredits={isDefined(onboardingConfig) ? freeCreditsTotal : undefined}
    >
      <PrefetchBookCallStepEffect />
      <PrefetchPlanRequiredStepEffect />
      <OnboardingTransitionOutlet />
    </OnboardingLayout>
  );
};
