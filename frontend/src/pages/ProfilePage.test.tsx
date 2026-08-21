import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePage from './ProfilePage';
import * as api from '../lib/api';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, apiRequest: vi.fn(), ApiError: actual.ApiError };
});

const mockedApi = vi.mocked(api);

const mockProfile = {
  id: 7,
  nim: '2021001',
  fullName: 'Budi Santoso',
  email: 'budi@kampus.ac.id',
  phone: '08123456789',
  personalEmail: 'budi.personal@gmail.com',
  photoUrl: null,
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

describe('ProfilePage (Student Profile)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('menampilkan loading state kemudian profil', async () => {
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce(mockIPS);

    render(<ProfilePage />);

    await waitFor(() => expect(screen.queryByText(/Memuat profil/i)).not.toBeInTheDocument());
    expect(screen.getByText('Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('2021001')).toBeInTheDocument();
  });

  it('menampilkan detail di bawah foto dan data kontak', async () => {
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce(mockIPS);

    render(<ProfilePage />);

    await waitFor(() => expect(screen.queryByText(/Memuat profil/i)).not.toBeInTheDocument());
    expect(screen.getByText('Teknik Informatika')).toBeInTheDocument();
    expect(screen.getByText('Fakultas Teknik')).toBeInTheDocument();
    expect(screen.getByText('SBMPTN')).toBeInTheDocument();
    expect(screen.getByText(/08123456789/)).toBeInTheDocument();
    expect(screen.getByText(/budi.personal@gmail.com/)).toBeInTheDocument();
    expect(screen.getByText(/Jl. Merdeka No. 10, Jakarta/)).toBeInTheDocument();
  });

  it('inline edit mengubah No. HP, Email, dan Alamat', async () => {
    mockedApi.apiRequest
      .mockResolvedValueOnce(mockProfile)
      .mockResolvedValueOnce(mockIPS)
      .mockResolvedValueOnce({
        ...mockProfile,
        phone: '08987654321',
        personalEmail: 'baru@email.com',
        domicileAddress: 'Jl. Baru No. 5',
      });

    render(<ProfilePage />);

    await waitFor(() => expect(screen.queryByText(/Memuat profil/i)).not.toBeInTheDocument());

    // Klik tombol Edit
    fireEvent.click(screen.getByText('Edit'));

    // Edit field
    const phoneInput = screen.getByPlaceholderText('08xxxxxxxxxx');
    const emailInput = screen.getByPlaceholderText('nama@email.com');
    const addressInput = screen.getByPlaceholderText('Alamat lengkap domisili');

    fireEvent.change(phoneInput, { target: { value: '08987654321' } });
    fireEvent.change(emailInput, { target: { value: 'baru@email.com' } });
    fireEvent.change(addressInput, { target: { value: 'Jl. Baru No. 5' } });

    // Simpan
    fireEvent.click(screen.getByText('Simpan'));

    await waitFor(() => {
      const putCalls = mockedApi.apiRequest.mock.calls.filter((call) => call[1]?.method === 'PUT');
      expect(putCalls.length).toBeGreaterThan(0);
    });
  });

  it('menampilkan grafik IP per semester', async () => {
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce(mockIPS);

    render(<ProfilePage />);

    await waitFor(() => expect(screen.queryByText(/Memuat profil/i)).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/Indek Prestasi \(IP\)/i)).toBeInTheDocument());
    expect(screen.getByTestId('ips-chart')).toBeInTheDocument();
  });

  it('menampilkan pesan error jika gagal memuat profil', async () => {
    mockedApi.apiRequest
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(mockIPS);

    render(<ProfilePage />);

    await waitFor(() => expect(screen.getByText(/Gagal memuat profil/i)).toBeInTheDocument());
  });

  it('tombol Batal mengembalikan data awal', async () => {
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce(mockIPS);

    render(<ProfilePage />);

    await waitFor(() => expect(screen.queryByText(/Memuat profil/i)).not.toBeInTheDocument());

    // Klik Edit
    fireEvent.click(screen.getByText('Edit'));

    // Ubah data
    const phoneInput = screen.getByPlaceholderText('08xxxxxxxxxx');
    fireEvent.change(phoneInput, { target: { value: '08999999999' } });
    expect(phoneInput).toHaveValue('08999999999');

    // Mock loadProfile dipanggil lagi saat Batal
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile);

    fireEvent.click(screen.getByText('Batal'));

    await waitFor(() => {
      expect(screen.getByText(/08123456789/)).toBeInTheDocument();
    });
  });
});
