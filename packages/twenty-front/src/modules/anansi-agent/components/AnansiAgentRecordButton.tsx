import {
  anansiAgentDockState,
  openAnansiAgentTab,
} from '@/anansi-agent/states/anansiAgentDockState';
import { resolveAnansiAgentContext } from '@/anansi-agent/utils/resolveAnansiAgentContext';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { recordStoreFamilySelector } from '@/object-record/record-store/states/selectors/recordStoreFamilySelector';
import { recordStoreIdentifierFamilySelector } from '@/object-record/record-store/states/selectors/recordStoreIdentifierFamilySelector';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtom } from 'jotai';
import { Button } from 'twenty-ui/input';
import { IconSparkles } from 'twenty-ui/icon';

export const AnansiAgentRecordButton = ({
  objectNameSingular,
  recordId,
}: {
  objectNameSingular: string;
  recordId: string;
}) => {
  const anansiId = useAtomFamilySelectorValue(recordStoreFamilySelector, {
    recordId,
    fieldName: 'anansiId',
  }) as string | null;
  const taskBodyV2 = useAtomFamilySelectorValue(recordStoreFamilySelector, {
    recordId,
    fieldName: 'bodyV2',
  }) as { markdown?: unknown } | null;
  const recordIdentifier = useAtomFamilySelectorValue(
    recordStoreIdentifierFamilySelector,
    { recordId, allowRequestsToTwentyIcons: false },
  );
  const currentUser = useAtomStateValue(currentUserState);
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const ownerKey =
    currentUser?.id && currentWorkspace?.id
      ? `${currentUser.id}:${currentWorkspace.id}`
      : null;
  const setDockState = useSetAtom(anansiAgentDockState);
  const context = resolveAnansiAgentContext({
    objectNameSingular,
    recordId,
    anansiId,
    taskBodyMarkdown:
      typeof taskBodyV2?.markdown === 'string' ? taskBodyV2.markdown : null,
    title: recordIdentifier?.name || 'Anansi item',
  });

  if (!context || !ownerKey) {
    return null;
  }

  return (
    <Button
      size="small"
      variant="secondary"
      title="Ask Anansi…"
      Icon={IconSparkles}
      onClick={() =>
        setDockState((state) => openAnansiAgentTab(state, context, ownerKey))
      }
    />
  );
};
