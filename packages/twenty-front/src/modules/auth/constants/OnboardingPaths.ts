import { AppPath } from 'twenty-shared/types';

export const ONBOARDING_PATHS = [
  AppPath.WorkspaceActivation,
  AppPath.CreateProfile,
  // ANANSI PATCH (WS-C): keep /welcome in the onboarding redirect set while
  // it is serving the signed-in Anansi wizard.
  AppPath.AnansiWizard,
  AppPath.SyncEmails,
  AppPath.InstallApps,
  AppPath.InviteTeam,
  AppPath.PlanRequired,
  AppPath.PlanRequiredSuccess,
  AppPath.BookCall,
];
