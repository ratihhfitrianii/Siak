import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { controlFor } from '../test/controls';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenSubstitute } from './DosenSubstitute';

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 4, username: 'dosen.TI1' }, booting: false, logout: vi.fn() }),
}));

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const LECTURERS = {
  items: [
    {
      id: 1,
      userId: 4,
      nidn: '001',
      fullName: 'Dosen Satu',
      email: 'd1@example.id',
      prodiCode: 'TI',
    },
    {
      id: 2,
      userId: 5,
      nidn: '002',
      fullName: 'Dosen Dua',
      email: 'd2@example.id',
      prodiCode: 'TI',
    },
  ],
};

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
      ],
    },
  ],
};

const REQUESTS_RAW = [
  {
    id: 41,
    original_lecturer_id: 1,
    original_lecturer_name: 'Dosen Satu',
    substitute_lecturer_id: 2,
    substitute_lecturer_name: 'Dosen Dua',
    class_id: 1,
    class_name: 'TI101-A',
    schedule_id: 311,
    meeting_number: 1,
    scheduled_date: '2026-08-03',
    topic: 'Pertemuan 1',
    course_code: 'TI101',
    course_name: 'Dasar-Dasar Pemrograman',
    reason: 'Sakit',
    status: 'active',
    requested_by_name: 'Dosen Satu',
    approved_by_name: null,
    created_at: '2026-08-02T08:00:00Z',
  },
];

describe('DosenSubstitute (T3.8)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/substitute?limit=100')) {
        return Promise.resolve(jsonResponse({ data: { items: REQUESTS_RAW } }));
      }
      if (u.includes('/dosen/lecturers')) {
        return Promise.resolve(jsonResponse({ data: LECTURERS }));
      }
      if (u.includes('/dosen/my-classes')) {
        return Promise.resolve(jsonResponse({ data: MY_CLASSES }));
      }
      return Promise.resolve(jsonResponse({ data: [] }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('render — header + daftar requests + default dosen asli = diri sendiri', async () => {
    render(<DosenSubstitute />);
    expect(screen.getByText('Substitute Teaching')).toBeInTheDocument();
    expect(await screen.findByText(/TI101 — TI101-A · Pertemuan 1/)).toBeInTheDocument();
    expect(screen.getByText('Aktif')).toBeInTheDocument();
    // Keluhan lama: dosen asli TIDAK dipilih manual — dikunci otomatis (diri sendiri, userId 4 → id 1)
    expect(screen.getByText('Dosen Satu (TI)')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Dosen Asli' })).not.toBeInTheDocument();
  });

  it('load data gagal → error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: { code: 'INTERNAL', message: 'x' } }, 500),
    );
    render(<DosenSubstitute />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat data substitute');
  });

  it('dosen asli == pengganti → filter dropdown & form kosong (tidak bisa pilih diri sendiri)', async () => {
    render(<DosenSubstitute />);
    await screen.findByText(/TI101 — TI101-A · Pertemuan 1/);

    // Dropdown pengganti TIDAK memuat dosen asli (diri sendiri, id 1)
    const subSelect = controlFor('Dosen Pengganti', 'select');
    const options = Array.from(subSelect.querySelectorAll('option')).map((o) =>
      o.getAttribute('value'),
    );
    expect(options).not.toContain('1');
    expect(options).toContain('2');
    // Tombol disabled karena pengganti belum dipilih
    expect(screen.getByRole('button', { name: 'Ajukan Substitute' })).toBeDisabled();
  });

  it('submit lengkap → POST /substitute + success + reload', async () => {
    const user = userEvent.setup();
    let postBody: unknown = null;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST' && u.endsWith('/substitute')) {
        postBody = JSON.parse(String(init.body));
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              id: 42,
              original_lecturer_id: 1,
              original_lecturer_name: 'Dosen Satu',
              substitute_lecturer_id: 2,
              substitute_lecturer_name: 'Dosen Dua',
              class_id: 1,
              class_name: 'TI101-A',
              schedule_id: 311,
              meeting_number: 1,
              scheduled_date: '2026-08-03',
              topic: 'Pertemuan 1',
              course_code: 'TI101',
              course_name: 'Dasar-Dasar Pemrograman',
              reason: 'Sakit',
              status: 'active',
              requested_by_name: 'Dosen Satu',
              approved_by_name: null,
              created_at: '2026-08-02T08:00:00Z',
            },
          }),
        );
      }
      if (u.includes('/substitute?limit=100')) {
        return Promise.resolve(jsonResponse({ data: { items: REQUESTS_RAW } }));
      }
      if (u.includes('/dosen/lecturers')) {
        return Promise.resolve(jsonResponse({ data: LECTURERS }));
      }
      if (u.includes('/dosen/my-classes')) {
        return Promise.resolve(jsonResponse({ data: MY_CLASSES }));
      }
      return Promise.resolve(jsonResponse({ data: [] }));
    });
    render(<DosenSubstitute />);
    await screen.findByText(/TI101 — TI101-A · Pertemuan 1/);

    await user.selectOptions(controlFor('Dosen Pengganti', 'select'), '2');
    await user.selectOptions(controlFor('Kelas', 'select'), '1');
    await user.selectOptions(controlFor('Jadwal Pertemuan', 'select'), '311');
    await user.type(controlFor('Alasan (opsional)', 'textarea'), 'Sakit');

    await user.click(screen.getByRole('button', { name: 'Ajukan Substitute' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Substitute teaching berhasil diajukan (langsung aktif)',
    );
    expect(postBody).toEqual({
      originalLecturerId: 1,
      substituteLecturerId: 2,
      classId: 1,
      scheduleId: 311,
      reason: 'Sakit',
    });
  });

  it('submit CONFLICT → pesan API', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST' && u.endsWith('/substitute')) {
        return Promise.resolve(
          jsonResponse(
            { success: false, error: { code: 'CONFLICT', message: 'Sudah ada substitute aktif' } },
            409,
          ),
        );
      }
      if (u.includes('/substitute?limit=100')) {
        return Promise.resolve(jsonResponse({ data: { items: [] } }));
      }
      if (u.includes('/dosen/lecturers')) {
        return Promise.resolve(jsonResponse({ data: LECTURERS }));
      }
      if (u.includes('/dosen/my-classes')) {
        return Promise.resolve(jsonResponse({ data: MY_CLASSES }));
      }
      return Promise.resolve(jsonResponse({ data: [] }));
    });
    render(<DosenSubstitute />);
    // Tunggu opsi dosen pengganti muncul (menjamin lecturers + my-classes selesai load)
    await screen.findByRole('option', { name: 'Dosen Dua (TI)' });

    await user.selectOptions(controlFor('Dosen Pengganti', 'select'), '2');
    await user.selectOptions(controlFor('Kelas', 'select'), '1');
    await user.selectOptions(controlFor('Jadwal Pertemuan', 'select'), '311');
    await user.click(screen.getByRole('button', { name: 'Ajukan Substitute' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Sudah ada substitute aktif');
  });

  it('batalkan request → PUT /substitute/:id/cancel', async () => {
    const user = userEvent.setup();
    let putUrl = '';
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'PUT' && u.includes('/cancel')) {
        putUrl = u;
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: { ...REQUESTS_RAW[0], status: 'cancelled' },
          }),
        );
      }
      if (u.includes('/substitute?limit=100')) {
        return Promise.resolve(jsonResponse({ data: { items: REQUESTS_RAW } }));
      }
      if (u.includes('/dosen/lecturers')) {
        return Promise.resolve(jsonResponse({ data: LECTURERS }));
      }
      if (u.includes('/dosen/my-classes')) {
        return Promise.resolve(jsonResponse({ data: MY_CLASSES }));
      }
      return Promise.resolve(jsonResponse({ data: [] }));
    });
    render(<DosenSubstitute />);
    await screen.findByText(/TI101 — TI101-A · Pertemuan 1/);

    await user.click(screen.getByRole('button', { name: 'Batalkan' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Substitute dibatalkan');
    expect(putUrl).toContain('/substitute/41/cancel');
  });
});
