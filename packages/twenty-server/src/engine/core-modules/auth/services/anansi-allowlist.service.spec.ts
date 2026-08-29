import { AnansiAllowlistService } from 'src/engine/core-modules/auth/services/anansi-allowlist.service';

// Explicit boolean decisions are returned; every unavailable or malformed
// response must fail closed by throwing rather than masquerading as denial.
// This is part of .github/workflows/anansi-server-tests.yml.
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

  it('returns false when Core explicitly denies an unknown email', async () => {
    mockFetchResolvedWith({
      body: { email: 'a@b.com', status: null, approved: false },
    });

    const service = new AnansiAllowlistService();

    await expect(service.isApproved('a@b.com')).resolves.toBe(false);
  });

  it('throws when Core returns a non-200 response (fail closed without explicit denial)', async () => {
    mockFetchResolvedWith({ ok: false, status: 503 });

    const service = new AnansiAllowlistService();

    await expect(service.isApproved('a@b.com')).rejects.toThrow();
  });

  it('throws when the request times out (fail closed without explicit denial)', async () => {
    // Mirrors what AbortSignal.timeout() produces on the real fetch: the
    // promise rejects. The service does not special-case the rejection
    // reason, so any rejection (including a real timeout) is exercised
    // through this same path.
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(
        new DOMException(
          'The operation was aborted due to timeout',
          'TimeoutError',
        ),
      );

    const service = new AnansiAllowlistService();

    await expect(service.isApproved('a@b.com')).rejects.toThrow();
  });

  it('throws on a network error (fail closed without explicit denial)', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const service = new AnansiAllowlistService();

    await expect(service.isApproved('a@b.com')).rejects.toThrow();
  });

  it('throws on malformed JSON (fail closed without explicit denial)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
    } as unknown as Response);

    const service = new AnansiAllowlistService();

    await expect(service.isApproved('a@b.com')).rejects.toThrow();
  });

  it('throws when a 200 response omits an explicit boolean decision', async () => {
    mockFetchResolvedWith({ body: { email: 'a@b.com', status: 'approved' } });

    const service = new AnansiAllowlistService();

    await expect(service.isApproved('a@b.com')).rejects.toThrow();
  });

  it('throws and never calls fetch when ANANSI_CORE_URL is unset', async () => {
    delete process.env.ANANSI_CORE_URL;

    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = new AnansiAllowlistService();

    await expect(service.isApproved('a@b.com')).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws and never calls fetch when ANANSI_INTERNAL_TOKEN is unset', async () => {
    delete process.env.ANANSI_INTERNAL_TOKEN;

    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = new AnansiAllowlistService();

    await expect(service.isApproved('a@b.com')).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
