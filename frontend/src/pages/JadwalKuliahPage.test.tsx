import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JadwalKuliahPage } from './JadwalKuliahPage';

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function krsPayload(items: unknown[]) {
  return {
    success: true,
    data: {
      submissionId: 1,
      status: 'approved',
      isLocked: true,
      totalCredits: 6,
      items,
    },
  };
}

const ITEMS = [
  {
    id: 10,
    classCode: 'TI-101-A',
    course: { code: 'TI101', name: 'Pemrograman Dasar', credits: 3 },
    dayOfWeek: 1,
    startTime: '08:00:00',
    endTime: '09:40:00',
    room: 'R.101',
    lecturerName: 'Dr. Andi',
  },
  {
    id: 11,
    classCode: 'TI-102-A',
    course: { code: 'TI102', name: 'Struktur Data', credits: 3 },
    dayOfWeek: 2,
    startTime: '10:00:00',
    endTime: '11:40:00',
    room: 'R.102',
    lecturerName: 'Dr. Budi',
  },
];

describe('JadwalKuliahPage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse(krsPayload(ITEMS)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('render — menampilkan tabel jadwal kuliah', async () => {
    render(
      <MemoryRouter>
        <JadwalKuliahPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Mata Kuliah')).toBeInTheDocument();
    expect(screen.getByText('Kelas')).toBeInTheDocument();
    expect(screen.getByText('Nama Dosen')).toBeInTheDocument();
    expect(screen.getByText('Ruang')).toBeInTheDocument();
    expect(screen.getByText('Jam')).toBeInTheDocument();
    expect(screen.getAllByText('Presensi').length).toBeGreaterThan(0);

    expect(screen.getByText('Pemrograman Dasar')).toBeInTheDocument();
    expect(screen.getByText('Struktur Data')).toBeInTheDocument();
    expect(screen.getByText('Dr. Andi')).toBeInTheDocument();
    expect(screen.getByText(/Senin · 08:00–09:40/)).toBeInTheDocument();
  });

  it('klik Presensi → membuka popup check-in', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <JadwalKuliahPage />
      </MemoryRouter>,
    );

    const presensiButtons = await screen.findAllByRole('button', { name: /Presensi/ });
    expect(presensiButtons.length).toBe(2);

    await user.click(presensiButtons[0]);

    // Popup tampil dengan opsi ID Sesi & QR Code + tombol Check-in
    expect(screen.getByText('ID Sesi')).toBeInTheDocument();
    expect(screen.getByText('QR Code')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check-in' })).toBeInTheDocument();
  });

  it('kosong — menampilkan pesan belum ada matkul', async () => {
    fetchMock.mockResolvedValue(jsonResponse(krsPayload([])));
    render(
      <MemoryRouter>
        <JadwalKuliahPage />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText('Belum ada mata kuliah yang dikontrak pada semester ini.'),
    ).toBeInTheDocument();
  });

  it('check-in dari popup — sukses', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(krsPayload(ITEMS)))
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: { message: 'Absensi berhasil dicatat!' } }),
      );
    render(
      <MemoryRouter>
        <JadwalKuliahPage />
      </MemoryRouter>,
    );

    const presensiButtons = await screen.findAllByRole('button', { name: /Presensi/ });
    await user.click(presensiButtons[0]);

    await user.type(screen.getByPlaceholderText('ID Sesi Absensi'), '42');
    await user.click(screen.getByRole('button', { name: 'Check-in' }));

    expect(await screen.findByText('Absensi berhasil dicatat!')).toBeInTheDocument();
    // fetch kedua = POST /attendance/check-in
    const called = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(called.some((u) => u.includes('/attendance/check-in'))).toBe(true);
  });

  it('check-in dari popup — validasi input kosong', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <JadwalKuliahPage />
      </MemoryRouter>,
    );

    const presensiButtons = await screen.findAllByRole('button', { name: /Presensi/ });
    await user.click(presensiButtons[0]);

    await user.click(screen.getByRole('button', { name: 'Check-in' }));

    expect(await screen.findByText('Masukkan ID Sesi Absensi')).toBeInTheDocument();
  });

  it('check-in dari popup — error FORBIDDEN', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(krsPayload(ITEMS)))
      .mockResolvedValueOnce(
        jsonResponse(
          { success: false, error: { code: 'FORBIDDEN', message: 'Sesi tidak dibuka' } },
          403,
        ),
      );
    render(
      <MemoryRouter>
        <JadwalKuliahPage />
      </MemoryRouter>,
    );

    const presensiButtons = await screen.findAllByRole('button', { name: /Presensi/ });
    await user.click(presensiButtons[0]);

    await user.type(screen.getByPlaceholderText('ID Sesi Absensi'), '42');
    await user.click(screen.getByRole('button', { name: 'Check-in' }));

    expect(await screen.findByText('Sesi tidak dibuka')).toBeInTheDocument();
  });

  it('error — menampilkan pesan saat fetch KRS gagal', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: { message: 'Gagal memuat jadwal' } }, 500),
    );
    render(
      <MemoryRouter>
        <JadwalKuliahPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat jadwal');
  });

  it('tutup popup — klik tombol X', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <JadwalKuliahPage />
      </MemoryRouter>,
    );

    const presensiButtons = await screen.findAllByRole('button', { name: /Presensi/ });
    await user.click(presensiButtons[0]);
    expect(screen.getByText('ID Sesi')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tutup' }));
    expect(screen.queryByText('ID Sesi')).not.toBeInTheDocument();
  });

  it('check-in mode QR — validasi & sukses', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(krsPayload(ITEMS)))
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: { message: 'Absensi QR berhasil' } }),
      );
    render(
      <MemoryRouter>
        <JadwalKuliahPage />
      </MemoryRouter>,
    );

    const presensiButtons = await screen.findAllByRole('button', { name: /Presensi/ });
    await user.click(presensiButtons[0]);

    // Ganti ke mode QR
    await user.click(screen.getByText('QR Code'));
    // Validasi kosong dulu
    await user.click(screen.getByRole('button', { name: 'Check-in' }));
    expect(await screen.findByText('Masukkan Kode QR')).toBeInTheDocument();

    // Isi kode QR → sukses
    await user.type(screen.getByPlaceholderText('Kode QR'), 'ABC123');
    await user.click(screen.getByRole('button', { name: 'Check-in' }));
    expect(await screen.findByText('Absensi QR berhasil')).toBeInTheDocument();
  });

  it('menampilkan jam "-" saat dayOfWeek/time kosong', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        krsPayload([
          {
            id: 99,
            classCode: 'TI-999',
            course: { code: 'TI999', name: 'MK Tanpa Jadwal', credits: 2 },
            dayOfWeek: null,
            startTime: null,
            endTime: null,
            room: null,
            lecturerName: null,
          },
        ]),
      ),
    );
    render(
      <MemoryRouter>
        <JadwalKuliahPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('MK Tanpa Jadwal')).toBeInTheDocument();
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });
});
