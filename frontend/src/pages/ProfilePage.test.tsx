import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePage from './ProfilePage';
import * as api from '../lib/api';

const mockCanvasContext = {
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fillText: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  setLineDash: vi.fn(),
  strokeStyle: '',
  lineWidth: 1,
  fillStyle: '',
  font: '',
  textAlign: '',
  lineCap: '',
  lineJoin: '',
};

HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockCanvasContext);

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
    expect(screen.getByText(/Profil Mahasiswa/i)).toBeInTheDocument();
  });

  it('menampilkan ringkasan IPK', async () => {
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce(mockIPS);

    render(<ProfilePage />);

    await waitFor(() => expect(screen.queryByText(/Memuat profil/i)).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByText(/3\.63/i).length).toBeGreaterThan(0));
    expect(screen.getByText(/IP Kumulatif \(IPK\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Total SKS Lulus/i)).toBeInTheDocument();
    expect(screen.getByText(/Semester Aktif/i)).toBeInTheDocument();
  });

  it('form dapat mengedit No. HP dan Email Pribadi', async () => {
    mockedApi.apiRequest
      .mockResolvedValueOnce(mockProfile)
      .mockResolvedValueOnce(mockIPS)
      .mockResolvedValueOnce({
        ...mockProfile,
        phone: '08987654321',
        personalEmail: 'baru@email.com',
      });

    render(<ProfilePage />);

    await waitFor(() => expect(screen.queryByText(/Memuat profil/i)).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByLabelText(/No\. HP/i)).toBeInTheDocument());

    const phoneInput = screen.getByLabelText(/No\. HP/i);
    const emailInput = screen.getByLabelText(/Email Pribadi/i);

    fireEvent.change(phoneInput, { target: { value: '08987654321' } });
    fireEvent.change(emailInput, { target: { value: 'baru@email.com' } });

    fireEvent.click(screen.getByRole('button', { name: /Simpan Perubahan/i }));

    await waitFor(() => {
      const putCalls = mockedApi.apiRequest.mock.calls.filter((call) => call[1]?.method === 'PUT');
      expect(putCalls.length).toBeGreaterThan(0);
    });
  });

  it('menampilkan grafik IP per semester', async () => {
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce(mockIPS);

    render(<ProfilePage />);

    await waitFor(() => expect(screen.queryByText(/Memuat profil/i)).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/Diagram Batang IP per Semester/i)).toBeInTheDocument());
    expect(screen.getByTestId('ips-chart')).toBeInTheDocument();
  });

  it('menampilkan pesan error jika gagal memuat profil', async () => {
    // loadProfile gagal, loadIPS ok
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
    await waitFor(() => expect(screen.getByLabelText(/No\. HP/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/No\. HP/i), { target: { value: '08999999999' } });
    expect(screen.getByLabelText(/No\. HP/i)).toHaveValue('08999999999');

    // Mock loadProfile dipanggil lagi saat Batal
    mockedApi.apiRequest.mockResolvedValueOnce(mockProfile);

    fireEvent.click(screen.getByRole('button', { name: /Batal/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/No\. HP/i)).toHaveValue('08123456789');
    });
  });
});
