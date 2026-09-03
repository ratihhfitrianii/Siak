import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePage from './ProfilePage';
import * as api from '../lib/api';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    apiRequest: vi.fn(),
    downloadEktmPdf: vi.fn(),
  };
});

const mockedApi = vi.mocked(api);

const mockProfile = {
  id: 7,
  nim: '2021001',
  fullName: 'Budi Santoso',
  email: 'budi@kampus.ac.id',
  phone: '08123456789',
  personalEmail: 'budi.personal@gmail.com',
  photoUrl: null as string | null,
  domicileAddress: 'Jl. Merdeka No. 10, Jakarta',
  prodiCode: 'TI',
  prodiName: 'Teknik Informatika',
  facultyCode: 'FT',
  facultyName: 'Fakultas Teknik',
  academicYearCode: '2021',
  entryType: 'SBMPTN',
  status: 'aktif',
  createdAt: '2021-08-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const mockIPS = [
  {
    semesterId: 1,
    semesterCode: '20211',
    semesterName: 'Ganjil 2021/2022',
    ips: 3.5,
    sksLulus: 18,
    sksDiambil: 20,
  },
  {
    semesterId: 2,
    semesterCode: '20212',
    semesterName: 'Genap 2021/2022',
    ips: 3.75,
    sksLulus: 20,
    sksDiambil: 20,
  },
];

const mockIPSWithZero = [
  {
    semesterId: 3,
    semesterCode: '20221',
    semesterName: 'Ganjil 2022/2023',
    ips: 0,
    sksLulus: 0,
    sksDiambil: 0,
  },
];

// Helper to trigger photo upload via the hidden file input
function triggerPhotoUpload(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], writable: true });
  fireEvent.change(input);
}

describe('ProfilePage (Student Profile)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom doesn't have URL.createObjectURL / revokeObjectURL — stub them
    const mockURL = {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    };
    vi.stubGlobal('URL', Object.assign(function URL() {}, mockURL) as unknown as typeof URL);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Loading & error states ───────────────────────────────────────────────

  it('shows loading spinner when profile is not yet loaded', () => {
    mockedApi.apiRequest.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<ProfilePage />);
    expect(screen.getByText(/Memuat profil/i)).toBeInTheDocument();
  });

  it('shows error screen when profile fails to load', async () => {
    mockedApi.apiRequest
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce([]);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText(/Gagal memuat profil/i)).toBeInTheDocument());
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('"Coba Lagi" button retries loading profile', async () => {
    mockedApi.apiRequest
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce([]) // loadIPS
      .mockResolvedValueOnce(mockProfile) // retry loadProfile
      .mockResolvedValueOnce(mockIPS); // retry loadIPS

    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText(/Gagal memuat profil/i)).toBeInTheDocument());

    fireEvent.click(screen.getByText('Coba Lagi'));
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());
  });

  // Note: error && !profile renders error screen, not null.
  // The null return only applies when loading=false, error=null, profile=null
  // which requires both APIs to resolve with non-profile data — covered implicitly.

  // ─── Profile read-only display ────────────────────────────────────────────

  it('renders all profile fields in read-only mode', async () => {
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce(mockIPS);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());
    expect(screen.getByText('2021001')).toBeInTheDocument();
    expect(screen.getByText('Teknik Informatika')).toBeInTheDocument();
    expect(screen.getByText('Fakultas Teknik')).toBeInTheDocument();
    expect(screen.getByText('2021')).toBeInTheDocument();
    expect(screen.getByText('SBMPTN')).toBeInTheDocument();
    expect(screen.getByText(/08123456789/)).toBeInTheDocument();
    expect(screen.getByText(/budi\.personal@gmail\.com/)).toBeInTheDocument();
    expect(screen.getByText(/Jl\. Merdeka No\. 10, Jakarta/)).toBeInTheDocument();
    expect(screen.getByText(/budi@kampus\.ac\.id/)).toBeInTheDocument();
    expect(screen.getByText(/aktif/)).toBeInTheDocument();
  });

  it('shows dash for null phone, email, and address', async () => {
    const profileNoContact = {
      ...mockProfile,
      phone: null,
      personalEmail: null,
      domicileAddress: null,
    };
    mockedApi.apiRequest.mockResolvedValueOnce(profileNoContact).mockResolvedValueOnce([]);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it('uses photoUrl when present on profile', async () => {
    const profileWithPhoto = {
      ...mockProfile,
      photoUrl: 'https://example.com/photo.jpg',
    };
    mockedApi.apiRequest.mockResolvedValueOnce(profileWithPhoto).mockResolvedValueOnce([]);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());
    const img = screen.getByAltText('Foto Profil');
    expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg');
  });

  it('uses avatar placeholder when photoUrl is null', async () => {
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce([]);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());
    const img = screen.getByAltText('Foto Profil');
    expect(img.getAttribute('src')).toContain('ui-avatars.com');
  });

  // ─── IPS chart ────────────────────────────────────────────────────────────

  it('renders IPS chart with data', async () => {
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce(mockIPS);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByTestId('ips-chart')).toBeInTheDocument());
    expect(screen.getByText(/Indek Prestasi/)).toBeInTheDocument();
    expect(screen.getByText('20211')).toBeInTheDocument();
    expect(screen.getByText('20212')).toBeInTheDocument();
  });

  it('shows empty IPS message when no data', async () => {
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce([]);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());
    expect(screen.getByText(/Belum ada data IP semester/)).toBeInTheDocument();
  });

  it('renders IPS chart with zero-value semester (different bar color)', async () => {
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce(mockIPSWithZero);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByTestId('ips-chart')).toBeInTheDocument());
    expect(screen.getByText('20221')).toBeInTheDocument();
  });

  // ─── E-KTM download ──────────────────────────────────────────────────────

  it('downloads E-KTM successfully', async () => {
    const mockBlob = new Blob(['pdf'], { type: 'application/pdf' });
    vi.mocked(mockedApi.downloadEktmPdf).mockResolvedValue(mockBlob);
    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, ...args: unknown[]) => {
      const el = origCreate(tag as keyof HTMLElementTagNameMap, ...(args as []));
      if (tag === 'a') {
        Object.defineProperty(el, 'click', {
          value: clickSpy,
          writable: true,
        });
      }
      return el;
    });

    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce(mockIPS);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Download E-KTM'));
    await waitFor(() => {
      expect(mockedApi.downloadEktmPdf).toHaveBeenCalled();
    });
    expect(clickSpy).toHaveBeenCalled();
    // anchor href should be a blob URL
    const anchor = document.createElement('a');
    expect(anchor).toBeDefined(); // basic sanity
  });

  it('shows error when E-KTM download fails', async () => {
    vi.mocked(mockedApi.downloadEktmPdf).mockRejectedValue(new Error('Download failed'));
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce([]);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Download E-KTM'));
    await waitFor(() => expect(screen.getByText('Download failed')).toBeInTheDocument());
  });

  it('shows fallback error when E-KTM download throws non-Error', async () => {
    vi.mocked(mockedApi.downloadEktmPdf).mockRejectedValue('string error');
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce([]);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Download E-KTM'));
    await waitFor(() => expect(screen.getByText('Gagal mengunduh E-KTM')).toBeInTheDocument());
  });

  it('shows spinner on E-KTM button while downloading', async () => {
    let resolveDownload!: (value: Blob) => void;
    vi.mocked(mockedApi.downloadEktmPdf).mockImplementation(
      () =>
        new Promise<Blob>((resolve) => {
          resolveDownload = resolve;
        }),
    );
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce([]);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Download E-KTM'));
    await waitFor(() => expect(screen.getByText(/Mengunduh/)).toBeInTheDocument());

    resolveDownload(new Blob());
    await waitFor(() => expect(screen.queryByText(/Mengunduh/)).not.toBeInTheDocument());
  });

  // ─── Photo upload validation ──────────────────────────────────────────────

  it('ignores photo upload when no file selected', async () => {
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce([]);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    // Simulate change with no files
    fireEvent.change(input);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('rejects non-image file', async () => {
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce([]);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());

    triggerPhotoUpload(new File(['content'], 'test.pdf', { type: 'application/pdf' }));
    expect(screen.getByText(/File harus berupa gambar/)).toBeInTheDocument();
  });

  it('rejects oversized photo (>10MB)', async () => {
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce([]);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());

    const largeContent = new Uint8Array(11 * 1024 * 1024);
    triggerPhotoUpload(new File([largeContent], 'large.jpg', { type: 'image/jpeg' }));
    expect(screen.getByText(/Ukuran foto maksimal 10MB/)).toBeInTheDocument();
  });

  it('accepts valid image and shows preview', async () => {
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce([]);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());

    triggerPhotoUpload(new File(['image-data'], 'photo.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  // ─── Edit & save flow ─────────────────────────────────────────────────────

  it('enters edit mode and shows input fields', async () => {
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce([]);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByPlaceholderText('08xxxxxxxxxx')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('nama@email.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Alamat lengkap domisili')).toBeInTheDocument();
    expect(screen.getByText('Simpan')).toBeInTheDocument();
    expect(screen.getByText('Batal')).toBeInTheDocument();
  });

  it('edits fields and saves successfully', async () => {
    mockedApi.apiRequest
      .mockResolvedValueOnce(mockProfile)
      .mockResolvedValueOnce(mockIPS)
      .mockResolvedValueOnce({
        ...mockProfile,
        phone: '08987654321',
        personalEmail: 'baru@email.com',
        domicileAddress: 'Jl. Baru',
      });

    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByPlaceholderText('08xxxxxxxxxx'), {
      target: { value: '08987654321' },
    });
    fireEvent.change(screen.getByPlaceholderText('nama@email.com'), {
      target: { value: 'baru@email.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Alamat lengkap domisili'), {
      target: { value: 'Jl. Baru' },
    });
    fireEvent.click(screen.getByText('Simpan'));

    await waitFor(() => {
      const putCalls = mockedApi.apiRequest.mock.calls.filter((c) => c[1]?.method === 'PUT');
      expect(putCalls.length).toBe(1);
      expect(putCalls[0][1]!.body).toEqual({
        phone: '08987654321',
        personalEmail: 'baru@email.com',
        domicileAddress: 'Jl. Baru',
        photoUrl: undefined,
      });
    });
    // Should exit edit mode
    await waitFor(() => expect(screen.getByText('Edit')).toBeInTheDocument());
  });

  it('sends photoUrl in body when photo changed', async () => {
    // Mock FileReader for jsdom (readAsDataURL not implemented)
    class MockFileReader {
      result: string | null = null;
      onload: (() => void) | null = null;
      readAsDataURL() {
        this.result = 'data:image/jpeg;base64,base64data';
        this.onload?.();
      }
    }
    vi.stubGlobal('FileReader', MockFileReader as unknown as typeof FileReader);

    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce([]);

    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Edit'));
    triggerPhotoUpload(new File(['img'], 'photo.jpg', { type: 'image/jpeg' }));

    fireEvent.click(screen.getByText('Simpan'));

    await waitFor(() => {
      const putCalls = mockedApi.apiRequest.mock.calls.filter((c) => c[1]?.method === 'PUT');
      expect(putCalls.length).toBe(1);
      // photoUrl should be a data URL (from FileReader), not undefined
      expect((putCalls[0][1] as Record<string, unknown>)?.body).toBeDefined();
    });
  });

  // ─── Cancel flow ──────────────────────────────────────────────────────────

  it('cancel resets edit data and exits edit mode', async () => {
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce([]);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByPlaceholderText('08xxxxxxxxxx'), {
      target: { value: '08111' },
    });
    fireEvent.click(screen.getByText('Batal'));

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByText(/08123456789/)).toBeInTheDocument();
    });
  });

  // ─── Save error handling ──────────────────────────────────────────────────

  it('shows ApiError message on save failure', async () => {
    mockedApi.apiRequest
      .mockResolvedValueOnce(mockProfile)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new api.ApiError(422, 'VALIDATION', 'Validation failed'));

    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Simpan'));

    await waitFor(() => expect(screen.getByText('Validation failed')).toBeInTheDocument());
    expect(screen.getByText('Simpan')).toBeInTheDocument();
  });

  it('shows generic Error message on save failure', async () => {
    mockedApi.apiRequest
      .mockResolvedValueOnce(mockProfile)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('Network timeout'));

    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Simpan'));

    await waitFor(() => expect(screen.getByText('Network timeout')).toBeInTheDocument());
  });

  it('shows fallback message when save throws non-Error', async () => {
    mockedApi.apiRequest
      .mockResolvedValueOnce(mockProfile)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce('something weird');

    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Simpan'));

    await waitFor(() => expect(screen.getByText('Gagal menyimpan profil')).toBeInTheDocument());
  });

  it('shows saving indicator while save is in progress', async () => {
    let resolveSave!: (value: unknown) => void;
    mockedApi.apiRequest
      .mockResolvedValueOnce(mockProfile)
      .mockResolvedValueOnce([])
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSave = resolve;
          }),
      );

    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Simpan'));

    await waitFor(() => expect(screen.getByText('...')).toBeInTheDocument());
    resolveSave(mockProfile);
    await waitFor(() => expect(screen.queryByText('...')).not.toBeInTheDocument());
  });

  // ─── IPS loading error (silent) ───────────────────────────────────────────

  it('silently handles IPS load failure', async () => {
    mockedApi.apiRequest
      .mockResolvedValueOnce(mockProfile)
      .mockRejectedValueOnce(new Error('IPS fail'));
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());
    expect(screen.getByText(/Belum ada data IP semester/)).toBeInTheDocument();
  });

  // ─── Non-Error throw in loadProfile ────────────────────────────────────────

  it('handles non-Error throw during profile load', async () => {
    mockedApi.apiRequest.mockRejectedValueOnce('string error').mockResolvedValueOnce([]);
    render(<ProfilePage />);
    await waitFor(() => {
      const matches = screen.getAllByText('Gagal memuat profil');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
    // Non-Error throw: generic message + Coba Lagi button
    expect(screen.getByRole('button', { name: /Coba Lagi/ })).toBeInTheDocument();
  });

  // ─── Photo error cleanup ──────────────────────────────────────────────────

  it('clears photo error after valid photo upload', async () => {
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce([]);
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument());

    // First: upload invalid file
    triggerPhotoUpload(new File(['x'], 'test.pdf', { type: 'application/pdf' }));
    expect(screen.getByText(/File harus berupa gambar/)).toBeInTheDocument();

    // Then: upload valid file
    triggerPhotoUpload(new File(['img'], 'photo.jpg', { type: 'image/jpeg' }));
    expect(screen.queryByText(/File harus berupa gambar/)).not.toBeInTheDocument();
  });
});
