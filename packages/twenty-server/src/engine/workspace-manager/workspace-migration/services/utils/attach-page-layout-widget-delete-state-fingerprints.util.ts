import { type UniversalDeletePageLayoutWidgetAction } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/builders/page-layout-widget/types/workspace-migration-page-layout-widget-action.type';
import { type WorkspaceMigration } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/types/workspace-migration.type';

type ExpectedStateFingerprintByUniversalIdentifier = Record<string, string>;

export const attachPageLayoutWidgetDeleteStateFingerprints = ({
  workspaceMigration,
  expectedStateFingerprintByUniversalIdentifier,
}: {
  workspaceMigration: WorkspaceMigration;
  expectedStateFingerprintByUniversalIdentifier?: ExpectedStateFingerprintByUniversalIdentifier;
}): WorkspaceMigration => {
  if (expectedStateFingerprintByUniversalIdentifier === undefined) {
    return workspaceMigration;
  }

  return {
    ...workspaceMigration,
    actions: workspaceMigration.actions.map((action) => {
      if (
        action.type !== 'delete' ||
        action.metadataName !== 'pageLayoutWidget'
      ) {
        return action;
      }

      const expectedStateFingerprint =
        expectedStateFingerprintByUniversalIdentifier[
          action.universalIdentifier
        ];

      if (expectedStateFingerprint === undefined) {
        return action;
      }

      return {
        ...(action as UniversalDeletePageLayoutWidgetAction),
        expectedStateFingerprint,
      };
    }),
  };
};
