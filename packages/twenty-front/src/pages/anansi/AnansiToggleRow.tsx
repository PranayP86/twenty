// ANANSI PATCH (WS-B): one row inside an Autonomy/Resume/Search card --
// title + either a real Toggle or a static "no control" label (Scheduling),
// plus an inline revert error. Kept generic (not autonomy-specific) so the
// Resume and Search sections reuse it for their own booleans.
import { styled } from '@linaria/react';
import { InputHint, Toggle } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  width: 100%;
`;

const StyledRowMain = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
  width: 100%;
`;

const StyledTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
`;

const StyledDisabledLabel = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

type AnansiToggleRowProps = {
  title: string;
  // When set, the row renders this text instead of a Toggle -- no
  // interactive control at all (the Scheduling row: "Always asks you").
  disabledLabel?: string;
  value?: boolean;
  onChange?: (nextValue: boolean) => void;
  error?: string;
  // ANANSI PATCH (WS-B fix round 1, Critical #1): lets a parent section
  // make its control genuinely non-interactive (e.g. the policy document
  // hasn't successfully loaded yet, so writing would risk a full-document
  // wipe) without hiding the row entirely.
  disabled?: boolean;
};

export const AnansiToggleRow = ({
  title,
  disabledLabel,
  value,
  onChange,
  error,
  disabled,
}: AnansiToggleRowProps) => (
  // ANANSI PATCH (WS-C): the tour resolves the first Profile autonomy row at
  // show-time, after its route navigation has rendered this section.
  <StyledRow data-anansi-tour="autonomy-toggle">
    <StyledRowMain>
      <StyledTitle>{title}</StyledTitle>
      {disabledLabel ? (
        <StyledDisabledLabel>{disabledLabel}</StyledDisabledLabel>
      ) : (
        <Toggle
          value={value}
          onChange={onChange}
          disabled={disabled}
          aria-label={title}
        />
      )}
    </StyledRowMain>
    {error && <InputHint danger>{error}</InputHint>}
  </StyledRow>
);
