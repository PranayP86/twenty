// ANANSI PATCH (WS-B): Resume section -- single policy toggle
// (education_on_resume), written via the page's GET-merge-PUT /v1/policy
// flow (core Task 6: anansi/api/routes_policy.py).
import { useLingui } from '@lingui/react/macro';
import { Card, CardContent } from 'twenty-ui/surfaces';
import { H2Title } from 'twenty-ui/typography';
import { Section } from 'twenty-ui/layout';

import { AnansiToggleRow } from '~/pages/anansi/AnansiToggleRow';

type AnansiResumeSectionProps = {
  educationOnResume: boolean;
  error?: string;
  onToggleEducation: (nextOn: boolean) => void;
};

export const AnansiResumeSection = ({
  educationOnResume,
  error,
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
          />
        </CardContent>
      </Card>
    </Section>
  );
};
