import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  apiRequest,
  enterWaitingRoom,
  getAccessToken,
  getRefreshToken,
  getWaitingRoomStatus,
  getWaitingToken,
  setTokens,
  tryRefresh,
  WAITING_TOKEN_KEY,
  WR_TOKEN_HEADER,
} from './api';

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    json: async () => payload,
  } as Response;
}

describe('api wrapper (T1.11a)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mengembalikan data pada respons sukses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { id: 7 } })),
    );

    const data = await apiRequest<{ id: number }>('/users/me');
    expect(data).toEqual({ id: 7 });
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/users/me',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('melempar ApiError dengan fields pada error validasi (error inline)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Email tidak valid',
              details: { fields: { email: ['Email tidak valid'] } },
            },
          },
          400,
        ),
      ),
    );

    const err = await apiRequest('/auth/login', {
      method: 'POST',
      body: { email: 'x', password: 'y' },
      auth: false,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('VALIDATION_ERROR');
    expect((err as ApiError).fields?.email?.[0]).toBe('Email tidak valid');
  });

  it('silent refresh saat 401, lalu retry permintaan asli', async () => {
    setTokens('access-lama', 'refresh-valid');

    let authCalls = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: { accessToken: 'access-baru', refreshToken: 'refresh-baru' },
          }),
        );
      }
      authCalls += 1;
      if (authCalls === 1) {
        return Promise.resolve(jsonResponse({ success: false }, 401));
      }
      return Promise.resolve(jsonResponse({ success: true, data: { ok: true } }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const data = await apiRequest<{ ok: boolean }>('/krs/my');
    expect(data).toEqual({ ok: true });
    expect(getAccessToken()).toBe('access-baru');
    expect(getRefreshToken()).toBe('refresh-baru');
    expect(authCalls).toBe(2);
  });

  it('401 tanpa refresh token valid → ApiError 401, token dibersihkan', async () => {
    setTokens('access-lama', null);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: false }, 401)));

    const err = await apiRequest('/krs/my').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect(getAccessToken()).toBeNull();
  });

  it('tryRefresh memakai refresh token dari storage', async () => {
    setTokens('access-lama', 'refresh-ada');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          data: { accessToken: 'access-baru', refreshToken: 'refresh-baru' },
        }),
      ),
    );

    const ok = await tryRefresh();
    expect(ok).toBe(true);
    expect(getAccessToken()).toBe('access-baru');
  });
});

describe('waiting room di api wrapper (T1.13)', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // Pulihkan window.location (di-stub utuh, bukan assign — jsdom menolak redefine assign)
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  /** Ganti window.location dengan objek polos (assign ter-spy) — jsdom tak izinkan spyOn location.assign. */
  function stubLocation(pathname: string) {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname, assign },
    });
    return assign;
  }

  it('429 + header x-waiting-token → token disimpan & diarahkan ke /tunggu', async () => {
    const assign = stubLocation('/krs');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          { success: false, error: { code: 'RATE_LIMITED', message: 'Sistem ramai' } },
          429,
          { [WR_TOKEN_HEADER]: 'wr-token-abc' },
        ),
      ),
    );

    const err = await apiRequest('/krs/my').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(429);
    expect((err as ApiError).code).toBe('RATE_LIMITED');
    expect(sessionStorage.getItem(WAITING_TOKEN_KEY)).toBe('wr-token-abc');
    expect(assign).toHaveBeenCalledWith('/tunggu');
  });

  it('429 tanpa header → ApiError biasa, tanpa token antrean', async () => {
    stubLocation('/krs');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ success: false, error: { code: 'RATE_LIMITED', message: 'X' } }, 429),
      ),
    );

    const err = await apiRequest('/krs/my').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(getWaitingToken()).toBeNull();
  });

  it('getWaitingRoomStatus → status waiting dengan posisi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ success: true, data: { status: 'waiting', position: 3 } }),
      ),
    );

    const status = await getWaitingRoomStatus('wr-token-abc');
    expect(status).toEqual({ status: 'waiting', position: 3 });
    // Endpoint publik — tanpa Authorization header
    const fetchMock = vi.mocked(fetch);
    const opts = fetchMock.mock.calls[0][1] as RequestInit;
    expect((opts.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined();
  });

  it('enterWaitingRoom tidak menimpa URL saat sudah di /tunggu (hindari loop)', () => {
    const assign = stubLocation('/tunggu');

    enterWaitingRoom('wr-x');
    expect(sessionStorage.getItem(WAITING_TOKEN_KEY)).toBe('wr-x');
    expect(assign).not.toHaveBeenCalled();
  });
});
