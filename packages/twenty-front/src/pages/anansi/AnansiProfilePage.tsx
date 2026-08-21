// ANANSI PATCH (WS-B): whole file -- the /profile page (core Task 6 shipped
// the bearer-auth'd endpoints this consumes, core Task 9 already links the
// nav here). Four sections: Autonomy, Resume, Search, Availability -- see
// this task's brief for the exact section contents. Optimistic UI
// everywhere: a field flips/saves immediately, then reverts to its previous
// value with an inline error if the request fails.
import { useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { useCallback, useEffect, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { InputHint } from 'twenty-ui/input';
import { Loader } from 'twenty-ui/feedback';
import { H2Title } from 'twenty-ui/typography';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { tokenPairState } from '@/auth/states/tokenPairState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { AnansiAutonomySection } from '~/pages/anansi/AnansiAutonomySection';
import { AnansiResumeSection } from '~/pages/anansi/AnansiResumeSection';
import { AnansiSearchSection } from '~/pages/anansi/AnansiSearchSection';
import { AnansiAvailabilitySection } from '~/pages/anansi/AnansiAvailabilitySection';
import {
  type AnansiAutomationChunk,
  type AnansiAutomationLevel,
  type AnansiAutomationMap,
  type AnansiAwakeHours,
  type AnansiMeResponse,
  type AnansiPolicyDocument,
  getAnansiMe,
  getAnansiPolicy,
  patchAnansiMe,
  postAnansiAutomation,
  putAnansiPolicy,
} from '~/pages/anansi/anansiProfileApi';

const StyledPageContainer = styled.div`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[8]};
  margin: 0 auto;
  max-width: 640px;
  padding: ${themeCssVariables.spacing[8]};
  width: 100%;
`;

const StyledLoaderRow = styled.div`
  align-items: center;
  display: flex;
  justify-content: center;
  padding: ${themeCssVariables.spacing[20]} 0;
`;

const EMPTY_AWAKE_HOURS: AnansiAwakeHours = { start: '', end: '' };

type AnansiFieldKey =
  | AnansiAutomationChunk
  | 'education_on_resume'
  | 'remote_only'
  | 'relocation'
  | 'rate_floor'
  | 'timezone'
  | 'awake_hours';

export const AnansiProfilePage = () => {
  const { t } = useLingui();
  const tokenPair = useAtomStateValue(tokenPairState);
  const accessToken = tokenPair?.accessOrWorkspaceAgnosticToken.token;

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [me, setMe] = useState<AnansiMeResponse | null>(null);
  const [policy, setPolicy] = useState<AnansiPolicyDocument>({});
  const [automation, setAutomation] = useState<AnansiAutomationMap>({});
  const [rateFloorDraft, setRateFloorDraft] = useState('');
  const [awakeHoursDraft, setAwakeHoursDraft] =
    useState<AnansiAwakeHours>(EMPTY_AWAKE_HOURS);
  const [errors, setErrors] = useState<Partial<Record<AnansiFieldKey, string>>>(
    {},
  );

  const setFieldError = useCallback(
    (key: AnansiFieldKey, message: string | undefined) => {
      setErrors((previous) => ({ ...previous, [key]: message }));
    },
    [],
  );

  const saveErrorMessage = t`Couldn't save. Please try again.`;

  useEffect(() => {
    if (!isDefined(accessToken)) {
      return;
    }

    let isMounted = true;

    const loadProfile = async () => {
      setIsLoading(true);
      setLoadError(undefined);

      try {
        const [meResponse, policyResponse] = await Promise.all([
          getAnansiMe(accessToken),
          getAnansiPolicy(accessToken),
        ]);

        if (!isMounted) {
          return;
        }

        setMe(meResponse);
        setPolicy(policyResponse.policy);
        setAutomation(policyResponse.policy.automation ?? {});
        setRateFloorDraft(
          isDefined(policyResponse.policy.rate_floor)
            ? String(policyResponse.policy.rate_floor)
            : '',
        );
        setAwakeHoursDraft(meResponse.awake_hours ?? EMPTY_AWAKE_HOURS);
      } catch (error) {
        if (!isMounted) {
          return;
        }
        // oxlint-disable-next-line no-console
        console.error('ANANSI: could not load profile settings', error);
        setLoadError(t`Couldn't load your profile settings.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const handleToggleAutomation = useCallback(
    async (chunk: AnansiAutomationChunk, nextOn: boolean) => {
      if (!isDefined(accessToken)) {
        return;
      }
      const level: AnansiAutomationLevel = nextOn ? 2 : 1;
      const previousAutomation = automation;

      setAutomation((previous) => ({ ...previous, [chunk]: level }));
      setFieldError(chunk, undefined);

      try {
        const nextAutomation = await postAnansiAutomation(
          accessToken,
          chunk,
          level,
        );
        setAutomation(nextAutomation);
      } catch (error) {
        setAutomation(previousAutomation);
        setFieldError(chunk, saveErrorMessage);
      }
    },
    [accessToken, automation, saveErrorMessage, setFieldError],
  );

  const updatePolicyField = useCallback(
    async (key: AnansiFieldKey, patch: Partial<AnansiPolicyDocument>) => {
      if (!isDefined(accessToken)) {
        return;
      }
      const previousPolicy = policy;
      const optimisticPolicy = { ...policy, ...patch };

      setPolicy(optimisticPolicy);
      setFieldError(key, undefined);

      try {
        const response = await putAnansiPolicy(accessToken, optimisticPolicy);
        setPolicy(response.policy);
      } catch (error) {
        setPolicy(previousPolicy);
        setFieldError(key, saveErrorMessage);
        if (key === 'rate_floor') {
          setRateFloorDraft(
            isDefined(previousPolicy.rate_floor)
              ? String(previousPolicy.rate_floor)
              : '',
          );
        }
      }
    },
    [accessToken, policy, saveErrorMessage, setFieldError],
  );

  const handleToggleEducationOnResume = useCallback(
    (nextOn: boolean) =>
      updatePolicyField('education_on_resume', {
        education_on_resume: nextOn,
      }),
    [updatePolicyField],
  );

  const handleToggleRemoteOnly = useCallback(
    (nextOn: boolean) =>
      updatePolicyField('remote_only', { remote_only: nextOn }),
    [updatePolicyField],
  );

  const handleToggleRelocation = useCallback(
    (nextOn: boolean) =>
      updatePolicyField('relocation', { relocation: nextOn }),
    [updatePolicyField],
  );

  const handleRateFloorBlur = useCallback(() => {
    const trimmed = rateFloorDraft.trim();
    const nextRateFloor = trimmed === '' ? null : Number.parseInt(trimmed, 10);

    if (nextRateFloor !== null && Number.isNaN(nextRateFloor)) {
      return;
    }
    if (nextRateFloor === (policy.rate_floor ?? null)) {
      return;
    }

    updatePolicyField('rate_floor', { rate_floor: nextRateFloor });
  }, [policy.rate_floor, rateFloorDraft, updatePolicyField]);

  const handleTimezoneChange = useCallback(
    async (nextTimezone: string) => {
      if (!isDefined(accessToken) || !isDefined(me)) {
        return;
      }
      const previousMe = me;

      setMe({ ...me, timezone: nextTimezone });
      setFieldError('timezone', undefined);

      try {
        const response = await patchAnansiMe(accessToken, {
          timezone: nextTimezone,
        });
        setMe(response);
      } catch (error) {
        setMe(previousMe);
        setFieldError('timezone', saveErrorMessage);
      }
    },
    [accessToken, me, saveErrorMessage, setFieldError],
  );

  const handleAwakeHoursBlur = useCallback(async () => {
    if (!isDefined(accessToken) || !isDefined(me)) {
      return;
    }
    const currentAwakeHours = me.awake_hours ?? EMPTY_AWAKE_HOURS;
    if (
      currentAwakeHours.start === awakeHoursDraft.start &&
      currentAwakeHours.end === awakeHoursDraft.end
    ) {
      return;
    }

    const previousMe = me;

    setMe({ ...me, awake_hours: awakeHoursDraft });
    setFieldError('awake_hours', undefined);

    try {
      const response = await patchAnansiMe(accessToken, {
        awake_hours: awakeHoursDraft,
      });
      setMe(response);
      setAwakeHoursDraft(response.awake_hours ?? awakeHoursDraft);
    } catch (error) {
      setMe(previousMe);
      setAwakeHoursDraft(previousMe.awake_hours ?? EMPTY_AWAKE_HOURS);
      setFieldError('awake_hours', saveErrorMessage);
    }
  }, [accessToken, awakeHoursDraft, me, saveErrorMessage, setFieldError]);

  if (!isDefined(accessToken)) {
    return null;
  }

  if (isLoading) {
    return (
      <StyledPageContainer>
        <StyledLoaderRow>
          <Loader color="gray" />
        </StyledLoaderRow>
      </StyledPageContainer>
    );
  }

  return (
    <StyledPageContainer>
      <H2Title
        title={t`Profile`}
        description={t`How Anansi acts on your behalf`}
      />
      {loadError && <InputHint danger>{loadError}</InputHint>}
      <AnansiAutonomySection
        automation={automation}
        errors={errors}
        onToggleChunk={handleToggleAutomation}
      />
      <AnansiResumeSection
        educationOnResume={Boolean(policy.education_on_resume)}
        error={errors.education_on_resume}
        onToggleEducation={handleToggleEducationOnResume}
      />
      <AnansiSearchSection
        remoteOnly={Boolean(policy.remote_only)}
        relocation={Boolean(policy.relocation)}
        rateFloorDraft={rateFloorDraft}
        remoteOnlyError={errors.remote_only}
        relocationError={errors.relocation}
        rateFloorError={errors.rate_floor}
        onToggleRemoteOnly={handleToggleRemoteOnly}
        onToggleRelocation={handleToggleRelocation}
        onRateFloorChange={setRateFloorDraft}
        onRateFloorBlur={handleRateFloorBlur}
      />
      <AnansiAvailabilitySection
        timezone={me?.timezone ?? ''}
        awakeHoursDraft={awakeHoursDraft}
        timezoneError={errors.timezone}
        awakeHoursError={errors.awake_hours}
        onTimezoneChange={handleTimezoneChange}
        onAwakeHoursChange={setAwakeHoursDraft}
        onAwakeHoursBlur={handleAwakeHoursBlur}
      />
    </StyledPageContainer>
  );
};
