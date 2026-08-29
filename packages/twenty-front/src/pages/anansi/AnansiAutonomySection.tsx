// ANANSI PATCH (WS-B): Autonomy section -- one toggle row per automation
// chunk plus one versioned all-chunks control.
import { useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { Card, CardContent } from 'twenty-ui/surfaces';
import { H2Title } from 'twenty-ui/typography';
import { Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { AnansiToggleRow } from '~/pages/anansi/AnansiToggleRow';
import {
  ANANSI_AUTOMATION_CHUNKS,
  type AnansiAutomationChunk,
  type AnansiAutomationMap,
  getAnansiAutomationLevel,
} from '~/pages/anansi/anansiProfileApi';

const StyledFootnote = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: ${themeCssVariables.spacing[2]} 0 0;
`;

type AnansiAutonomySectionProps = {
  automation: AnansiAutomationMap;
  errors: Partial<Record<AnansiAutomationChunk, string>>;
  autoAllError?: string;
  isSavingAutoAll: boolean;
  onSetAll: (nextOn: boolean) => void;
  onToggleChunk: (chunk: AnansiAutomationChunk, nextOn: boolean) => void;
};

export const AnansiAutonomySection = ({
  automation,
  errors,
  autoAllError,
  isSavingAutoAll,
  onSetAll,
  onToggleChunk,
}: AnansiAutonomySectionProps) => {
  const { t } = useLingui();

  const chunkLabels: Record<AnansiAutomationChunk, string> = {
    applications: t`Applications`,
    replies: t`Replies`,
    negotiation: t`Negotiation`,
    prescreen: t`Prescreen / RTR`,
    scheduling: t`Scheduling`,
    outreach: t`Outreach`,
  };

  const allEnabled = ANANSI_AUTOMATION_CHUNKS.every(
    (chunk) => getAnansiAutomationLevel(automation, chunk) >= 2,
  );

  return (
    <Section>
      <H2Title
        title={t`Autonomy`}
        description={t`Choose what Anansi can do without asking you first`}
      />
      <Card rounded>
        <CardContent divider>
          <AnansiToggleRow
            title={t`Auto all`}
            value={allEnabled}
            onChange={onSetAll}
            error={autoAllError}
            disabled={isSavingAutoAll}
          />
        </CardContent>
        {ANANSI_AUTOMATION_CHUNKS.map((chunk, index) => (
          <CardContent
            key={chunk}
            divider={index < ANANSI_AUTOMATION_CHUNKS.length - 1}
          >
            <AnansiToggleRow
              title={chunkLabels[chunk]}
              value={getAnansiAutomationLevel(automation, chunk) >= 2}
              onChange={(nextOn) => onToggleChunk(chunk, nextOn)}
              error={errors[chunk]}
              disabled={isSavingAutoAll}
            />
          </CardContent>
        ))}
      </Card>
      <StyledFootnote>
        {t`Missing facts, sensitive documents, commitments, challenges, and risky sites always stop for you.`}
      </StyledFootnote>
    </Section>
  );
};
