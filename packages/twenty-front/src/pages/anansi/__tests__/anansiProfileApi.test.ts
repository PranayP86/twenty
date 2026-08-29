// ANANSI PATCH: Core REST calls carry the signed-in user's Twenty access
// token, which expires after 30 minutes and is never refreshed on these plain
// `fetch` paths (Apollo only refreshes GraphQL calls). These tests prove the
// client renews once on a 401 and retries with the fresh token, so an aged
// onboarding wizard recovers instead of looping on a false "not provisioned".
import { ensureTokenRenewed } from '@/auth/utils/ensureTokenRenewed';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import {
  AnansiApiError,
  getAnansiProfile,
} from '~/pages/anansi/anansiProfileApi';

jest.mock('@/auth/utils/ensureTokenRenewed', () => ({
  ensureTokenRenewed: jest.fn(),
}));

const ensureTokenRenewedMock = ensureTokenRenewed as jest.MockedFunction<
  typeof ensureTokenRenewed
>;

const fetchMock = jest.fn();

const makePair = (token: string) => ({
  accessOrWorkspaceAgnosticToken: { token, expiresAt: '2099-01-01T00:00:00Z' },
  refreshToken: { token: 'refresh-1', expiresAt: '2099-01-01T00:00:00Z' },
});

const jsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Response;

describe('anansiProfileApi token renewal', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    ensureTokenRenewedMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    jotaiStore.set(tokenPairState.atom, makePair('stale-access'));
  });

  it('renews once on 401 and retries with the fresh token', async () => {
    ensureTokenRenewedMock.mockImplementation(async () => {
      jotaiStore.set(tokenPairState.atom, makePair('fresh-access'));
      return true;
    });

    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'unauthenticated' }))
      .mockResolvedValueOnce(
        jsonResponse(200, { version: 6, profile: { ready: true } }),
      );

    const result = await getAnansiProfile('stale-access');

    expect(result).toEqual({ version: 6, profile: { ready: true } });
    expect(ensureTokenRenewedMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect((secondInit.headers as Record<string, string>).Authorization).toBe(
      'Bearer fresh-access',
    );
  });

  it('surfaces the original 401 when renewal cannot produce a new token', async () => {
    ensureTokenRenewedMock.mockResolvedValue(false);
    fetchMock.mockResolvedValue(
      jsonResponse(401, { detail: 'unauthenticated' }),
    );

    await expect(getAnansiProfile('stale-access')).rejects.toBeInstanceOf(
      AnansiApiError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a successful first call', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { version: 6, profile: {} }));

    await getAnansiProfile('stale-access');

    expect(ensureTokenRenewedMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
