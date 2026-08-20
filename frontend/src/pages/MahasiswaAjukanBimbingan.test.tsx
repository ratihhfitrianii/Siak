import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MahasiswaAjukanBimbingan } from './MahasiswaAjukanBimbingan';

vi.setConfig({ testTimeout: 20_000 });

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const SUPERVISORS = [
  { id: 10, fullName: 'Dr. Siti Aminah', nidn: '0010011234', nik: '123456', prodiName: 'TI' },
  { id: 11, fullName: 'Prof. Budi Hartono', nidn: '0010021234', nik: '123457', prodiName: 'TI' },
];

const PROPOSALS = [
  {
    id: 1,
    studentId: 100,
    supervisorId: 10,
    nim: '2023110001',
    studentName: 'Andi Pratama',
    studentEmail: 'andi@example.id',
    supervisorName: 'Dr. Siti Aminah',
    supervisorEmail: 'siti@example.id',
    prodiName: 'Teknik Informatika',
    title: 'Analisis Sistem Informasi Manajemen Keuangan Universitas',
    proposalFile: 'data:application/pdf;base64,JVBERi0x',
    status: 'diajukan',
    statusNotes: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: '2026-07-01T10:00:00Z',
    updatedAt: '2026-07-01T10:00:00Z',
  },
];

describe('MahasiswaAjukanBimbingan', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    // Mock FileReader so readAsDataURL resolves synchronously
    class MockFileReader {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(_file: Blob) {
        this.result = 'data:application/pdf;base64,dGVzdA==';
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('FileReader', MockFileReader as unknown as typeof FileReader);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/skripsi/supervisors')) {
        return Promise.resolve(jsonResponse({ success: true, data: SUPERVISORS }));
      }
      if (u.includes('/skripsi/proposals?limit=100')) {
        return Promise.resolve(jsonResponse({ success: true, data: PROPOSALS }));
      }
      return Promise.resolve(jsonResponse({ success: true, data: [] }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('render — header + form + existing proposals', async () => {
    render(
      <MemoryRouter>
        <MahasiswaAjukanBimbingan />
      </MemoryRouter>,
    );
    expect(screen.getByText('Ajukan Bimbingan Skripsi')).toBeInTheDocument();
    // Form fields - search input instead of select
    expect(screen.getByPlaceholderText(/Contoh: Analisis/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Cari nama\/NIDN dosen/)).toBeInTheDocument();
    expect(screen.getByText('Ajukan Proposal')).toBeInTheDocument();
    // Existing proposals loaded
    expect(
      await screen.findByText('Analisis Sistem Informasi Manajemen Keuangan Universitas'),
    ).toBeInTheDocument();
    expect(screen.getByText('Diajukan')).toBeInTheDocument();
    expect(screen.getAllByText(/Dr\. Siti Aminah/).length).toBeGreaterThanOrEqual(1);
  });

  it('submit — validasi file proposal belum diupload', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MahasiswaAjukanBimbingan />
      </MemoryRouter>,
    );
    // Wait for supervisors to load
    await waitFor(() => {
      expect(screen.getAllByText(/Dr\. Siti Aminah/).length).toBeGreaterThanOrEqual(1);
    });

    // Fill valid title (10+ chars)
    await user.type(screen.getByPlaceholderText(/Contoh: Analisis/), 'Judul proposal yang valid');
    // Select supervisor via checkbox
    const checkbox = screen.getByLabelText(/Dr\. Siti Aminah/);
    await user.click(checkbox);
    // No file selected
    await user.click(screen.getByText('Ajukan Proposal'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Upload file proposal (PDF) terlebih dahulu',
    );
  });

  it('submit — validasi supervisor tidak dipilih', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MahasiswaAjukanBimbingan />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByText(/Dr\. Siti Aminah/).length).toBeGreaterThanOrEqual(1);
    });

    // Fill valid title (10+ chars)
    await user.type(screen.getByPlaceholderText(/Contoh: Analisis/), 'Judul proposal yang valid');
    // Don't select supervisor
    await user.click(screen.getByText('Ajukan Proposal'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Pilih minimal 1 dosen pembimbing',
    );
  });

  it('submit success — POST proposal + reset form', async () => {
    const user = userEvent.setup();
    let postBody: unknown = null;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST' && u.endsWith('/skripsi/proposals')) {
        postBody = JSON.parse(String(init.body));
        return Promise.resolve(
          jsonResponse({ success: true, data: { id: 2, message: 'Proposal berhasil' } }),
        );
      }
      if (u.includes('/skripsi/supervisors')) {
        return Promise.resolve(jsonResponse({ success: true, data: SUPERVISORS }));
      }
      if (u.includes('/skripsi/proposals')) {
        return Promise.resolve(jsonResponse({ success: true, data: [] }));
      }
      return Promise.resolve(jsonResponse({ success: true, data: [] }));
    });
    render(
      <MemoryRouter>
        <MahasiswaAjukanBimbingan />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByText(/Dr\. Siti Aminah/).length).toBeGreaterThanOrEqual(1);
    });

    // Fill title
    await user.type(screen.getByPlaceholderText(/Contoh: Analisis/), 'Judul proposal yang valid');
    // Select supervisor via checkbox
    const checkbox = screen.getByLabelText(/Dr\. Siti Aminah/);
    await user.click(checkbox);

    // Simulate file upload using fireEvent
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['test pdf content'], 'proposal.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await user.click(screen.getByText('Ajukan Proposal'));
    expect(await screen.findByRole('status')).toHaveTextContent('Proposal berhasil diajukan!');
    expect(postBody).toMatchObject({
      title: 'Judul proposal yang valid',
      supervisorIds: [10],
    });
    expect((postBody as { proposalFile?: string }).proposalFile).toContain('data:');
  });

  it('empty state — no proposals', async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/skripsi/supervisors')) {
        return Promise.resolve(jsonResponse({ success: true, data: SUPERVISORS }));
      }
      if (u.includes('/skripsi/proposals')) {
        return Promise.resolve(jsonResponse({ success: true, data: [] }));
      }
      return Promise.resolve(jsonResponse({ success: true, data: [] }));
    });
    render(
      <MemoryRouter>
        <MahasiswaAjukanBimbingan />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Belum ada proposal skripsi')).toBeInTheDocument();
    expect(screen.getByText(/Ajukan proposal pertama Anda/)).toBeInTheDocument();
  });

  it('file upload — shows file name confirmation', async () => {
    render(
      <MemoryRouter>
        <MahasiswaAjukanBimbingan />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByText(/Dr\. Siti Aminah/).length).toBeGreaterThanOrEqual(1);
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['pdf content'], 'my-proposal.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByText(/my-proposal\.pdf/)).toBeInTheDocument();
  });

  it('file upload — rejects non-PDF', async () => {
    render(
      <MemoryRouter>
        <MahasiswaAjukanBimbingan />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByText(/Dr\. Siti Aminah/).length).toBeGreaterThanOrEqual(1);
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['content'], 'doc.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByRole('alert')).toHaveTextContent('File harus berformat PDF');
  });

  it('expand proposal — shows status history', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/skripsi/supervisors')) {
        return Promise.resolve(jsonResponse({ success: true, data: SUPERVISORS }));
      }
      if (u.includes('/skripsi/proposals?limit=100')) {
        return Promise.resolve(jsonResponse({ success: true, data: PROPOSALS }));
      }
      if (u.includes('/skripsi/proposals/1/statuses')) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: [
              {
                id: 101,
                proposalId: 1,
                status: 'draft',
                notes: null,
                changedBy: 100,
                changedByName: 'Andi Pratama',
                changedAt: '2026-07-01T09:00:00Z',
              },
              {
                id: 102,
                proposalId: 1,
                status: 'diajukan',
                notes: null,
                changedBy: 100,
                changedByName: 'Andi Pratama',
                changedAt: '2026-07-01T10:00:00Z',
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({ success: true, data: [] }));
    });
    render(
      <MemoryRouter>
        <MahasiswaAjukanBimbingan />
      </MemoryRouter>,
    );
    // Wait for proposals to load
    await screen.findByText('Analisis Sistem Informasi Manajemen Keuangan Universitas');

    // Click chevron to expand — click the title
    const title = screen.getByText('Analisis Sistem Informasi Manajemen Keuangan Universitas');
    await user.click(title.closest('button')!);

    // Status history visible
    expect(await screen.findByText('Draft')).toBeInTheDocument();
  });

  it('load error — shows error alert', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: { code: 'INTERNAL', message: 'Server error' } }, 500),
    );
    render(
      <MemoryRouter>
        <MahasiswaAjukanBimbingan />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Gagal memuat data bimbingan skripsi',
    );
  });
});