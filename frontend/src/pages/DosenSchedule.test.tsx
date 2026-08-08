import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { controlFor } from '../test/controls';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenSchedule } from './DosenSchedule';
import type { ScheduleAvailability } from '../lib/types';

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const AVAILABILITY: ScheduleAvailability = {
  date: '2026-08-10',
  dayOfWeek: 1,
  busySlots: [
    {
      id: 11,
      meetingNumber: 1,
      topic: 'Pengenalan',
      isCompleted: false,
      classCode: 'TI101-A',
      courseCode: 'TI101',
      courseName: 'Dasar-Dasar Pemrograman',
    },
    {
      id: 12,
      meetingNumber: 2,
      topic: null,
      isCompleted: true,
      classCode: 'TI101-A',
      courseCode: 'TI101',
      courseName: 'Dasar-Dasar Pemrograman',
    },
  ],
  availableSlots: [
    {
      classId: 1,
      classCode: 'TI101-A',
      startTime: '07:30',
      endTime: '09:00',
      courseCode: 'TI101',
      courseName: 'Dasar-Dasar Pemrograman',
      semesterNumber: 1,
    },
  ],
  isAvailable: false,
};

describe('DosenSchedule (T3.8 — view availability)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('render awal — header + input tanggal + request availability (default hari ini)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { ...AVAILABILITY, busySlots: [], availableSlots: [] } }),
    );
    render(<DosenSchedule />);

    expect(screen.getByText('Jadwal Mengajar')).toBeInTheDocument();
    expect(controlFor('Tanggal', 'input')).toHaveValue(new Date().toISOString().slice(0, 10));
    expect(
      await screen.findByText('Tidak ada jadwal pertemuan pada tanggal ini.'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/schedule/availability?date='),
      expect.any(Object),
    );
  });

  it('load availability → render busy slots + available slots', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: AVAILABILITY }));
    render(<DosenSchedule />);

    // Busy slots (jadwal pertemuan)
    expect(await screen.findByText('Pengenalan')).toBeInTheDocument();
    expect(screen.getByText('Pertemuan', { selector: 'th' })).toBeInTheDocument();
    // Status badge Selesai utk pertemuan 2
    expect(screen.getAllByText('Terjadwal').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Selesai')).toBeInTheDocument();
    // Available slots
    expect(screen.getByText('Slot Kosong (belum terjadwal)')).toBeInTheDocument();
    expect(screen.getAllByText('07:30 – 09:00').length).toBeGreaterThanOrEqual(1);
  });

  it('load availability gagal → error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: { code: 'INTERNAL', message: 'x' } }, 500),
    );
    render(<DosenSchedule />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat ketersediaan jadwal');
  });

  it('ganti tanggal → request ulang dengan tanggal baru', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { ...AVAILABILITY, date: '2026-08-11', busySlots: [] } }),
    );
    render(<DosenSchedule />);

    const dateInput = controlFor('Tanggal', 'input');
    await user.clear(dateInput);
    await user.type(dateInput, '2026-08-11');

    expect(
      await screen.findByText('Tidak ada jadwal pertemuan pada tanggal ini.'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/schedule/availability?date=2026-08-11'),
      expect.any(Object),
    );
  });

  it('semua slot terisi → pesan tidak ada slot kosong', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: { ...AVAILABILITY, availableSlots: [] },
      }),
    );
    render(<DosenSchedule />);

    expect(
      await screen.findByText(
        'Tidak ada slot kosong — seluruh kelas sudah terjadwal pada tanggal ini.',
      ),
    ).toBeInTheDocument();
  });
});
