// ANANSI PATCH (WS-B): Search section -- two policy toggles (remote_only,
// relocation) plus the rate-floor number input, all written via the page's
// GET-merge-PUT /v1/policy flow (core Task 6: anansi/api/routes_policy.py).
// Rate floor is an integer; a blank input means "unset" (sent as null).
import { useLingui } from '@lingui/react/macro';
import { Card, CardContent } from 'twenty-ui/surfaces';
import { InputHint } from 'twenty-ui/input';
import { H2Title } from 'twenty-ui/typography';
import { Section } from 'twenty-ui/layout';

import { TextInput } from '@/ui/input/components/TextInput';
import { AnansiToggleRow } from '~/pages/anansi/AnansiToggleRow';

type AnansiSearchSectionProps = {
  remoteOnly: boolean;
  relocation: boolean;
  rateFloorDraft: string;
  remoteOnlyError?: string;
  relocationError?: string;
  rateFloorError?: string;
  // ANANSI PATCH (WS-B fix round 1, Critical #1): true until the initial
  // `GET /v1/policy` has succeeded at least once -- see AnansiResumeSection
  // for why writing before that must be refused.
  disabled?: boolean;
  onToggleRemoteOnly: (nextOn: boolean) => void;
  onToggleRelocation: (nextOn: boolean) => void;
  onRateFloorChange: (nextValue: string) => void;
  onRateFloorBlur: () => void;
};

export const AnansiSearchSection = ({
  remoteOnly,
  relocation,
  rateFloorDraft,
  remoteOnlyError,
  relocationError,
  rateFloorError,
  disabled,
  onToggleRemoteOnly,
  onToggleRelocation,
  onRateFloorChange,
  onRateFloorBlur,
}: AnansiSearchSectionProps) => {
  const { t } = useLingui();

  return (
    <Section>
      <H2Title title={t`Search`} />
      <Card rounded>
        <CardContent divider>
          <AnansiToggleRow
            title={t`Remote only`}
            value={remoteOnly}
            onChange={onToggleRemoteOnly}
            error={remoteOnlyError}
            disabled={disabled}
          />
        </CardContent>
        <CardContent>
          <AnansiToggleRow
            title={t`Open to relocation`}
            value={relocation}
            onChange={onToggleRelocation}
            error={relocationError}
            disabled={disabled}
          />
        </CardContent>
      </Card>
      <TextInput
        label={t`Rate floor`}
        type="number"
        value={rateFloorDraft}
        onChange={onRateFloorChange}
        onBlur={onRateFloorBlur}
        error={rateFloorError}
        placeholder={t`No minimum`}
        disabled={disabled}
      />
      {disabled && (
        <InputHint danger>
          {t`Couldn't load your policy settings -- use Retry above to try again.`}
        </InputHint>
      )}
    </Section>
  );
};
