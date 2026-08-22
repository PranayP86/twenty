import { lazy, useMemo } from 'react';
import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Route,
} from 'react-router-dom';
import { AppPath, SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';

import { LazyRoute } from '@/app/components/LazyRoute';
import { SettingsRoutes } from '@/app/components/SettingsRoutes';
import { WorkspaceAppProviders } from '@/app/components/WorkspaceAppProviders';
import { VerifyEmail } from '@/auth/components/VerifyEmail';
import { MinimalMetadataGate } from '@/metadata-store/components/MinimalMetadataGate';
import indexAppPath from '@/navigation/utils/indexAppPath';
import { OnboardingActivationOutlet } from '@/onboarding/components/OnboardingActivationOutlet';
import { OnboardingPageLoader } from '@/onboarding/components/OnboardingPageLoader';
import { OnboardingStepLayout } from '@/onboarding/components/OnboardingStepLayout';
import { OnboardingStepPageLoader } from '@/onboarding/components/OnboardingStepPageLoader';
import { OnboardingTransitionOutlet } from '@/onboarding/components/OnboardingTransitionOutlet';
import { useOnboardingStatus } from '@/onboarding/hooks/useOnboardingStatus';
import { RecordIndexSkeletonLoader } from '@/object-record/record-index/components/RecordIndexSkeletonLoader';
import { AuthFlowLayout } from '@/ui/layout/page/components/AuthFlowLayout';
import { BlankLayout } from '@/ui/layout/page/components/BlankLayout';
import { DefaultLayout } from '@/ui/layout/page/components/DefaultLayout';
import { MainAppLayoutWithSidePanel } from '@/ui/layout/page/components/MainAppLayoutWithSidePanel';
import { OnboardingStatus } from '~/generated-metadata/graphql';
import { Verify } from '~/pages/onboarding/Verify';
import { lazyWithPreload } from '~/utils/lazyWithPreload';

const RecordIndexPage = lazy(() =>
  import('~/pages/object-record/RecordIndexPage').then((module) => ({
    default: module.RecordIndexPage,
  })),
);

const RecordShowPage = lazy(() =>
  import('~/pages/object-record/RecordShowPage').then((module) => ({
    default: module.RecordShowPage,
  })),
);

const SignInUp = lazy(() =>
  import('~/pages/auth/SignInUp').then((module) => ({
    default: module.SignInUp,
  })),
);

const PasswordReset = lazy(() =>
  import('~/pages/auth/PasswordReset').then((module) => ({
    default: module.PasswordReset,
  })),
);

const Authorize = lazy(() =>
  import('~/pages/auth/Authorize').then((module) => ({
    default: module.Authorize,
  })),
);

const WorkspaceActivation = lazyWithPreload(() =>
  import('~/pages/onboarding/WorkspaceActivation').then((module) => ({
    default: module.WorkspaceActivation,
  })),
);

const CreateProfile = lazyWithPreload(() =>
  import('~/pages/onboarding/CreateProfile').then((module) => ({
    default: module.CreateProfile,
  })),
);

// ANANSI PATCH (WS-C): Task 9 supplies this page; Task 8 wires its lazy route
// at the onboarding-chain boundary without running local code generation.
const AnansiWizard = lazyWithPreload(() =>
  import('~/pages/onboarding/AnansiWizard').then((module) => ({
    default: module.AnansiWizard,
  })),
);

const SyncEmails = lazyWithPreload(() =>
  import('~/pages/onboarding/SyncEmails').then((module) => ({
    default: module.SyncEmails,
  })),
);

const InstallApps = lazyWithPreload(() =>
  import('~/pages/onboarding/InstallApps').then((module) => ({
    default: module.InstallApps,
  })),
);

const InviteTeam = lazyWithPreload(() =>
  import('~/pages/onboarding/InviteTeam').then((module) => ({
    default: module.InviteTeam,
  })),
);

const ChooseYourPlan = lazyWithPreload(() =>
  import('~/pages/onboarding/ChooseYourPlan').then((module) => ({
    default: module.ChooseYourPlan,
  })),
);

const PaymentSuccess = lazy(() =>
  import('~/pages/onboarding/PaymentSuccess').then((module) => ({
    default: module.PaymentSuccess,
  })),
);

const BookCall = lazyWithPreload(() =>
  import('~/pages/onboarding/BookCall').then((module) => ({
    default: module.BookCall,
  })),
);

const StandalonePageLayoutPage = lazy(() =>
  import('~/pages/page-layout/StandalonePageLayoutPage').then((module) => ({
    default: module.StandalonePageLayoutPage,
  })),
);

const AiChatPage = lazy(() =>
  import('~/pages/ai-chat/AiChatPage').then((module) => ({
    default: module.AiChatPage,
  })),
);

const MobileHomePage = lazy(() =>
  import('~/pages/mobile-home/MobileHomePage').then((module) => ({
    default: module.MobileHomePage,
  })),
);

// ANANSI PATCH (WS-B): profile page (autonomy switches, resume, search,
// availability) -- sits inside the same authenticated workspace router as
// Home/AiChat below, so it gets the default layout (sidebar visible).
const AnansiProfilePage = lazy(() =>
  import('~/pages/anansi/AnansiProfilePage').then((module) => ({
    default: module.AnansiProfilePage,
  })),
);

const NotFound = lazy(() =>
  import('~/pages/not-found/NotFound').then((module) => ({
    default: module.NotFound,
  })),
);

// ANANSI PATCH (WS-C): SignInUp and AnansiWizard intentionally both use
// /welcome. A status-aware route avoids ambiguous duplicate route matches
// while preserving the public sign-in page and the wizard's stock step layout.
const AnansiWelcomeLayout = () => {
  const onboardingStatus = useOnboardingStatus();

  return onboardingStatus === OnboardingStatus.ANANSI_WIZARD ? (
    <OnboardingStepLayout />
  ) : (
    <OnboardingTransitionOutlet />
  );
};

// ANANSI PATCH (WS-C): select the /welcome page from the same status used by
// navigation so anonymous visitors still see SignInUp and pending users see
// the wizard after Task 9 supplies it.
const AnansiWelcomePage = () => {
  const onboardingStatus = useOnboardingStatus();
  const isAnansiWizard =
    onboardingStatus === OnboardingStatus.ANANSI_WIZARD;

  return (
    <LazyRoute
      fallback={
        isAnansiWizard ? (
          <OnboardingStepPageLoader />
        ) : (
          <OnboardingPageLoader />
        )
      }
    >
      {isAnansiWizard ? <AnansiWizard /> : <SignInUp />}
    </LazyRoute>
  );
};

const preloadOnboardingPages = () => {
  WorkspaceActivation.preload();
  CreateProfile.preload();
  // ANANSI PATCH (WS-C): preload the wizard with the neighboring chain pages.
  AnansiWizard.preload();
  SyncEmails.preload();
  InstallApps.preload();
  InviteTeam.preload();
  BookCall.preload();
  ChooseYourPlan.preload();

  return null;
};

const createWorkspaceAppRouter = (
  isFunctionSettingsEnabled?: boolean,
  isAdminPageEnabled?: boolean,
) =>
  createBrowserRouter(
    createRoutesFromElements(
      <Route
        element={<WorkspaceAppProviders />}
        loader={async () => Promise.resolve(null)}
      >
        <Route element={<MinimalMetadataGate />}>
          <Route element={<DefaultLayout />}>
            <Route element={<MainAppLayoutWithSidePanel />}>
              <Route
                path={indexAppPath.getIndexAppPath()}
                element={<RecordIndexSkeletonLoader />}
              />
              <Route
                path={AppPath.RecordIndexPage}
                element={
                  <LazyRoute fallback={<RecordIndexSkeletonLoader />}>
                    <RecordIndexPage />
                  </LazyRoute>
                }
              />
              <Route
                path={AppPath.RecordShowPage}
                element={
                  <LazyRoute>
                    <RecordShowPage />
                  </LazyRoute>
                }
              />
              <Route
                path={AppPath.PageLayoutPage}
                element={
                  <LazyRoute>
                    <StandalonePageLayoutPage />
                  </LazyRoute>
                }
              />
              <Route
                path={AppPath.AiChat}
                element={
                  <LazyRoute>
                    <AiChatPage />
                  </LazyRoute>
                }
              />
              <Route
                path={AppPath.Home}
                element={
                  <LazyRoute>
                    <MobileHomePage />
                  </LazyRoute>
                }
              />
              {/* ANANSI PATCH (WS-B): profile page route */}
              <Route
                path={AppPath.AnansiProfile}
                element={
                  <LazyRoute>
                    <AnansiProfilePage />
                  </LazyRoute>
                }
              />
              <Route
                path={AppPath.SettingsCatchAll}
                element={
                  <SettingsRoutes
                    isFunctionSettingsEnabled={isFunctionSettingsEnabled}
                    isAdminPageEnabled={isAdminPageEnabled}
                  />
                }
              />
              <Route
                path={AppPath.Dpa}
                element={
                  <Navigate
                    to={getSettingsPath(SettingsPath.LegalDpa)}
                    replace
                  />
                }
              />
              <Route
                path={AppPath.NotFoundWildcard}
                element={
                  <LazyRoute>
                    <NotFound />
                  </LazyRoute>
                }
              />
            </Route>
          </Route>
        </Route>
        <Route element={<AuthFlowLayout />}>
          <Route path={AppPath.VerifyEmail} element={<VerifyEmail />} />
          <Route
            path={AppPath.ResetPassword}
            element={
              <LazyRoute fallback={null}>
                <PasswordReset />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.PlanRequiredSuccess}
            element={
              <LazyRoute fallback={<OnboardingPageLoader />}>
                <PaymentSuccess />
              </LazyRoute>
            }
          />
        </Route>
        <Route element={<BlankLayout />}>
          {/* ANANSI PATCH (WS-C): /welcome remains the public sign-in URL and
              becomes the wizard URL only when the onboarding status says so. */}
          <Route
            element={<AnansiWelcomeLayout />}
            loader={preloadOnboardingPages}
          >
            <Route
              path={AppPath.AnansiWizard}
              element={<AnansiWelcomePage />}
            />
          </Route>
          <Route
            element={<OnboardingTransitionOutlet />}
            loader={preloadOnboardingPages}
          >
            <Route
              path={AppPath.Invite}
              element={
                <LazyRoute fallback={<OnboardingPageLoader />}>
                  <SignInUp />
                </LazyRoute>
              }
            />
          </Route>
          <Route
            element={<OnboardingActivationOutlet />}
            loader={preloadOnboardingPages}
          >
            <Route path={AppPath.Verify} element={<Verify />} />
            <Route
              path={AppPath.WorkspaceActivation}
              element={
                <LazyRoute fallback={null}>
                  <WorkspaceActivation />
                </LazyRoute>
              }
            />
          </Route>
          <Route
            element={<OnboardingStepLayout />}
            loader={preloadOnboardingPages}
          >
            <Route
              path={AppPath.CreateProfile}
              element={
                <LazyRoute fallback={<OnboardingStepPageLoader />}>
                  <CreateProfile />
                </LazyRoute>
              }
            />
            <Route
              path={AppPath.SyncEmails}
              element={
                <LazyRoute fallback={<OnboardingStepPageLoader />}>
                  <SyncEmails />
                </LazyRoute>
              }
            />
            <Route
              path={AppPath.InstallApps}
              element={
                <LazyRoute fallback={<OnboardingStepPageLoader />}>
                  <InstallApps />
                </LazyRoute>
              }
            />
            <Route
              path={AppPath.InviteTeam}
              element={
                <LazyRoute fallback={<OnboardingStepPageLoader />}>
                  <InviteTeam />
                </LazyRoute>
              }
            />
            <Route
              path={AppPath.BookCall}
              element={
                <LazyRoute fallback={<OnboardingStepPageLoader />}>
                  <BookCall />
                </LazyRoute>
              }
            />
            <Route
              path={AppPath.PlanRequired}
              element={
                <LazyRoute fallback={<OnboardingStepPageLoader />}>
                  <ChooseYourPlan />
                </LazyRoute>
              }
            />
          </Route>
          <Route
            path={AppPath.Authorize}
            element={
              <LazyRoute>
                <Authorize />
              </LazyRoute>
            }
          />
        </Route>
      </Route>,
    ),
  );

export const useCreateWorkspaceAppRouter = (
  isFunctionSettingsEnabled?: boolean,
  isAdminPageEnabled?: boolean,
) =>
  useMemo(
    () =>
      createWorkspaceAppRouter(isFunctionSettingsEnabled, isAdminPageEnabled),
    [isFunctionSettingsEnabled, isAdminPageEnabled],
  );
