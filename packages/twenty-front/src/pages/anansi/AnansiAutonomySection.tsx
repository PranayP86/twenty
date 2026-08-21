// ANANSI PATCH (WS-B): Autonomy section -- one toggle row per automation
// chunk (level >= 2 == on), except Scheduling which always renders as a
// disabled "Always asks you" row with no control (design ruling: scheduling
// never auto-approves from this page).
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
  onToggleChunk: (chunk: AnansiAutomationChunk, nextOn: boolean) => void;
};

export const AnansiAutonomySection = ({
  automation,
  errors,
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

  return (
    <Section>
      <H2Title
        title={t`Autonomy`}
        description={t`Choose what Anansi can do without asking you first`}
      />
      <Card rounded>
        {ANANSI_AUTOMATION_CHUNKS.map((chunk, index) => (
          <CardContent
            key={chunk}
            divider={index < ANANSI_AUTOMATION_CHUNKS.length - 1}
          >
            {chunk === 'scheduling' ? (
              <AnansiToggleRow
                title={chunkLabels[chunk]}
                disabledLabel={t`Always asks you`}
              />
            ) : (
              <AnansiToggleRow
                title={chunkLabels[chunk]}
                value={getAnansiAutomationLevel(automation, chunk) >= 2}
                onChange={(nextOn) => onToggleChunk(chunk, nextOn)}
                error={errors[chunk]}
              />
            )}
          </CardContent>
        ))}
      </Card>
      <StyledFootnote>
        {t`Documents and commitments always ask you first.`}
      </StyledFootnote>
    </Section>
  );
};
