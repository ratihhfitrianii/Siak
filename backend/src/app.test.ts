import request from 'supertest';
import type { NextFunction, Request, Response } from 'express';
import { createApp } from './app';
import { errorHandler } from './middleware/error-handler';

describe('Aplikasi Express (fondasi T1.1)', () => {
  it('mengembalikan 404 NOT_FOUND untuk endpoint yang tidak dikenal', async () => {
    const res = await request(createApp()).get('/api/v1/tidak-ada').expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toContain('Endpoint tidak ditemukan');
  });

  it('menangani method yang tidak didukung dengan 404', async () => {
    const res = await request(createApp()).post('/api/v1/health').expect(404);

    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('errorHandler (terpusat)', () => {
  it('mengembalikan 500 INTERNAL_ERROR dengan trace_id', () => {
    const req = {
      header: (name: string) => (name === 'x-trace-id' ? 'trace-123' : undefined),
      path: '/api/v1/boom',
    } as unknown as Request;

    const json = jest.fn();
    const res = {
      status: jest.fn().mockReturnValue({ json }),
    } as unknown as Response;

    errorHandler(new Error('boom'), req, res, {} as NextFunction);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan internal. Silakan coba lagi.' },
      trace_id: 'trace-123',
    });
  });

  it('trace_id undefined bila header tidak dikirim', () => {
    const req = {
      header: () => undefined,
      path: '/api/v1/boom',
    } as unknown as Request;

    const json = jest.fn();
    const res = {
      status: jest.fn().mockReturnValue({ json }),
    } as unknown as Response;

    errorHandler(new Error('boom'), req, res, {} as NextFunction);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        trace_id: undefined,
      }),
    );
  });
});
