import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { controlFor } from '../test/controls';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenSchedule } from './DosenSchedule';
import type { ScheduleItem } from '../lib/types';

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const SCHEDULES: ScheduleItem[] = [
  {
    id: 11,
    classId: 1,
    classCode: 'TI101-A',
    courseCode: 'TI101',
    courseName: 'Dasar-Dasar Pemrograman',
    dayOfWeek: 1,
    startTime: '07:30',
    endTime: '09:00',
    room: 'R.101',
    lecturerId: 7,
  },
  {
    id: 12,
    classId: 1,
    classCode: 'TI101-A',
    courseCode: 'TI101',
    courseName: 'Dasar-Dasar Pemrograman',
    dayOfWeek: 3,
    startTime: '10:00',
    endTime: '11:30',
    room: 'R.102',
    lecturerId: 7,
  },
];

describe('DosenSchedule (T3.8)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('render awal — minta pilih kelas', () => {
    render(<DosenSchedule />);
    expect(screen.getByText('Input Jadwal Mengajar')).toBeInTheDocument();
    expect(screen.getByText('Pilih kelas untuk melihat jadwal.')).toBeInTheDocument();
  });

  it('pilih kelas → load jadwal → render daftar dengan hari Indonesia', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: SCHEDULES } }));
    render(<DosenSchedule />);

    await user.selectOptions(controlFor('Mata Kuliah / Kelas', 'select'), '1');
    expect((await screen.findAllByText('TI101 - Dasar-Dasar Pemrograman')).length).toBe(2);
    expect(screen.getByText(/Senin \|/)).toBeInTheDocument();
    expect(screen.getByText(/Ruang: R\.101/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/schedule?classId=1'),
      expect.any(Object),
    );
  });

  it('load jadwal gagal → error', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: { code: 'INTERNAL', message: 'x' } }, 500),
    );
    render(<DosenSchedule />);
    await user.selectOptions(controlFor('Mata Kuliah / Kelas', 'select'), '1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat jadwal');
  });

  it('tombol Simpan Jadwal disabled sampai semua field lengkap', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: SCHEDULES } }));
    render(<DosenSchedule />);
    await user.selectOptions(controlFor('Mata Kuliah / Kelas', 'select'), '1');
    await screen.findAllByText('TI101 - Dasar-Dasar Pemrograman');

    const btn = screen.getByRole('button', { name: 'Simpan Jadwal' });
    expect(btn).toBeDisabled();

    // Lengkapi semua field → enabled
    await user.selectOptions(controlFor('Hari', 'select'), '1');
    await user.type(controlFor('Ruang', 'input'), 'R.1');
    await user.type(controlFor('Jam Mulai', 'input'), '08:00');
    await user.type(controlFor('Jam Selesai', 'input'), '09:30');
    expect(btn).toBeEnabled();
  });

  it('submit lengkap → POST /schedule + success + form reset', async () => {
    const user = userEvent.setup();
    let postBody: unknown = null;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/schedule')) {
        postBody = JSON.parse(String(init.body));
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              id: 13,
              classId: 1,
              classCode: 'TI101-A',
              courseCode: 'TI101',
              courseName: 'Dasar-Dasar Pemrograman',
              dayOfWeek: 5,
              startTime: '13:00',
              endTime: '14:30',
              room: 'R.201',
              lecturerId: 7,
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse({ data: { items: SCHEDULES } }));
    });
    render(<DosenSchedule />);
    await user.selectOptions(controlFor('Mata Kuliah / Kelas', 'select'), '1');
    await screen.findAllByText('TI101 - Dasar-Dasar Pemrograman');

    await user.selectOptions(controlFor('Hari', 'select'), '5');
    await user.type(controlFor('Ruang', 'input'), 'R.201');
    await user.type(controlFor('Jam Mulai', 'input'), '13:00');
    await user.type(controlFor('Jam Selesai', 'input'), '14:30');
    await user.click(screen.getByRole('button', { name: 'Simpan Jadwal' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Jadwal berhasil disimpan');
    expect(postBody).toEqual({
      classId: 1,
      dayOfWeek: 5,
      startTime: '13:00',
      endTime: '14:30',
      room: 'R.201',
    });
  });

  it('submit CONFLICT → pesan bentrok jadwal', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/schedule')) {
        return Promise.resolve(
          jsonResponse({ success: false, error: { code: 'CONFLICT', message: 'bentrok' } }, 409),
        );
      }
      return Promise.resolve(jsonResponse({ data: { items: SCHEDULES } }));
    });
    render(<DosenSchedule />);
    await user.selectOptions(controlFor('Mata Kuliah / Kelas', 'select'), '1');
    await screen.findAllByText('TI101 - Dasar-Dasar Pemrograman');

    await user.selectOptions(controlFor('Hari', 'select'), '1');
    await user.type(controlFor('Ruang', 'input'), 'R.1');
    await user.type(controlFor('Jam Mulai', 'input'), '08:00');
    await user.type(controlFor('Jam Selesai', 'input'), '09:30');
    await user.click(screen.getByRole('button', { name: 'Simpan Jadwal' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Jadwal bentrok dengan jadwal yang sudah ada',
    );
  });

  it('submit VALIDATION_ERROR → pesan API', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/schedule')) {
        return Promise.resolve(
          jsonResponse(
            { success: false, error: { code: 'VALIDATION_ERROR', message: 'Jam tidak valid' } },
            400,
          ),
        );
      }
      return Promise.resolve(jsonResponse({ data: { items: SCHEDULES } }));
    });
    render(<DosenSchedule />);
    await user.selectOptions(controlFor('Mata Kuliah / Kelas', 'select'), '1');
    await screen.findAllByText('TI101 - Dasar-Dasar Pemrograman');

    await user.selectOptions(controlFor('Hari', 'select'), '2');
    await user.type(controlFor('Ruang', 'input'), 'R.2');
    await user.type(controlFor('Jam Mulai', 'input'), '08:00');
    await user.type(controlFor('Jam Selesai', 'input'), '09:30');
    await user.click(screen.getByRole('button', { name: 'Simpan Jadwal' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Jam tidak valid');
  });

  it('kelas tanpa jadwal → pesan kosong', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: [] } }));
    render(<DosenSchedule />);
    await user.selectOptions(controlFor('Mata Kuliah / Kelas', 'select'), '2');
    expect(await screen.findByText('Belum ada jadwal untuk kelas ini.')).toBeInTheDocument();
  });
});
