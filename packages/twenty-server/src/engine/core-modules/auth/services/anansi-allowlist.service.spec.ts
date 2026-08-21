import { AnansiAllowlistService } from 'src/engine/core-modules/auth/services/anansi-allowlist.service';

// ANANSI PATCH: unit coverage for the Anansi Core allowlist HTTP check —
// every failure mode (env unset, network error/timeout, non-200, malformed
// JSON) must fail closed (deny). This is the compile+test gate for
// .github/workflows/anansi-server-tests.yml.
describe('AnansiAllowlistService', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      ANANSI_CORE_URL: 'https://core.anansi.internal',
      ANANSI_INTERNAL_TOKEN: 'test-internal-token',
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  const mockFetchResolvedWith = (overrides: {
    ok?: boolean;
    status?: number;
    body?: unknown;
  }) => {
    const { ok = true, status = 200, body = { approved: true } } = overrides;

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok,
      status,
      json: jest.fn().mockResolvedValue(body),
    } as unknown as Response);
  };

  it('returns true when Core responds 200 with approved: true', async () => {
    mockFetchResolvedWith({
      body: { email: 'a@b.com', status: 'approved', approved: true },
    });

    const service = new AnansiAllowlistService();

    await expect(service.isApproved('A@B.com')).resolves.toBe(true);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://core.anansi.internal/v1/allowlist/check?email=a%40b.com',
      expect.objectContaining({
        method: 'GET',
        headers: { 'X-Anansi-Internal': 'test-internal-token' },
      }),
    );
  });

  it('returns false when Core responds 200 with approved: false', async () => {
    mockFetchResolvedWith({
      body: { email: 'a@b.com', status: 'requested', approved: false },
    });

    const service = new AnansiAllowlistService();

    await expect(service.isApproved('a@b.com')).resolves.toBe(false);
  });

  it('returns false when Core responds 200 for an unknown email (status null-ish shape)', async () => {
    mockFetchResolvedWith({
      body: { email: 'a@b.com', status: null, approved: false },
    });

    const service = new AnansiAllowlistService();

    await expect(service.isApproved('a@b.com')).resolves.toBe(false);
  });

  it('returns false on a non-200 response (fail closed)', async () => {
    mockFetchResolvedWith({ ok: false, status: 403 });

    const service = new AnansiAllowlistService();

    await expect(service.isApproved('a@b.com')).resolves.toBe(false);
  });

  it('returns false when the request times out (fail closed)', async () => {
    // Mirrors what AbortSignal.timeout() produces on the real fetch: the
    // promise rejects. The service does not special-case the rejection
    // reason, so any rejection (including a real timeout) is exercised
    // through this same path.
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(
        new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
      );

    const service = new AnansiAllowlistService();

    await expect(service.isApproved('a@b.com')).resolves.toBe(false);
  });

  it('returns false on a network error (fail closed)', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const service = new AnansiAllowlistService();

    await expect(service.isApproved('a@b.com')).resolves.toBe(false);
  });

  it('returns false on a malformed JSON body (fail closed)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
    } as unknown as Response);

    const service = new AnansiAllowlistService();

    await expect(service.isApproved('a@b.com')).resolves.toBe(false);
  });

  it('returns false and never calls fetch when ANANSI_CORE_URL is unset (fail closed)', async () => {
    delete process.env.ANANSI_CORE_URL;

    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = new AnansiAllowlistService();

    await expect(service.isApproved('a@b.com')).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns false and never calls fetch when ANANSI_INTERNAL_TOKEN is unset (fail closed)', async () => {
    delete process.env.ANANSI_INTERNAL_TOKEN;

    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = new AnansiAllowlistService();

    await expect(service.isApproved('a@b.com')).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
