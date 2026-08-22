// ANANSI PATCH (WS-B): whole file -- the /profile page (core Task 6 shipped
// the bearer-auth'd endpoints this consumes, core Task 9 already links the
// nav here). Four sections: Autonomy, Resume, Search, Availability -- see
// this task's brief for the exact section contents. Optimistic UI
// everywhere: a field flips/saves immediately, then reverts just that field
// (never a whole stale snapshot -- see updatePolicyField etc. below) with
// an inline error if the request fails.
import { useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Button, InputHint } from 'twenty-ui/input';
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
  getAnansiAutomationLevel,
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

const StyledLoadErrorRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: space-between;
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
  // ANANSI PATCH (WS-B fix round 1, Critical #1): tracks whether
  // `GET /v1/policy` has ever actually succeeded. `PUT /v1/policy` replaces
  // the *whole* server-side document (routes_policy.py's put_policy just
  // writes `payload.policy` verbatim as the new version) -- writing from a
  // never-successfully-loaded `policy` state (still `{}`, its default,
  // after a failed/partial load) would silently wipe
  // automation/remote_only/relocation/rate_floor/plugins on the very next
  // Resume/Search edit. Resume/Search stay disabled, and updatePolicyField
  // refuses to run, until this flips true -- and it is never reset back to
  // false once true, since a later failed PUT still leaves `policy` at its
  // last known-good (reverted) value, which is safe to keep building on.
  const [isPolicyLoaded, setIsPolicyLoaded] = useState(false);
  const [me, setMe] = useState<AnansiMeResponse | null>(null);
  const [policy, setPolicy] = useState<AnansiPolicyDocument>({});
  const [automation, setAutomation] = useState<AnansiAutomationMap>({});
  const [rateFloorDraft, setRateFloorDraft] = useState('');
  const [awakeHoursDraft, setAwakeHoursDraft] =
    useState<AnansiAwakeHours>(EMPTY_AWAKE_HOURS);
  const [errors, setErrors] = useState<Partial<Record<AnansiFieldKey, string>>>(
    {},
  );

  // Lets `loadProfile` (called on mount AND from the Retry button) tell a
  // stale in-flight request apart from a still-mounted component, the same
  // pattern AnansiProvisioningScreen uses -- reset on every (re-)mount, not
  // just cleared on unmount, so StrictMode's dev-only double-invoke can't
  // leave it stuck `false`.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const setFieldError = useCallback(
    (key: AnansiFieldKey, message: string | undefined) => {
      setErrors((previous) => ({ ...previous, [key]: message }));
    },
    [],
  );

  const saveErrorMessage = t`Couldn't save. Please try again.`;

  // ANANSI PATCH (WS-B fix round 1): Promise.allSettled, not Promise.all --
  // `Promise.all` used to reject wholesale the moment *either* GET failed,
  // discarding the OTHER endpoint's successful result too (so even a
  // healthy `GET /v1/me` never got applied if `GET /v1/policy` 500'd).
  // Each source now tracks its own loaded/failed state independently;
  // `isPolicyLoaded` above is what actually gates policy writes.
  const loadProfile = useCallback(async () => {
    if (!isDefined(accessToken)) {
      return;
    }

    setIsLoading(true);
    setLoadError(undefined);

    const [meResult, policyResult] = await Promise.allSettled([
      getAnansiMe(accessToken),
      getAnansiPolicy(accessToken),
    ]);

    if (!isMountedRef.current) {
      return;
    }

    if (meResult.status === 'fulfilled') {
      setMe(meResult.value);
      setAwakeHoursDraft(meResult.value.awake_hours ?? EMPTY_AWAKE_HOURS);
    }

    if (policyResult.status === 'fulfilled') {
      setPolicy(policyResult.value.policy);
      setAutomation(policyResult.value.policy.automation ?? {});
      setRateFloorDraft(
        isDefined(policyResult.value.policy.rate_floor)
          ? String(policyResult.value.policy.rate_floor)
          : '',
      );
      setIsPolicyLoaded(true);
    }

    if (meResult.status === 'rejected' || policyResult.status === 'rejected') {
      // oxlint-disable-next-line no-console
      console.error('ANANSI: could not load profile settings', {
        me: meResult.status === 'rejected' ? meResult.reason : undefined,
        policy:
          policyResult.status === 'rejected' ? policyResult.reason : undefined,
      });
      setLoadError(t`Couldn't load your profile settings.`);
    }

    setIsLoading(false);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // ANANSI PATCH (WS-B fix round 1, Info #8): lets the user recover from a
  // transient load failure without a full page reload.
  const handleRetryLoad = useCallback(() => {
    loadProfile();
  }, [loadProfile]);

  const handleToggleAutomation = useCallback(
    async (chunk: AnansiAutomationChunk, nextOn: boolean) => {
      if (!isDefined(accessToken)) {
        return;
      }
      const level: AnansiAutomationLevel = nextOn ? 2 : 1;
      // ANANSI PATCH (WS-B fix round 1, Major #2): capture only this
      // chunk's previous level, not the whole automation map, so a revert
      // can't clobber a different chunk's concurrent successful update.
      const previousLevel = getAnansiAutomationLevel(automation, chunk);

      setAutomation((previous) => ({ ...previous, [chunk]: level }));
      setFieldError(chunk, undefined);

      try {
        const nextAutomation = await postAnansiAutomation(
          accessToken,
          chunk,
          level,
        );
        setAutomation(nextAutomation);
        // ANANSI PATCH (WS-B final review I1): keep `policy.automation` in
        // sync with the live automation map on every successful toggle.
        // updatePolicyField PUTs the WHOLE policy document (the server
        // replaces it verbatim), so a later Resume/Search save built from a
        // `policy` whose `automation` key still held the page-load snapshot
        // would silently write this toggle back -- re-enabling autonomy the
        // user just turned off (the worst direction to fail). Syncing here,
        // plus overlaying the latest map in updatePolicyField below, closes
        // that window from both sides.
        setPolicy((current) => ({ ...current, automation: nextAutomation }));
      } catch (error) {
        setAutomation((current) => ({ ...current, [chunk]: previousLevel }));
        setFieldError(chunk, saveErrorMessage);
      }
    },
    [accessToken, automation, saveErrorMessage, setFieldError],
  );

  const updatePolicyField = useCallback(
    async (key: AnansiFieldKey, patch: Partial<AnansiPolicyDocument>) => {
      // ANANSI PATCH (WS-B fix round 1, Critical #1): refuse to PUT from a
      // policy state that was never successfully loaded -- see
      // `isPolicyLoaded`'s own comment above for why.
      if (!isDefined(accessToken) || !isPolicyLoaded) {
        return;
      }

      // `patch` always sets exactly one key -- capture only that key's
      // previous value (WS-B fix round 1, Major #2) so a revert can't
      // clobber a different field's concurrent successful update.
      const patchKey = Object.keys(patch)[0] as keyof AnansiPolicyDocument;
      const previousValue = policy[patchKey];
      // ANANSI PATCH (WS-B final review I1): overlay the LIVE `automation`
      // map into the PUT body so a stale `policy.automation` -- a toggle made
      // after page load, or one still in flight -- can never be written back
      // over the user's choice. The whole document is replaced server-side,
      // so the body must always carry the current automation, not the
      // load-time snapshot.
      const optimisticPolicy = { ...policy, automation, ...patch };

      setPolicy(optimisticPolicy);
      setFieldError(key, undefined);

      try {
        const response = await putAnansiPolicy(accessToken, optimisticPolicy);
        setPolicy(response.policy);
      } catch (error) {
        setPolicy((current) => ({ ...current, [patchKey]: previousValue }));
        setFieldError(key, saveErrorMessage);
        if (key === 'rate_floor') {
          setRateFloorDraft(
            isDefined(previousValue) ? String(previousValue) : '',
          );
        }
      }
    },
    [
      accessToken,
      automation,
      isPolicyLoaded,
      policy,
      saveErrorMessage,
      setFieldError,
    ],
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

    if (trimmed === '') {
      if (isDefined(policy.rate_floor)) {
        updatePolicyField('rate_floor', { rate_floor: null });
      }
      return;
    }

    const parsed = Number(trimmed);

    // ANANSI PATCH (WS-B fix round 1, Minor #3): `Number.parseInt` used to
    // silently truncate garbage like "12abc" to 12 and no-op on true
    // non-numeric input with zero feedback that nothing was saved. `Number`
    // rejects any non-numeric text outright (NaN), so every invalid entry
    // now gets an inline error and the field resets to the last known-good
    // (server) value instead of leaving the bad text sitting there.
    if (!Number.isFinite(parsed)) {
      setFieldError('rate_floor', t`Enter a whole number.`);
      setRateFloorDraft(
        isDefined(policy.rate_floor) ? String(policy.rate_floor) : '',
      );
      return;
    }

    // ANANSI PATCH (WS-B fix round 1, Minor #4): rate floor is an integer
    // -- round fractional input explicitly (never silently truncate via
    // parseInt) and reflect the rounded value back in the field, so what
    // gets saved is never a silent surprise.
    const nextRateFloor = Math.round(parsed);
    if (nextRateFloor !== parsed) {
      setRateFloorDraft(String(nextRateFloor));
    }

    if (nextRateFloor === (policy.rate_floor ?? null)) {
      return;
    }

    updatePolicyField('rate_floor', { rate_floor: nextRateFloor });
  }, [policy.rate_floor, rateFloorDraft, setFieldError, t, updatePolicyField]);

  const handleTimezoneChange = useCallback(
    async (nextTimezone: string) => {
      if (!isDefined(accessToken) || !isDefined(me)) {
        return;
      }
      const previousTimezone = me.timezone;

      // ANANSI PATCH (WS-B fix round 1, Major #2): functional update keyed
      // to just `timezone`, so a later revert (or a concurrent awake-hours
      // save) can't clobber the other field.
      setMe((current) =>
        current ? { ...current, timezone: nextTimezone } : current,
      );
      setFieldError('timezone', undefined);

      try {
        const response = await patchAnansiMe(accessToken, {
          timezone: nextTimezone,
        });
        setMe(response);
      } catch (error) {
        setMe((current) =>
          current ? { ...current, timezone: previousTimezone } : current,
        );
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

    const previousAwakeHours = currentAwakeHours;

    // ANANSI PATCH (WS-B fix round 1, Major #2): functional update keyed to
    // just `awake_hours`, same reasoning as handleTimezoneChange above.
    setMe((current) =>
      current ? { ...current, awake_hours: awakeHoursDraft } : current,
    );
    setFieldError('awake_hours', undefined);

    try {
      const response = await patchAnansiMe(accessToken, {
        awake_hours: awakeHoursDraft,
      });
      setMe(response);
      setAwakeHoursDraft(response.awake_hours ?? awakeHoursDraft);
    } catch (error) {
      setMe((current) =>
        current ? { ...current, awake_hours: previousAwakeHours } : current,
      );
      setAwakeHoursDraft(previousAwakeHours);
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
      {loadError && (
        <StyledLoadErrorRow>
          <InputHint danger>{loadError}</InputHint>
          <Button title={t`Retry`} onClick={handleRetryLoad} />
        </StyledLoadErrorRow>
      )}
      <AnansiAutonomySection
        automation={automation}
        errors={errors}
        onToggleChunk={handleToggleAutomation}
      />
      <AnansiResumeSection
        educationOnResume={Boolean(policy.education_on_resume)}
        error={errors.education_on_resume}
        disabled={!isPolicyLoaded}
        onToggleEducation={handleToggleEducationOnResume}
      />
      <AnansiSearchSection
        remoteOnly={Boolean(policy.remote_only)}
        relocation={Boolean(policy.relocation)}
        rateFloorDraft={rateFloorDraft}
        remoteOnlyError={errors.remote_only}
        relocationError={errors.relocation}
        rateFloorError={errors.rate_floor}
        disabled={!isPolicyLoaded}
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
