import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KrsPage } from './KrsPage';
import type { AvailableClass, KrsPeriod, MyKrs } from '../lib/types';

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const PERIOD: KrsPeriod = {
  id: 1,
  semesterId: 2,
  semesterCode: '2024/2025-1',
  name: 'Ganjil 2024/2025',
  startDate: '2024-08-01',
  endDate: '2024-09-30',
  isRevision: false,
  status: 'open',
};

const MY_DRAFT: MyKrs = {
  submissionId: 10,
  status: 'draft',
  isLocked: false,
  submittedAt: null,
  rejectionReason: null,
  totalCredits: 3,
  items: [
    {
      id: 101,
      classCode: 'A',
      course: { code: 'MAT1', name: 'Matematika Dasar', credits: 3 },
      dayOfWeek: 1,
      startTime: '08:00:00',
      endTime: '09:40:00',
      room: 'R.101',
      lecturerName: 'Dr. Andi',
    },
  ],
};

function cls(
  overrides: Partial<AvailableClass> & { id: number; course: AvailableClass['course'] },
): AvailableClass {
  return {
    classCode: 'A',
    capacity: 40,
    currentEnrolled: 20,
    quotaLeft: 20,
    room: 'R.101',
    dayOfWeek: 1,
    startTime: '08:00:00',
    endTime: '09:40:00',
    lecturerName: 'Dr. Andi',
    isMandatory: false,
    semesterNumber: 1,
    ...overrides,
  };
}

const AVAILABLE: AvailableClass[] = [
  cls({
    id: 101,
    classCode: 'A',
    course: { code: 'MAT1', name: 'Matematika Dasar', credits: 3 },
    isMandatory: true,
  }),
  cls({
    id: 102,
    classCode: 'B',
    course: { code: 'FIS1', name: 'Fisika Dasar', credits: 4 },
    dayOfWeek: 3,
    startTime: '10:00:00',
    endTime: '11:40:00',
    room: 'R.102',
    lecturerName: 'Prof. Sari',
    currentEnrolled: 30,
    quotaLeft: 10,
  }),
];

/** 7 matkul untuk test pagination (keluhan #28 — 5 per halaman). */
const MANY: AvailableClass[] = Array.from({ length: 7 }, (_, i) =>
  cls({
    id: 200 + i,
    classCode: String.fromCharCode(65 + i),
    course: { code: `MK${i + 1}`, name: `Mata Kuliah ${i + 1}`, credits: 2 },
    dayOfWeek: ((i % 5) + 1) as 1,
    startTime: '08:00:00',
    endTime: '09:40:00',
  }),
);

interface KrsMocks {
  period?: KrsPeriod;
  my?: MyKrs;
  available?: AvailableClass[];
  onDraft?: (body: unknown) => void;
  onSubmit?: (body: unknown) => void;
  duplicateCourseError?: boolean;
}

/** Mock fetch yang merutekan endpoint KRS; POST draft/submit dicatat untuk asersi. */
function mockKrsRoutes({
  period = PERIOD,
  my = MY_DRAFT,
  available = AVAILABLE,
  onDraft,
  onSubmit,
  duplicateCourseError = false,
}: KrsMocks = {}) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'POST' && String(url).includes('/krs/draft')) {
      onDraft?.(JSON.parse(String(init?.body)));
      if (duplicateCourseError) {
        return Promise.resolve(
          jsonResponse(
            {
              success: false,
              error: {
                code: 'DUPLICATE_COURSE',
                message:
                  'Tidak boleh mengambil matkul yang sama (MAT1) lebih dari satu kali dalam 1 KRS',
                details: { fields: { classIds: [{ message: 'Duplikat course_code: MAT1' }] } },
              },
            },
            409,
          ),
        );
      }
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: { submissionId: 10, status: 'draft', message: 'Draft tersimpan' },
        }),
      );
    }
    if (method === 'POST' && String(url).includes('/krs/submit')) {
      onSubmit?.(JSON.parse(String(init?.body)));
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: { submissionId: 10, status: 'submitted', locked: true },
        }),
      );
    }
    if (String(url).includes('/krs/period')) {
      return Promise.resolve(jsonResponse({ success: true, data: period }));
    }
    if (String(url).includes('/krs/my')) {
      return Promise.resolve(jsonResponse({ success: true, data: my }));
    }
    if (String(url).includes('/krs/available-classes')) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: { period: { id: period.id, name: period.name }, items: available },
        }),
      );
    }
    return Promise.resolve(jsonResponse({ success: true, data: null }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('KrsPage (T1.11b + Gelombang 3 #28–#30 redesign)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('layout 2 kolom: daftar matkul (kiri) + draft KRS (kanan)', async () => {
    mockKrsRoutes();
    render(<KrsPage />);

    expect(await screen.findByText('Kartu Rencana Studi')).toBeInTheDocument();
    expect(screen.getByLabelText('Daftar mata kuliah')).toBeInTheDocument();
    expect(screen.getByLabelText('Kelas terpilih')).toBeInTheDocument();
    // Periode + status
    expect(screen.getByText('Periode Buka')).toBeInTheDocument();
    expect(screen.getByText('Ganjil 2024/2025')).toBeInTheDocument();
  });

  it('keluhan #30 — kartu menampilkan format: nama MK - kode | SKS, dosen | jadwal, kuota tersisa', async () => {
    mockKrsRoutes();
    render(<KrsPage />);

    // Scope ke daftar matkul (teks juga muncul di draft KRS kanan)
    const list = await screen.findByLabelText('Daftar mata kuliah');
    expect(within(list).getByText(/Matematika Dasar/)).toBeInTheDocument();
    expect(within(list).getByText(/— MAT1/)).toBeInTheDocument();
    expect(within(list).getByText('3 SKS')).toBeInTheDocument();
    expect(within(list).getByText('Dr. Andi')).toBeInTheDocument();
    expect(within(list).getByText('Senin 08:00–09:40')).toBeInTheDocument();
    expect(within(list).getByText('Kuota tersisa: 20')).toBeInTheDocument();
    expect(within(list).getByText('WAJIB')).toBeInTheDocument();
  });

  it('keluhan #29 — centang checkbox kartu → masuk draft KRS & total SKS bertambah', async () => {
    const user = userEvent.setup();
    mockKrsRoutes();
    render(<KrsPage />);

    // Draft awal berisi MAT1 (3 SKS)
    const draft = await screen.findByLabelText('Kelas terpilih');
    expect(within(draft).getByText(/Matematika Dasar/)).toBeInTheDocument();

    // MAT1 sudah dicentang (dari draft); centang FIS1
    expect(screen.getByRole('checkbox', { name: 'Pilih Matematika Dasar' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Pilih Fisika Dasar' }));

    expect(await screen.findByText('7')).toBeInTheDocument(); // 3 + 4
    expect(within(draft).getByText(/Fisika Dasar/)).toBeInTheDocument();
  });

  it('keluhan #29 — uncentang → kelas dihapus dari draft', async () => {
    const user = userEvent.setup();
    mockKrsRoutes();
    render(<KrsPage />);

    const draft = await screen.findByLabelText('Kelas terpilih');
    await within(draft).findByText(/Matematika Dasar/);

    await user.click(screen.getByRole('checkbox', { name: 'Pilih Matematika Dasar' }));

    expect(within(draft).queryByText(/Matematika Dasar/)).not.toBeInTheDocument();
    expect(
      screen.getByText('Belum ada mata kuliah. Centang dari daftar di sebelah kiri.'),
    ).toBeInTheDocument();
  });

  it('keluhan #29 — kelas dgn kode+jadwal+dosen SAMA digabung jadi satu kartu', async () => {
    const user = userEvent.setup();
    mockKrsRoutes({
      available: [
        cls({
          id: 1,
          classCode: 'A',
          course: { code: 'TI1', name: 'Teknologi Informasi', credits: 3 },
          dayOfWeek: 2,
          startTime: '08:00:00',
          endTime: '09:40:00',
          lecturerName: 'Dr. Budi',
        }),
        cls({
          id: 2,
          classCode: 'B',
          course: { code: 'TI1', name: 'Teknologi Informasi', credits: 3 },
          dayOfWeek: 2,
          startTime: '08:00:00',
          endTime: '09:40:00',
          lecturerName: 'Dr. Budi',
        }),
        cls({
          id: 3,
          classCode: 'C',
          course: { code: 'TI1', name: 'Teknologi Informasi', credits: 3 },
          dayOfWeek: 4,
          startTime: '13:00:00',
          endTime: '14:40:00',
          lecturerName: 'Dr. Dewi',
        }),
      ],
      my: { ...MY_DRAFT, items: [] },
    });
    render(<KrsPage />);

    // 2 kelas identik (jadwal+dosen sama) → 1 kartu; kelas jadwal beda → kartu lain
    const cards = await screen.findAllByText(/Teknologi Informasi/);
    expect(cards).toHaveLength(2);
    expect(screen.getByText(/2 kelas \(A, B\)/)).toBeInTheDocument();

    // centang kartu gabungan → kedua kelas masuk draft (classCode A dan B)
    const checkboxes = screen.getAllByRole('checkbox', { name: 'Pilih Teknologi Informasi' });
    await user.click(checkboxes[0]);
    const draft = screen.getByLabelText('Kelas terpilih');
    await within(draft).findByText(/A · Selasa/);
    expect(within(draft).getByText(/B · Selasa/)).toBeInTheDocument();
  });

  it('keluhan #28 — pagination: >5 matkul → halaman 1 (5 kartu) + navigasi', async () => {
    const user = userEvent.setup();
    mockKrsRoutes({ available: MANY, my: { ...MY_DRAFT, items: [] } });
    render(<KrsPage />);

    await screen.findByText('Mata Kuliah 1');
    expect(screen.getByText('Menampilkan 5 dari 7 matkul')).toBeInTheDocument();
    expect(screen.getByText('Mata Kuliah 5')).toBeInTheDocument();
    expect(screen.queryByText('Mata Kuliah 6')).not.toBeInTheDocument();
    expect(screen.getByText('Halaman 1 / 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Berikutnya →' }));
    expect(screen.getByText('Mata Kuliah 6')).toBeInTheDocument();
    expect(screen.getByText('Mata Kuliah 7')).toBeInTheDocument();
    expect(screen.queryByText('Mata Kuliah 1')).not.toBeInTheDocument();
    expect(screen.getByText('Halaman 2 / 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '← Sebelumnya' }));
    expect(screen.getByText('Mata Kuliah 1')).toBeInTheDocument();
  });

  it('simpan draft → POST /krs/draft dengan classIds terpilih', async () => {
    const user = userEvent.setup();
    const onDraft = vi.fn();
    mockKrsRoutes({ onDraft });
    render(<KrsPage />);

    await user.click(await screen.findByRole('button', { name: 'Simpan Draft' }));

    await vi.waitFor(() => expect(onDraft).toHaveBeenCalledTimes(1));
    expect(onDraft).toHaveBeenCalledWith({ classIds: [101] });
  });

  it('submit → konfirmasi dialog → POST /krs/submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    mockKrsRoutes({ onSubmit });
    render(<KrsPage />);

    await user.click(await screen.findByRole('button', { name: 'Submit KRS' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Submit KRS?');

    await user.click(screen.getByRole('button', { name: 'Ya, Submit' }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ classIds: [101] });
  });

  it('status submitted (terkunci) → checkbox & tombol edit nonaktif', async () => {
    mockKrsRoutes({
      my: {
        ...MY_DRAFT,
        status: 'submitted',
        isLocked: true,
        submittedAt: '2024-08-10T08:00:00Z',
        items: MY_DRAFT.items,
      },
    });
    render(<KrsPage />);

    expect(await screen.findByText('KRS terkunci — tidak dapat diubah lagi.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simpan Draft' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Submit KRS' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hapus' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Pilih Fisika Dasar' })).toBeDisabled();
  });

  it('status approved → tombol Download PDF KRS muncul', async () => {
    mockKrsRoutes({
      my: {
        ...MY_DRAFT,
        status: 'approved',
        isLocked: true,
        submittedAt: '2024-08-10T08:00:00Z',
        items: MY_DRAFT.items,
      },
    });
    render(<KrsPage />);

    expect(await screen.findByRole('button', { name: 'Download PDF' })).toBeInTheDocument();
  });

  it('status draft → tombol Download PDF TIDAK muncul (PDF hanya utk approved)', async () => {
    mockKrsRoutes({ my: MY_DRAFT });
    render(<KrsPage />);

    expect(await screen.findByText('Simpan Draft')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download PDF' })).not.toBeInTheDocument();
  });

  it('periode tutup → banner informasi, tanpa daftar matkul, tombol nonaktif', async () => {
    mockKrsRoutes({ period: { ...PERIOD, status: 'closed' }, available: [] });
    render(<KrsPage />);

    expect(await screen.findByText('Periode KRS sedang tutup.')).toBeInTheDocument();
    expect(
      screen.getByText('Pengisian KRS hanya dapat dilakukan saat periode KRS sedang buka.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Tidak ada kelas tersedia untuk prodi Anda pada periode ini.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simpan Draft' })).toBeDisabled();
  });

  it('error muat data → pesan error + tombol coba lagi', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    render(<KrsPage />);

    expect(await screen.findByText('Gagal memuat data KRS')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument();
  });

  it('keluhan #59 — pilih 2 kelas beda jadwal sama kode MK → error DUPLICATE_COURSE', async () => {
    const user = userEvent.setup();
    let draftCall: unknown = null;
    mockKrsRoutes({
      available: [
        cls({
          id: 1,
          classCode: 'A',
          course: { code: 'MAT1', name: 'Matematika Dasar', credits: 3 },
          dayOfWeek: 1,
          startTime: '08:00:00',
          endTime: '09:40:00',
          lecturerName: 'Dr. Andi',
        }),
        cls({
          id: 2,
          classCode: 'B',
          course: { code: 'MAT1', name: 'Matematika Dasar', credits: 3 },
          dayOfWeek: 3,
          startTime: '10:00:00',
          endTime: '11:40:00',
          lecturerName: 'Prof. Sari',
        }),
      ],
      my: { ...MY_DRAFT, items: [] },
      onDraft: (body) => {
        draftCall = body;
      },
      duplicateCourseError: true,
    });
    render(<KrsPage />);

    const cards = await screen.findAllByText(/Matematika Dasar/);
    expect(cards).toHaveLength(2);

    // Centang kedua kartu (kode MK sama MAT1)
    const checkboxes = screen.getAllByRole('checkbox', { name: 'Pilih Matematika Dasar' });
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);

    // Simpan draft → harus error DUPLICATE_COURSE
    await user.click(await screen.findByRole('button', { name: 'Simpan Draft' }));

    await vi.waitFor(() => expect(draftCall).toEqual({ classIds: [1, 2] }));
    // Backend seharusnya tolak → fetchMock akan return error response
    // Kita test bahwa error ditampilkan di UI
    expect(await screen.findByText(/Tidak boleh mengambil matkul yang sama/i)).toBeInTheDocument();
  });
});
