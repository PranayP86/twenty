// ANANSI PATCH (WS-B): Availability section -- IANA timezone select
// (Intl.supportedValuesOf('timeZone'), per this task's brief) and
// awake-hours start/end time inputs, both written via `PATCH /v1/me` (core
// Task 6: anansi/api/routes_me.py -- HH:MM 24-hour strings, matching the
// native <input type="time"> value format exactly).
import { useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { InputHint, type SelectOption } from 'twenty-ui/input';
import { H2Title } from 'twenty-ui/typography';
import { Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { Select } from '@/ui/input/components/Select';
import { TextInput } from '@/ui/input/components/TextInput';
import { type AnansiAwakeHours } from '~/pages/anansi/anansiProfileApi';

const StyledAwakeHoursRow = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[4]};
`;

// Computed once at module load -- the supported IANA zone list never
// changes within a session. Guarded because Intl.supportedValuesOf is a
// fairly recent addition and a missing implementation must not crash the
// whole page, just leave the select with no options.
// ANANSI PATCH (WS-C): exported for the onboarding wizard so both surfaces
// share one guarded IANA list instead of duplicating timezone generation.
export const ANANSI_TIMEZONE_OPTIONS: SelectOption<string>[] = (() => {
  try {
    return Intl.supportedValuesOf('timeZone').map((timeZone) => ({
      label: timeZone,
      value: timeZone,
    }));
  } catch {
    return [];
  }
})();

type AnansiAvailabilitySectionProps = {
  timezone: string;
  awakeHoursDraft: AnansiAwakeHours;
  timezoneError?: string;
  awakeHoursError?: string;
  onTimezoneChange: (nextTimezone: string) => void;
  onAwakeHoursChange: (nextDraft: AnansiAwakeHours) => void;
  onAwakeHoursBlur: () => void;
};

export const AnansiAvailabilitySection = ({
  timezone,
  awakeHoursDraft,
  timezoneError,
  awakeHoursError,
  onTimezoneChange,
  onAwakeHoursChange,
  onAwakeHoursBlur,
}: AnansiAvailabilitySectionProps) => {
  const { t } = useLingui();

  return (
    <Section>
      <H2Title title={t`Availability`} />
      <Select
        dropdownId="anansi-profile-timezone"
        label={t`Timezone`}
        fullWidth
        withSearchInput
        value={timezone}
        options={ANANSI_TIMEZONE_OPTIONS}
        onChange={onTimezoneChange}
      />
      {timezoneError && <InputHint danger>{timezoneError}</InputHint>}
      <StyledAwakeHoursRow>
        <TextInput
          label={t`Awake from`}
          type="time"
          value={awakeHoursDraft.start}
          onChange={(nextStart) =>
            onAwakeHoursChange({ ...awakeHoursDraft, start: nextStart })
          }
          onBlur={onAwakeHoursBlur}
        />
        <TextInput
          label={t`Until`}
          type="time"
          value={awakeHoursDraft.end}
          onChange={(nextEnd) =>
            onAwakeHoursChange({ ...awakeHoursDraft, end: nextEnd })
          }
          onBlur={onAwakeHoursBlur}
        />
      </StyledAwakeHoursRow>
      {awakeHoursError && <InputHint danger>{awakeHoursError}</InputHint>}
    </Section>
  );
};
