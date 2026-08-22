// ANANSI PATCH (WS-B): Resume section -- single policy toggle
// (education_on_resume), written via the page's GET-merge-PUT /v1/policy
// flow (core Task 6: anansi/api/routes_policy.py).
import { useLingui } from '@lingui/react/macro';
import { Card, CardContent } from 'twenty-ui/surfaces';
import { InputHint } from 'twenty-ui/input';
import { H2Title } from 'twenty-ui/typography';
import { Section } from 'twenty-ui/layout';

import { AnansiToggleRow } from '~/pages/anansi/AnansiToggleRow';

type AnansiResumeSectionProps = {
  educationOnResume: boolean;
  error?: string;
  // ANANSI PATCH (WS-B fix round 1, Critical #1): true until the initial
  // `GET /v1/policy` has succeeded at least once. `PUT /v1/policy` replaces
  // the whole document server-side, so writing from a never-loaded policy
  // would wipe every other known key -- this section must stay
  // non-interactive until a real policy document exists to merge into.
  disabled?: boolean;
  onToggleEducation: (nextOn: boolean) => void;
};

export const AnansiResumeSection = ({
  educationOnResume,
  error,
  disabled,
  onToggleEducation,
}: AnansiResumeSectionProps) => {
  const { t } = useLingui();

  return (
    <Section>
      <H2Title title={t`Resume`} />
      <Card rounded>
        <CardContent>
          <AnansiToggleRow
            title={t`Include education on resume`}
            value={educationOnResume}
            onChange={onToggleEducation}
            error={error}
            disabled={disabled}
          />
        </CardContent>
      </Card>
      {disabled && (
        <InputHint danger>
          {t`Couldn't load your policy settings -- use Retry above to try again.`}
        </InputHint>
      )}
    </Section>
  );
};
