import { PageLayoutWidgetResolver } from 'src/engine/metadata-modules/page-layout-widget/resolvers/page-layout-widget.resolver';

describe('PageLayoutWidgetResolver destroy state fingerprint', () => {
  it('passes the optional caller fingerprint to the delete service', async () => {
    const destroy = jest.fn().mockResolvedValue(true);
    const resolver = new PageLayoutWidgetResolver(
      { destroy } as never,
      {} as never,
    );
    const id = '1107a7cb-8d86-4f98-8946-54f3074b9587';
    const workspace = {
      id: '0888762e-c72a-4d63-bc0f-ea406fb91963',
    };
    const expectedStateFingerprint = 'a'.repeat(64);

    await resolver.destroyPageLayoutWidget(
      id,
      workspace as never,
      expectedStateFingerprint,
    );

    expect(destroy).toHaveBeenCalledWith({
      id,
      workspaceId: workspace.id,
      expectedStateFingerprint,
    });
  });
});
