import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  apiRequest,
  getAccessToken,
  getRefreshToken,
  setTokens,
  tryRefresh,
} from './api';

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
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
