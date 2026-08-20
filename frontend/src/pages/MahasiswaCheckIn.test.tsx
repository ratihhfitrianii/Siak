import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MahasiswaCheckIn } from './MahasiswaCheckIn';

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe('MahasiswaCheckIn', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('render — header + input session ID + tips', () => {
    render(
      <MemoryRouter>
        <MahasiswaCheckIn />
      </MemoryRouter>,
    );
    expect(screen.getByText('Check-In Absensi')).toBeInTheDocument();
    expect(screen.getByText('ID Sesi')).toBeInTheDocument();
    expect(screen.getByText('QR Code')).toBeInTheDocument();
    expect(screen.getByText('Check-In Sekarang')).toBeInTheDocument();
    expect(screen.getByText(/Pastikan sesi absensi sudah dibuka/)).toBeInTheDocument();
  });

  it('switch to QR Code mode', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MahasiswaCheckIn />
      </MemoryRouter>,
    );
    await user.click(screen.getByText('QR Code'));
    expect(screen.getByText('Kode QR')).toBeInTheDocument();
    expect(screen.getByText('Scan QR Code yang ditampilkan dosen di kelas')).toBeInTheDocument();
  });

  it('check-in with session ID — success', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: { id: 1, message: 'Absensi berhasil dicatat' } }),
    );
    render(
      <MemoryRouter>
        <MahasiswaCheckIn />
      </MemoryRouter>,
    );

    await user.type(screen.getByPlaceholderText(/Contoh: 42/), '42');
    await user.click(screen.getByText('Check-In Sekarang'));

    expect(await screen.findByRole('status')).toHaveTextContent('Absensi berhasil dicatat');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/attendance/check-in'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('check-in — FORBIDDEN error', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse(
        { success: false, error: { code: 'FORBIDDEN', message: 'Sesi tidak dibuka' } },
        403,
      ),
    );
    render(
      <MemoryRouter>
        <MahasiswaCheckIn />
      </MemoryRouter>,
    );

    await user.type(screen.getByPlaceholderText(/Contoh: 42/), '42');
    await user.click(screen.getByText('Check-In Sekarang'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Sesi tidak dibuka');
  });

  it('empty input — validation error', () => {
    render(
      <MemoryRouter>
        <MahasiswaCheckIn />
      </MemoryRouter>,
    );

    // Button is disabled when input is empty, so we need to enable it first
    // by typing then clearing, or just check the disabled state
    const btn = screen.getByRole('button', { name: 'Check-In Sekarang' });
    expect(btn).toBeDisabled();
  });

  it('check-in with QR code — success', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: { id: 2, message: 'Absensi berhasil dicatat' } }),
    );
    render(
      <MemoryRouter>
        <MahasiswaCheckIn />
      </MemoryRouter>,
    );

    // Switch to QR mode
    await user.click(screen.getByText('QR Code'));
    await user.type(screen.getByPlaceholderText(/Masukkan kode QR/), 'ABC123');
    await user.click(screen.getByText('Check-In Sekarang'));

    expect(await screen.findByRole('status')).toHaveTextContent('Absensi berhasil dicatat');
  });
});
