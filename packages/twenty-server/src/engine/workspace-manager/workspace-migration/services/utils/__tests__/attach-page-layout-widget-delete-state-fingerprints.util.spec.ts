import { attachPageLayoutWidgetDeleteStateFingerprints } from 'src/engine/workspace-manager/workspace-migration/services/utils/attach-page-layout-widget-delete-state-fingerprints.util';

describe('attachPageLayoutWidgetDeleteStateFingerprints', () => {
  it('adds only matching page-layout-widget delete expectations', () => {
    const migration = {
      applicationUniversalIdentifier: 'a9fd19b3-e1bf-4d52-87ca-c783311da44f',
      actions: [
        {
          type: 'delete',
          metadataName: 'pageLayoutWidget',
          universalIdentifier: '8cd60f5a-e796-4b75-92ec-4e4527e6e07a',
        },
        {
          type: 'update',
          metadataName: 'pageLayoutWidget',
          universalIdentifier: '1c973179-cbf1-4e31-9fc8-cd6e86ef4a90',
          update: {},
        },
        {
          type: 'delete',
          metadataName: 'objectMetadata',
          universalIdentifier: '2973fb01-b0c6-4eeb-bfc3-9b08db77d82b',
        },
      ],
    };

    const enriched = attachPageLayoutWidgetDeleteStateFingerprints({
      workspaceMigration: migration as never,
      expectedStateFingerprintByUniversalIdentifier: {
        '8cd60f5a-e796-4b75-92ec-4e4527e6e07a': 'a'.repeat(64),
        'not-present': 'b'.repeat(64),
      },
    });

    expect(enriched.actions).toEqual([
      {
        type: 'delete',
        metadataName: 'pageLayoutWidget',
        universalIdentifier: '8cd60f5a-e796-4b75-92ec-4e4527e6e07a',
        expectedStateFingerprint: 'a'.repeat(64),
      },
      migration.actions[1],
      migration.actions[2],
    ]);
    expect(migration.actions[0]).not.toHaveProperty('expectedStateFingerprint');
  });

  it('returns the original migration when no expectations exist', () => {
    const migration = {
      applicationUniversalIdentifier: 'a9fd19b3-e1bf-4d52-87ca-c783311da44f',
      actions: [],
    };

    expect(
      attachPageLayoutWidgetDeleteStateFingerprints({
        workspaceMigration: migration,
      }),
    ).toBe(migration);
  });
});
