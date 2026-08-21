import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenAttendance } from './DosenAttendance';

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

/** Raw snake_case dari backend (normalisasi dilakukan di lib/api). */
const SESSIONS_RAW = [
  {
    id: 31,
    schedule_id: 311,
    session_date: '2026-08-03',
    topic: 'Pertemuan 1',
    is_open: false,
    class_code: 'TI101-A',
    course_code: 'TI101',
    course_name: 'Dasar-Dasar Pemrograman',
    meeting_number: 1,
    total_records: 2,
    hadir_count: 1,
  },
];

const MY_CLASSES = {
  items: [
    {
      id: 1,
      classCode: 'TI101-A',
      dayOfWeek: 1,
      startTime: '07:30',
      endTime: '09:00',
      room: 'R.101',
      capacity: 40,
      currentEnrolled: 2,
      curriculumId: 10,
      semesterId: 1,
      semesterNumber: 1,
      courseCode: 'TI101',
      courseName: 'Dasar-Dasar Pemrograman',
      credits: 3,
      schedules: [
        {
          id: 311,
          meetingNumber: 1,
          scheduledDate: '2026-08-03',
          topic: 'Pertemuan 1',
          isCompleted: false,
        },
        {
          id: 312,
          meetingNumber: 2,
          scheduledDate: '2026-08-10',
          topic: 'Array',
          isCompleted: false,
        },
      ],
    },
  ],
};

const RECORDS_RAW = {
  session: {
    id: 31,
    session_date: '2026-08-03',
    topic: 'Pertemuan 1',
    is_open: false,
    qr_code: null,
  },
  records: [
    {
      student_id: 1,
      nim: '2023110001',
      full_name: 'Budi Santoso',
      email: 'budi@example.id',
      record_id: 3111,
      status: 'hadir',
      marked_at: '2026-08-03T07:05:00Z',
      marked_by: 4,
    },
    {
      student_id: 2,
      nim: '2023110002',
      full_name: 'Ani Wijaya',
      email: 'ani@example.id',
      record_id: null,
      status: 'belum_absen',
      marked_at: null,
      marked_by: null,
    },
  ],
};

describe('DosenAttendance (T3.8)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/attendance/sessions?limit=100')) {
        return Promise.resolve(jsonResponse({ data: SESSIONS_RAW }));
      }
      if (u.includes('/dosen/my-classes')) {
        return Promise.resolve(jsonResponse({ data: MY_CLASSES }));
      }
      if (u.includes('/attendance/sessions/31/records')) {
        return Promise.resolve(jsonResponse({ data: RECORDS_RAW }));
      }
      return Promise.resolve(jsonResponse({ data: [] }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('render — tombol Tambah Sesi + daftar sesi absensi dari API', async () => {
    render(<DosenAttendance />);
    expect(screen.getByText('Sesi Absensi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Tambah Sesi Absensi' })).toBeInTheDocument();
    expect(await screen.findByText(/Pertemuan 1 \/ Senin, 3 Agustus 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Hadir 1\/2/)).toBeInTheDocument();
  });

  it('tanpa sesi → pesan kosong', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/dosen/my-classes')) {
        return Promise.resolve(jsonResponse({ data: { items: [] } }));
      }
      return Promise.resolve(jsonResponse({ data: [] }));
    });
    render(<DosenAttendance />);
    expect(
      await screen.findByText(
        'Belum ada sesi absensi. Klik "Tambah Sesi Absensi" untuk membuat dari jadwal pertemuan.',
      ),
    ).toBeInTheDocument();
  });

  it('load sesi gagal → error', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/dosen/my-classes')) {
        return Promise.resolve(jsonResponse({ data: { items: [] } }));
      }
      return Promise.resolve(
        jsonResponse({ success: false, error: { code: 'INTERNAL', message: 'x' } }, 500),
      );
    });
    render(<DosenAttendance />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat sesi absensi');
  });

  it('tombol Tambah → popup buka → pilih jadwal + topik → POST + modal tertutup', async () => {
    const user = userEvent.setup();
    let postBody: unknown = null;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST' && u.endsWith('/attendance/sessions')) {
        postBody = JSON.parse(String(init.body));
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: { id: 32, scheduleId: 312, topic: 'Array' },
          }),
        );
      }
      if (u.includes('/dosen/my-classes')) {
        return Promise.resolve(jsonResponse({ data: MY_CLASSES }));
      }
      return Promise.resolve(jsonResponse({ data: SESSIONS_RAW }));
    });
    render(<DosenAttendance />);
    await screen.findByText(/Pertemuan 1 \/ Senin, 3 Agustus 2026/);

    // Form awalnya TIDAK tampil — baru muncul setelah klik tombol
    expect(screen.queryByLabelText('Jadwal Pertemuan')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '+ Tambah Sesi Absensi' }));

    const scheduleSelect = await screen.findByLabelText('Jadwal Pertemuan');
    await user.selectOptions(scheduleSelect, '312');
    await user.type(screen.getByLabelText('Topik (opsional)'), 'Array');

    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Buat Sesi Absensi' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Sesi absensi berhasil dibuat');
    expect(postBody).toEqual({ scheduleId: 312, topic: 'Array' });
    // Modal tertutup setelah sukses
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('popup batal → form tertutup tanpa POST', async () => {
    const user = userEvent.setup();
    render(<DosenAttendance />);
    await screen.findByText(/Pertemuan 1 \/ Senin, 3 Agustus 2026/);

    await user.click(screen.getByRole('button', { name: '+ Tambah Sesi Absensi' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Batal' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/attendance/sessions'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('buat sesi CONFLICT → pesan API di dalam popup', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST' && u.endsWith('/attendance/sessions')) {
        return Promise.resolve(
          jsonResponse(
            { success: false, error: { code: 'CONFLICT', message: 'Sesi sudah ada' } },
            409,
          ),
        );
      }
      if (u.includes('/dosen/my-classes')) {
        return Promise.resolve(jsonResponse({ data: MY_CLASSES }));
      }
      return Promise.resolve(jsonResponse({ data: SESSIONS_RAW }));
    });
    render(<DosenAttendance />);
    await screen.findByText(/Pertemuan 1 \/ Senin, 3 Agustus 2026/);

    await user.click(screen.getByRole('button', { name: '+ Tambah Sesi Absensi' }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Jadwal Pertemuan'), '312');
    await user.click(within(dialog).getByRole('button', { name: 'Buat Sesi Absensi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sesi sudah ada');
    // Modal tetap terbuka agar dosen bisa koreksi
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('popup: jadwal yang sudah punya sesi absensi tidak muncul di dropdown', async () => {
    const user = userEvent.setup();
    render(<DosenAttendance />);
    // Sesi 31 = jadwal schedule_id 311 (sudah dibuat); hanya 312 yang tersedia
    await screen.findByText(/Pertemuan 1 \/ Senin, 3 Agustus 2026/);

    await user.click(screen.getByRole('button', { name: '+ Tambah Sesi Absensi' }));
    const dialog = screen.getByRole('dialog');
    const select = within(dialog).getByLabelText('Jadwal Pertemuan') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).not.toContain('311'); // sudah ada sesi → disembunyikan
    expect(values).toContain('312'); // belum ada sesi → tersedia
    expect(
      within(select).getByText(/Dasar-Dasar Pemrograman - TI101-A - Semester 1/),
    ).toBeInTheDocument();
  });

  it('semua jadwal sudah dibuatkan sesi → pesan kosong di popup', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/attendance/sessions?limit=100')) {
        return Promise.resolve(
          jsonResponse({
            data: [
              { ...SESSIONS_RAW[0], schedule_id: 311 },
              { ...SESSIONS_RAW[0], id: 32, schedule_id: 312 },
            ],
          }),
        );
      }
      if (u.includes('/dosen/my-classes')) {
        return Promise.resolve(jsonResponse({ data: MY_CLASSES }));
      }
      return Promise.resolve(jsonResponse({ data: [] }));
    });
    render(<DosenAttendance />);
    await screen.findAllByText(/Pertemuan 1 \/ Senin, 3 Agustus 2026/);

    await user.click(screen.getByRole('button', { name: '+ Tambah Sesi Absensi' }));
    expect(
      await within(screen.getByRole('dialog')).findByText(
        'Semua jadwal pertemuan sudah dibuatkan sesi absensi.',
      ),
    ).toBeInTheDocument();
  });

  it('pilih sesi → load records → ubah status → PUT /attendance/records/:id', async () => {
    const user = userEvent.setup();
    let putBody: unknown = null;
    let putUrl = '';
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'PUT' && u.includes('/attendance/records/')) {
        putUrl = u;
        putBody = JSON.parse(String(init.body));
        return Promise.resolve(jsonResponse({ success: true, data: { id: 3111 } }));
      }
      if (u.includes('/dosen/my-classes')) {
        return Promise.resolve(jsonResponse({ data: MY_CLASSES }));
      }
      if (u.includes('/attendance/sessions/31/records')) {
        return Promise.resolve(jsonResponse({ data: RECORDS_RAW }));
      }
      return Promise.resolve(jsonResponse({ data: SESSIONS_RAW }));
    });
    render(<DosenAttendance />);
    await screen.findByText(/Pertemuan 1 \/ Senin, 3 Agustus 2026/);

    // Expand sesi 31
    await user.click(screen.getByText(/Pertemuan 1 \/ Senin, 3 Agustus 2026/));
    expect(await screen.findByText('Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('Ani Wijaya')).toBeInTheDocument();

    // Ani belum check-in (belum_absen, record_id null) → tidak ada radio terpilih,
    // tapi radio TETAP AKTIF — dosen bisa set status manual (auto-create record)
    const aniRow = screen.getByText('Ani Wijaya').closest('tr');
    expect(aniRow).not.toBeNull();
    const aniRadios = within(aniRow as HTMLElement).getByRole('radio', {
      name: 'Tidak Hadir',
    }) as HTMLInputElement;
    expect(aniRadios.checked).toBe(false);
    expect(aniRadios.disabled).toBe(false);

    // Ubah status Budi (record_id 3111) → hadir → izin via radio
    const budiRow = screen.getByText('Budi Santoso').closest('tr');
    expect(budiRow).not.toBeNull();
    await user.click(within(budiRow as HTMLElement).getByRole('radio', { name: 'Izin' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Status 2023110001 diperbarui');
    expect(putUrl).toContain('/attendance/records/3111');
    expect(putBody).toEqual({ status: 'izin' });

    // Klik sesi yang sama lagi → collapse (detail hilang)
    await user.click(screen.getByText(/Pertemuan 1 \/ Senin, 3 Agustus 2026/));
    expect(screen.queryByText('Budi Santoso')).not.toBeInTheDocument();
    expect(screen.queryByText('Tanggal: Senin, 3 Agustus 2026')).not.toBeInTheDocument();
  });

  it('buka sesi → PUT /attendance/sessions/:id/open', async () => {
    const user = userEvent.setup();
    let putUrl = '';
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'PUT' && u.includes('/attendance/sessions/')) {
        putUrl = u;
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: { id: 31, is_open: true },
          }),
        );
      }
      if (u.includes('/dosen/my-classes')) {
        return Promise.resolve(jsonResponse({ data: MY_CLASSES }));
      }
      return Promise.resolve(jsonResponse({ data: SESSIONS_RAW }));
    });
    render(<DosenAttendance />);
    await screen.findByText(/Pertemuan 1 \/ Senin, 3 Agustus 2026/);

    await user.click(screen.getByRole('button', { name: 'Buka' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Sesi dibuka — mahasiswa dapat check-in',
    );
    expect(putUrl).toContain('/attendance/sessions/31/open');
  });
});
