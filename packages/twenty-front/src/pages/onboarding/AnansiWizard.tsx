// ANANSI PATCH (WS-C): seven-step, client-side Anansi onboarding wizard. The
// required resume and role choices persist immediately; optional preferences
// remain local until Finish runs the Core/GraphQL completion chain in order.
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Loader } from 'twenty-ui/feedback';
import { InputHint, MainButton, Toggle } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { tokenPairState } from '@/auth/states/tokenPairState';
import { OnboardingStepAnimatedItem } from '@/onboarding/components/OnboardingStepAnimatedItem';
import { StyledOnboardingContentBlock } from '@/onboarding/components/StyledOnboardingContentBlock';
import { StyledOnboardingStepHeading } from '@/onboarding/components/StyledOnboardingStepHeading';
import { StyledOnboardingStepPage } from '@/onboarding/components/StyledOnboardingStepPage';
import { StyledOnboardingStepSubtitle } from '@/onboarding/components/StyledOnboardingStepSubtitle';
import { StyledOnboardingStepTitle } from '@/onboarding/components/StyledOnboardingStepTitle';
import { useSetNextOnboardingStatus } from '@/onboarding/hooks/useSetNextOnboardingStatus';
import { Select } from '@/ui/input/components/Select';
import { TextInput } from '@/ui/input/components/TextInput';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { ANANSI_TIMEZONE_OPTIONS } from '~/pages/anansi/AnansiAvailabilitySection';
import {
  AnansiApiError,
  type AnansiAwakeHours,
  type AnansiFluffLevel,
  type AnansiLocation,
  type AnansiMePatch,
  type AnansiPolicyDocument,
  type AnansiProfileResponse,
  type AnansiWorkMode,
  getAnansiPolicy,
  getAnansiProfile,
  patchAnansiMe,
  patchAnansiProfile,
  postAnansiOnboardingComplete,
  postAnansiResume,
  putAnansiPolicy,
} from '~/pages/anansi/anansiProfileApi';

// ANANSI PATCH (WS-C): inline by ruling W4; the fork deliberately does not run
// GraphQL codegen for this single onboarding mutation.
export const COMPLETE_ANANSI_WIZARD = gql`
  mutation CompleteAnansiWizardOnboardingStep {
    completeAnansiWizardOnboardingStep {
      success
    }
  }
`;

const StyledContent = styled(StyledOnboardingContentBlock)`
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledFooter = styled(StyledOnboardingContentBlock)`
  align-items: center;
  display: flex;
  flex-direction: row;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: flex-end;
`;

const StyledFooterSpacer = styled.div`
  flex: 1;
`;

const StyledTextButton = styled.button`
  background: none;
  border: 0;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-family: ${themeCssVariables.font.family};
  padding: ${themeCssVariables.spacing[2]};

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const StyledLoaderRow = styled.div`
  display: flex;
  justify-content: center;
  padding: ${themeCssVariables.spacing[8]};
`;

const StyledFileInput = styled.input`
  border: 1px dashed ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.secondary};
  padding: ${themeCssVariables.spacing[4]};
  width: 100%;
`;

const StyledSuccess = styled.div`
  color: ${themeCssVariables.color.green};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledInputRow = styled.div`
  align-items: flex-end;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledGrow = styled.div`
  flex: 1;
`;

const StyledChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledChip = styled.span`
  align-items: center;
  background: ${themeCssVariables.background.tertiary};
  border-radius: ${themeCssVariables.border.radius.pill};
  display: inline-flex;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledChipRemove = styled.button`
  background: none;
  border: 0;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.md};
  line-height: 1;
  padding: 0;
`;

const StyledRadioGroup = styled.fieldset`
  border: 0;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  margin: 0;
  padding: 0;
`;

const StyledRadioCard = styled.label`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  cursor: pointer;
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[4]};

  &:has(input:checked) {
    border-color: ${themeCssVariables.color.blue};
  }
`;

const StyledFieldPair = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(2, minmax(0, 1fr));
`;

const StyledToggleRow = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
`;

const StyledTextArea = styled.textarea`
  background: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  font-family: ${themeCssVariables.font.family};
  min-height: 112px;
  padding: ${themeCssVariables.spacing[3]};
  resize: vertical;
  width: 100%;
`;

const StyledTextAreaLabel = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledPlanList = styled.ul`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  line-height: 1.5;
  margin: 0;
  padding-left: ${themeCssVariables.spacing[6]};
`;

const getDefaultTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

const DEFAULT_AWAKE_HOURS: AnansiAwakeHours = {
  start: '09:00',
  end: '18:00',
};

const getStoredTargetRoles = (response: AnansiProfileResponse): string[] => {
  const roles = response.profile.target_roles;
  if (!Array.isArray(roles)) {
    return [];
  }

  return roles.filter(
    (role): role is string => typeof role === 'string' && role.trim().length > 0,
  );
};

const hasStoredResume = (response: AnansiProfileResponse): boolean =>
  typeof response.profile.resume_pdf_ref === 'string' &&
  response.profile.resume_pdf_ref.length > 0;

const STEP_COUNT = 7;

type CompleteWizardMutation = {
  completeAnansiWizardOnboardingStep: { success: boolean };
};

export const AnansiWizard = () => {
  const { t } = useLingui();
  const tokenPair = useAtomStateValue(tokenPairState);
  const accessToken = tokenPair?.accessOrWorkspaceAgnosticToken.token;
  const setNextOnboardingStatus = useSetNextOnboardingStatus();
  const [completeWizardMutation] = useMutation<CompleteWizardMutation>(
    COMPLETE_ANANSI_WIZARD,
  );

  const [stepIndex, setStepIndex] = useState(0);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isUploading, setIsUploading] = useState(false);
  const [resumeUploadFailed, setResumeUploadFailed] = useState(false);
  const [resumeReady, setResumeReady] = useState(false);
  const [resumeFile, setResumeFile] = useState<File>();
  const [uploadedFilename, setUploadedFilename] = useState<string>();
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [roleDraft, setRoleDraft] = useState('');
  const [isSavingRoles, setIsSavingRoles] = useState(false);
  const [workMode, setWorkMode] = useState<AnansiWorkMode>();
  const [locationModel, setLocationModel] =
    useState<AnansiLocation['model']>();
  const [timezoneRangeStart, setTimezoneRangeStart] = useState('');
  const [timezoneRangeEnd, setTimezoneRangeEnd] = useState('');
  const [city, setCity] = useState('');
  const [radiusMiles, setRadiusMiles] = useState('100');
  const [educationOnResume, setEducationOnResume] = useState(false);
  const [fluffLevel, setFluffLevel] =
    useState<AnansiFluffLevel>('balanced');
  const [approvedClaims, setApprovedClaims] = useState('');
  const [timezone, setTimezone] = useState(getDefaultTimezone);
  const [awakeHours, setAwakeHours] =
    useState<AnansiAwakeHours>(DEFAULT_AWAKE_HOURS);
  const [policyDraft, setPolicyDraft] = useState<
    Partial<AnansiPolicyDocument>
  >({});
  const [meDraft, setMeDraft] = useState<AnansiMePatch>();
  const [isFinishing, setIsFinishing] = useState(false);
  const isMountedRef = useRef(true);

  const timezoneOptions = useMemo(() => {
    if (ANANSI_TIMEZONE_OPTIONS.some((option) => option.value === timezone)) {
      return ANANSI_TIMEZONE_OPTIONS;
    }
    return [{ label: timezone, value: timezone }, ...ANANSI_TIMEZONE_OPTIONS];
  }, [timezone]);

  const timezoneRangeOptions = useMemo(
    () => [
      { label: 'Choose timezone', value: '' },
      ...ANANSI_TIMEZONE_OPTIONS,
    ],
    [],
  );

  const applyProfile = useCallback((response: AnansiProfileResponse) => {
    setResumeReady((current) => current || hasStoredResume(response));
    const storedRoles = getStoredTargetRoles(response);
    setTargetRoles((current) =>
      current.length === 0 && storedRoles.length > 0 ? storedRoles : current,
    );
  }, []);

  const loadProfile = useCallback(async () => {
    if (!isDefined(accessToken)) {
      return;
    }

    setIsLoadingProfile(true);
    setErrorMessage(undefined);
    try {
      const response = await getAnansiProfile(accessToken);
      if (isMountedRef.current) {
        applyProfile(response);
      }
    } catch {
      if (isMountedRef.current) {
        setErrorMessage(
          "Couldn't load your saved onboarding progress. Please try again.",
        );
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingProfile(false);
      }
    }
  }, [accessToken, applyProfile]);

  useEffect(() => {
    isMountedRef.current = true;
    loadProfile();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadProfile]);

  const uploadResume = useCallback(
    async (file: File) => {
      if (!isDefined(accessToken)) {
        return;
      }

      setIsUploading(true);
      setResumeUploadFailed(false);
      setErrorMessage(undefined);
      setUploadedFilename(undefined);
      try {
        await postAnansiResume(accessToken, file);
        if (!isMountedRef.current) {
          return;
        }
        setResumeReady(true);
        setUploadedFilename(file.name);

        try {
          const refreshedProfile = await getAnansiProfile(accessToken);
          if (isMountedRef.current) {
            applyProfile(refreshedProfile);
          }
        } catch {
          if (isMountedRef.current) {
            setErrorMessage(
              "Resume received, but we couldn't load suggested roles. You can add them on the next step.",
            );
          }
        }
      } catch {
        if (isMountedRef.current) {
          setResumeUploadFailed(true);
          setErrorMessage("Couldn't upload /v1/resume. Please try again.");
        }
      } finally {
        if (isMountedRef.current) {
          setIsUploading(false);
        }
      }
    },
    [accessToken, applyProfile],
  );

  const handleResumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!isDefined(file)) {
      return;
    }
    setResumeFile(file);
    uploadResume(file);
  };

  const addRole = () => {
    const role = roleDraft.trim();
    if (role.length === 0 || targetRoles.length >= 20) {
      return;
    }
    if (!targetRoles.includes(role)) {
      setTargetRoles((current) => [...current, role]);
    }
    setRoleDraft('');
  };

  const saveRolesAndContinue = async () => {
    if (!isDefined(accessToken) || targetRoles.length === 0) {
      return;
    }

    setIsSavingRoles(true);
    setErrorMessage(undefined);
    try {
      const response = await patchAnansiProfile(accessToken, {
        target_roles: targetRoles,
      });
      if (isMountedRef.current) {
        applyProfile(response);
        setStepIndex(2);
      }
    } catch {
      if (isMountedRef.current) {
        setErrorMessage("Couldn't save /v1/profile. Please try again.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsSavingRoles(false);
      }
    }
  };

  const locationIsValid =
    locationModel === 'anywhere' ||
    (locationModel === 'tz_range' &&
      timezoneRangeStart.length > 0 &&
      timezoneRangeEnd.length > 0) ||
    (locationModel === 'city' &&
      city.trim().length > 0 &&
      Number(radiusMiles) >= 5 &&
      Number(radiusMiles) <= 500);

  const advanceOptionalStep = () => {
    setErrorMessage(undefined);

    if (stepIndex === 2 && isDefined(workMode)) {
      setPolicyDraft((current) => ({
        ...current,
        work_mode: workMode,
        remote_only: workMode === 'remote_only',
      }));
    }

    if (stepIndex === 3 && isDefined(locationModel) && locationIsValid) {
      const location: AnansiLocation = {
        model: locationModel,
        city: locationModel === 'city' ? city.trim() : null,
        radius_mi: locationModel === 'city' ? Number(radiusMiles) : null,
        tz_range:
          locationModel === 'tz_range'
            ? [timezoneRangeStart, timezoneRangeEnd]
            : null,
      };
      setPolicyDraft((current) => ({ ...current, location }));
    }

    if (stepIndex === 4) {
      setPolicyDraft((current) => ({
        ...current,
        education_on_resume: educationOnResume,
        fluff_level: fluffLevel,
        approved_fluff:
          fluffLevel === 'confident'
            ? approvedClaims
                .split('\n')
                .map((claim) => claim.trim())
                .filter((claim) => claim.length > 0)
            : [],
      }));
    }

    if (stepIndex === 5) {
      setMeDraft({ timezone, awake_hours: awakeHours });
    }

    setStepIndex((current) => current + 1);
  };

  const skipOptionalStep = () => {
    setErrorMessage(undefined);

    setPolicyDraft((current) => {
      const next = { ...current };
      if (stepIndex === 2) {
        delete next.work_mode;
        delete next.remote_only;
      } else if (stepIndex === 3) {
        delete next.location;
      } else if (stepIndex === 4) {
        delete next.education_on_resume;
        delete next.fluff_level;
        delete next.approved_fluff;
      }
      return next;
    });

    if (stepIndex === 5) {
      setMeDraft(undefined);
    }

    setStepIndex((current) => current + 1);
  };

  const finish = async () => {
    if (!isDefined(accessToken) || isFinishing) {
      return;
    }

    setIsFinishing(true);
    setErrorMessage(undefined);
    let failedCall = 'GET /v1/policy';

    try {
      const freshPolicy = await getAnansiPolicy(accessToken);

      failedCall = 'PUT /v1/policy';
      await putAnansiPolicy(accessToken, {
        ...freshPolicy.policy,
        ...policyDraft,
      });

      if (isDefined(meDraft)) {
        failedCall = 'PATCH /v1/me';
        await patchAnansiMe(accessToken, meDraft);
      }

      failedCall = 'POST /v1/onboarding/complete';
      await postAnansiOnboardingComplete(accessToken);

      failedCall = 'completeAnansiWizardOnboardingStep';
      const result = await completeWizardMutation();
      if (result.data?.completeAnansiWizardOnboardingStep.success !== true) {
        throw new Error('Wizard mutation did not succeed');
      }

      setNextOnboardingStatus({ stepHistoryEffect: 'leaveUnchanged' });
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }
      if (
        failedCall === 'POST /v1/onboarding/complete' &&
        error instanceof AnansiApiError &&
        error.status === 409 &&
        isDefined(error.detail)
      ) {
        setErrorMessage(error.detail);
      } else {
        setErrorMessage(`Couldn't complete ${failedCall}. Please try again.`);
      }
      setIsFinishing(false);
    }
  };

  const goBack = () => {
    setErrorMessage(undefined);
    setStepIndex((current) => Math.max(0, current - 1));
  };

  const titles = [
    t`Add your resume`,
    t`What roles do you want?`,
    t`How do you want to work?`,
    t`Where should Anansi search?`,
    t`Choose your resume options`,
    t`Set your availability`,
    t`Here's how your first week works`,
  ];

  const subtitles = [
    t`Upload the PDF Anansi should use as your source of truth.`,
    t`Add up to 20 job titles.`,
    t`Choose one, or skip this for now.`,
    t`Choose one, or skip this for now.`,
    t`You can change these settings later on your Profile page.`,
    t`Anansi uses this to avoid interrupting you at the wrong time.`,
    t`You stay in control while Anansi gets to work.`,
  ];

  const renderStep = () => {
    if (stepIndex === 0) {
      if (isLoadingProfile) {
        return (
          <StyledLoaderRow>
            <Loader color="gray" />
          </StyledLoaderRow>
        );
      }

      return (
        <>
          <label htmlFor="anansi-resume-upload">PDF resume</label>
          <StyledFileInput
            id="anansi-resume-upload"
            type="file"
            accept=".pdf,application/pdf"
            disabled={isUploading}
            onChange={handleResumeChange}
          />
          {isUploading && (
            <StyledLoaderRow>
              <Loader color="gray" />
            </StyledLoaderRow>
          )}
          {resumeReady && (
            <StyledSuccess>
              Resume received{uploadedFilename ? ` — ${uploadedFilename}` : ''}
            </StyledSuccess>
          )}
          {errorMessage && resumeUploadFailed && isDefined(resumeFile) && !isUploading && (
            <StyledTextButton onClick={() => uploadResume(resumeFile)}>
              Retry upload
            </StyledTextButton>
          )}
          {errorMessage && !resumeUploadFailed && (
            <StyledTextButton onClick={loadProfile}>Retry</StyledTextButton>
          )}
        </>
      );
    }

    if (stepIndex === 1) {
      return (
        <>
          <StyledInputRow>
            <StyledGrow>
              <TextInput
                label="Role or job title"
                value={roleDraft}
                maxLength={80}
                fullWidth
                onChange={setRoleDraft}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addRole();
                  }
                }}
              />
            </StyledGrow>
            <MainButton
              title="Add"
              variant="secondary"
              width={72}
              disabled={roleDraft.trim().length === 0 || targetRoles.length >= 20}
              onClick={addRole}
            />
          </StyledInputRow>
          <StyledChips>
            {targetRoles.map((role) => (
              <StyledChip key={role}>
                {role}
                <StyledChipRemove
                  type="button"
                  aria-label={`Remove ${role}`}
                  onClick={() =>
                    setTargetRoles((current) =>
                      current.filter((candidate) => candidate !== role),
                    )
                  }
                >
                  ×
                </StyledChipRemove>
              </StyledChip>
            ))}
          </StyledChips>
        </>
      );
    }

    if (stepIndex === 2) {
      const choices: Array<{ value: AnansiWorkMode; label: string }> = [
        { value: 'remote_only', label: 'Remote only' },
        { value: 'in_person_ok', label: 'In-person OK' },
        { value: 'hybrid', label: 'Hybrid' },
      ];
      return (
        <StyledRadioGroup aria-label="Work mode">
          {choices.map((choice) => (
            <StyledRadioCard key={choice.value}>
              <input
                type="radio"
                name="work-mode"
                value={choice.value}
                checked={workMode === choice.value}
                onChange={() => setWorkMode(choice.value)}
              />
              {choice.label}
            </StyledRadioCard>
          ))}
        </StyledRadioGroup>
      );
    }

    if (stepIndex === 3) {
      return (
        <>
          <StyledRadioGroup aria-label="Location model">
            {[
              { value: 'anywhere', label: 'Anywhere' },
              { value: 'tz_range', label: 'Timezone range' },
              { value: 'city', label: 'Near a city' },
            ].map((choice) => (
              <StyledRadioCard key={choice.value}>
                <input
                  type="radio"
                  name="location-model"
                  value={choice.value}
                  checked={locationModel === choice.value}
                  onChange={() =>
                    setLocationModel(choice.value as AnansiLocation['model'])
                  }
                />
                {choice.label}
              </StyledRadioCard>
            ))}
          </StyledRadioGroup>
          {locationModel === 'tz_range' && (
            <StyledFieldPair>
              <Select
                dropdownId="anansi-wizard-timezone-start"
                label="From timezone"
                fullWidth
                withSearchInput
                value={timezoneRangeStart}
                options={timezoneRangeOptions}
                onChange={setTimezoneRangeStart}
              />
              <Select
                dropdownId="anansi-wizard-timezone-end"
                label="To timezone"
                fullWidth
                withSearchInput
                value={timezoneRangeEnd}
                options={timezoneRangeOptions}
                onChange={setTimezoneRangeEnd}
              />
            </StyledFieldPair>
          )}
          {locationModel === 'city' && (
            <StyledFieldPair>
              <TextInput
                label="City"
                value={city}
                fullWidth
                onChange={setCity}
              />
              <TextInput
                label="Radius"
                type="number"
                min={5}
                max={500}
                rightAdornment="mi"
                value={radiusMiles}
                fullWidth
                onChange={setRadiusMiles}
              />
            </StyledFieldPair>
          )}
        </>
      );
    }

    if (stepIndex === 4) {
      const choices: Array<{ value: AnansiFluffLevel; label: string }> = [
        { value: 'conservative', label: 'Conservative' },
        { value: 'balanced', label: 'Balanced' },
        { value: 'confident', label: 'Confident' },
      ];
      return (
        <>
          <StyledToggleRow>
            <label id="education-on-resume-label">Show education on resume</label>
            <Toggle
              aria-labelledby="education-on-resume-label"
              value={educationOnResume}
              onChange={setEducationOnResume}
            />
          </StyledToggleRow>
          <StyledRadioGroup aria-label="Fluff level">
            {choices.map((choice) => (
              <StyledRadioCard key={choice.value}>
                <input
                  type="radio"
                  name="fluff-level"
                  value={choice.value}
                  checked={fluffLevel === choice.value}
                  onChange={() => setFluffLevel(choice.value)}
                />
                {choice.label}
              </StyledRadioCard>
            ))}
          </StyledRadioGroup>
          {fluffLevel === 'confident' && (
            <StyledTextAreaLabel htmlFor="anansi-approved-claims">
              Approved confident claims — one per line
              <StyledTextArea
                id="anansi-approved-claims"
                value={approvedClaims}
                onChange={(event) => setApprovedClaims(event.target.value)}
              />
            </StyledTextAreaLabel>
          )}
        </>
      );
    }

    if (stepIndex === 5) {
      return (
        <>
          <Select
            dropdownId="anansi-wizard-timezone"
            label="Timezone"
            fullWidth
            withSearchInput
            value={timezone}
            options={timezoneOptions}
            onChange={setTimezone}
          />
          <StyledFieldPair>
            <TextInput
              label="Awake from"
              type="time"
              value={awakeHours.start}
              fullWidth
              onChange={(start) =>
                setAwakeHours((current) => ({ ...current, start }))
              }
            />
            <TextInput
              label="Until"
              type="time"
              value={awakeHours.end}
              fullWidth
              onChange={(end) =>
                setAwakeHours((current) => ({ ...current, end }))
              }
            />
          </StyledFieldPair>
        </>
      );
    }

    return (
      <StyledPlanList>
        <li>Anansi hunts and prepares applications at full speed from day one.</li>
        <li>
          For the first stretch, YOU approve everything before it goes out —
          every application, every reply.
        </li>
        <li>
          When you're comfortable, flip individual switches on your Profile page
          to let Anansi send a category on its own.
        </li>
        <li>
          Some things are never automatic: interview scheduling decisions, and
          the final click on job-board applications.
        </li>
      </StyledPlanList>
    );
  };

  if (!isDefined(accessToken)) {
    return null;
  }

  const isOptionalStep = stepIndex >= 2 && stepIndex <= 5;
  const nextDisabled =
    (stepIndex === 0 && (!resumeReady || isUploading || isLoadingProfile)) ||
    (stepIndex === 1 && (targetRoles.length === 0 || isSavingRoles)) ||
    (stepIndex === 2 && !isDefined(workMode)) ||
    (stepIndex === 3 && !locationIsValid) ||
    isFinishing;

  const handlePrimaryAction = () => {
    setErrorMessage(undefined);
    if (stepIndex === 0) {
      setStepIndex(1);
    } else if (stepIndex === 1) {
      saveRolesAndContinue();
    } else if (stepIndex < 6) {
      advanceOptionalStep();
    } else {
      finish();
    }
  };

  return (
    <StyledOnboardingStepPage>
      <StyledOnboardingStepHeading>
        <OnboardingStepAnimatedItem index={0}>
          <StyledOnboardingStepSubtitle>
            Step {stepIndex + 1} of {STEP_COUNT}
          </StyledOnboardingStepSubtitle>
        </OnboardingStepAnimatedItem>
        <OnboardingStepAnimatedItem index={1}>
          <StyledOnboardingStepTitle>
            {titles[stepIndex]}
          </StyledOnboardingStepTitle>
        </OnboardingStepAnimatedItem>
        <OnboardingStepAnimatedItem index={2}>
          <StyledOnboardingStepSubtitle>
            {subtitles[stepIndex]}
          </StyledOnboardingStepSubtitle>
        </OnboardingStepAnimatedItem>
      </StyledOnboardingStepHeading>

      <OnboardingStepAnimatedItem index={3}>
        <StyledContent>
          {renderStep()}
          {errorMessage && <InputHint danger>{errorMessage}</InputHint>}
        </StyledContent>
      </OnboardingStepAnimatedItem>

      <OnboardingStepAnimatedItem index={4}>
        <StyledFooter>
          {stepIndex > 0 && (
            <StyledTextButton onClick={goBack} disabled={isFinishing}>
              Back
            </StyledTextButton>
          )}
          <StyledFooterSpacer />
          {isOptionalStep && (
            <StyledTextButton onClick={skipOptionalStep} disabled={isFinishing}>
              Skip
            </StyledTextButton>
          )}
          <MainButton
            title={
              stepIndex === 6
                ? isFinishing
                  ? 'Finishing…'
                  : 'Finish'
                : isSavingRoles
                  ? 'Saving…'
                  : 'Next'
            }
            onClick={handlePrimaryAction}
            disabled={nextDisabled}
            width={120}
          />
        </StyledFooter>
      </OnboardingStepAnimatedItem>
    </StyledOnboardingStepPage>
  );
};
