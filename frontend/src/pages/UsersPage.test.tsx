import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersPage } from './UsersPage';

// userEvent + coverage instrumentation lambat → timeout default 5s sering kebentur
// (flaky pre-existing saat full suite; standalone selalu pass). Naikkan per-file.
vi.setConfig({ testTimeout: 20_000 });

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const SNAKE_USER = (id: number, name: string, email: string, roleCode: string) => ({
  id,
  email,
  full_name: name,
  is_wali: false,
  is_active: true,
  last_login_at: null,
  created_at: '2026-01-01T00:00:00Z',
  role_code: roleCode,
  role_name: roleCode.replace('_', ' '),
});

interface UsersMocks {
  items?: ReturnType<typeof SNAKE_USER>[];
  total?: number;
  onCreate?: (body: unknown) => void;
  onRole?: (body: unknown) => void;
  onDelete?: (id: number) => void;
  failCreate?: boolean;
  /** default true — NIM/NIK '22051001' ditemukan di master data */
  lookupFound?: boolean;
}

function mockUsersRoutes({
  items = [
    SNAKE_USER(1, 'Andi', 'andi@kampus.ac.id', 'mahasiswa'),
    SNAKE_USER(2, 'Bu Rina', 'rina@kampus.ac.id', 'dosen'),
  ],
  total = 2,
  onCreate,
  onRole,
  onDelete,
  failCreate = false,
  lookupFound = true,
}: UsersMocks = {}) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const u = String(url);
    if (method === 'GET' && u.includes('/users/lookup')) {
      if (!lookupFound) {
        return Promise.resolve(jsonResponse({ success: true, data: { found: false } }));
      }
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            found: true,
            userId: 11,
            nim: '22051001',
            nik: null,
            fullName: 'Andi',
            email: 'andi@kampus.ac.id',
            isActive: true,
            mustChangePassword: true,
            prodiCode: 'TI',
            prodiName: 'Teknik Informatika',
          },
        }),
      );
    }
    if (method === 'DELETE' && u.includes('/users/')) {
      const id = Number(u.split('/users/')[1]);
      onDelete?.(id);
      return Promise.resolve(
        jsonResponse({ success: true, data: { message: 'User dinonaktifkan' } }),
      );
    }
    if (method === 'POST' && u.includes('/users') && !u.includes('/role')) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      onCreate?.(body);
      if (failCreate) {
        return Promise.resolve(
          jsonResponse(
            {
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Data user tidak valid',
                details: { fields: { email: ['Email sudah digunakan'] } },
              },
            },
            409,
          ),
        );
      }
      const isNimNik = typeof body.nim === 'string' || typeof body.nik === 'string';
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            id: 99,
            email: isNimNik ? 'andi@kampus.ac.id' : String(body.email),
            full_name: isNimNik ? 'Andi' : 'User Baru',
            is_wali: false,
            created_at: '2026-08-03T00:00:00Z',
            message: isNimNik
              ? 'Akun Andi diaktifkan — password awal = NIM'
              : 'User berhasil dibuat',
          },
        }),
      );
    }
    if (method === 'PUT' && u.includes('/role')) {
      onRole?.(JSON.parse(String(init?.body)));
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            id: 2,
            email: 'rina@kampus.ac.id',
            full_name: 'Bu Rina',
            is_wali: false,
            role: 'admin_akademik',
            message: 'Role berhasil diperbarui',
          },
        }),
      );
    }
    if (u.includes('/users?')) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: { items, pagination: { page: 1, limit: 20, total } },
        }),
      );
    }
    return Promise.resolve(jsonResponse({ success: true, data: null }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('UsersPage (T1.11c)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('menampilkan daftar pengguna dengan peran', async () => {
    mockUsersRoutes();
    render(<UsersPage />);

    expect(await screen.findByText('+ Buat User')).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(screen.getByText('Andi')).toBeInTheDocument();
    });
    expect(screen.getByText('Andi')).toBeInTheDocument();
    expect(screen.getByText('andi@kampus.ac.id')).toBeInTheDocument();
    expect(screen.getByText('Bu Rina')).toBeInTheDocument();
    // badge peran (ada juga <option> filter dengan label sama → gunakan kuantitas)
    expect(screen.getAllByText('Mahasiswa').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Dosen').length).toBeGreaterThanOrEqual(1);
  });

  it('buat user mahasiswa: cukup NIM → lookup → preview readonly → POST {roleCode, nim}', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    mockUsersRoutes({ onCreate });
    render(<UsersPage />);

    await screen.findByText('Andi');
    await user.click(screen.getByRole('button', { name: '+ Buat User' }));

    const dialog = await screen.findByRole('dialog', { name: 'Buat user' });
    await user.type(within(dialog).getByLabelText('NIM'), '22051001');

    // Kolom lain auto-fill + readonly dari lookup master data
    expect(await within(dialog).findByDisplayValue('Andi')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('andi@kampus.ac.id')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('Teknik Informatika')).toBeInTheDocument();
    // catatan password awal (teks terpecah <strong>NIM</strong> — cocokkan substring utuh)
    expect(within(dialog).getByText(/wajib diganti saat login pertama/)).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('Andi')).toHaveAttribute('readonly');
    expect(within(dialog).getByDisplayValue('andi@kampus.ac.id')).toHaveAttribute('readonly');

    await user.click(within(dialog).getByRole('button', { name: 'Buat User' }));

    await vi.waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith({ roleCode: 'mahasiswa', nim: '22051001' });
    expect(
      await screen.findByText('Akun Andi diaktifkan — password awal = NIM'),
    ).toBeInTheDocument();
  });

  it('NIM tidak terdaftar di master data → hint merah + tombol submit nonaktif', async () => {
    const user = userEvent.setup();
    mockUsersRoutes({ lookupFound: false });
    render(<UsersPage />);

    await screen.findByText('Andi');
    await user.click(screen.getByRole('button', { name: '+ Buat User' }));

    const dialog = await screen.findByRole('dialog', { name: 'Buat user' });
    await user.type(within(dialog).getByLabelText('NIM'), '9999999');

    expect(
      await within(dialog).findByText(/NIM tidak ditemukan di data mahasiswa/),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Buat User' })).toBeDisabled();
  });

  it('peran admin (tanpa NIM/NIK): form manual → POST lengkap → sukses', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    mockUsersRoutes({ onCreate });
    render(<UsersPage />);

    await screen.findByText('Andi');
    await user.click(screen.getByRole('button', { name: '+ Buat User' }));

    const dialog = await screen.findByRole('dialog', { name: 'Buat user' });
    await user.selectOptions(within(dialog).getByLabelText('Peran'), 'admin_akademik');
    await user.type(within(dialog).getByLabelText('Nama Lengkap'), 'Admin Baru');
    await user.type(within(dialog).getByLabelText('Email'), 'admin.baru@kampus.ac.id');
    await user.type(within(dialog).getByLabelText('Password Awal'), 'rahasia123');
    await user.click(within(dialog).getByRole('button', { name: 'Buat User' }));

    await vi.waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith({
      roleCode: 'admin_akademik',
      email: 'admin.baru@kampus.ac.id',
      password: 'rahasia123',
      fullName: 'Admin Baru',
      isWali: false,
    });
    expect(await screen.findByText('User berhasil dibuat')).toBeInTheDocument();
  });

  it('create gagal (duplikat email, peran admin) → error inline di field email', async () => {
    const user = userEvent.setup();
    mockUsersRoutes({ failCreate: true });
    render(<UsersPage />);

    await screen.findByText('Andi');
    await user.click(screen.getByRole('button', { name: '+ Buat User' }));
    const dialog = await screen.findByRole('dialog', { name: 'Buat user' });
    await user.selectOptions(within(dialog).getByLabelText('Peran'), 'admin_akademik');
    await user.type(within(dialog).getByLabelText('Nama Lengkap'), 'User Baru');
    await user.type(within(dialog).getByLabelText('Email'), 'andi@kampus.ac.id');
    await user.type(within(dialog).getByLabelText('Password Awal'), 'rahasia123');
    await user.click(within(dialog).getByRole('button', { name: 'Buat User' }));

    expect(await screen.findByText('Email sudah digunakan')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('ubah peran → modal → PUT /users/:id/role dengan payload → sukses', async () => {
    const user = userEvent.setup();
    const onRole = vi.fn();
    mockUsersRoutes({ onRole });
    render(<UsersPage />);

    await screen.findByText('Bu Rina');
    const editButtons = screen.getAllByRole('button', { name: 'Ubah Peran' });
    await user.click(editButtons[1]); // Bu Rina (dosen)

    const dialog = await screen.findByRole('dialog', { name: 'Ubah peran' });
    expect(within(dialog).getByText('Bu Rina · rina@kampus.ac.id')).toBeInTheDocument();
    const roleSelect = within(dialog).getByLabelText('Peran Baru');
    await user.selectOptions(roleSelect, 'admin_akademik');
    await user.click(within(dialog).getByRole('button', { name: 'Simpan Perubahan' }));

    await vi.waitFor(() => expect(onRole).toHaveBeenCalledTimes(1));
    expect(onRole).toHaveBeenCalledWith({ roleCode: 'admin_akademik', isWali: false });
    expect(
      await screen.findByText('Role rina@kampus.ac.id diperbarui menjadi Admin Akademik.'),
    ).toBeInTheDocument();
  });

  it('hapus user → confirm → DELETE /users/:id → sukses + reload (keluhan lama)', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockUsersRoutes({ onDelete });
    render(<UsersPage />);

    await screen.findByText('Andi');
    await user.click(screen.getAllByRole('button', { name: 'Hapus' })[0]); // Andi (mahasiswa)

    await vi.waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(onDelete).toHaveBeenCalledWith(1);
    expect(await screen.findByText('User dinonaktifkan')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('hapus user dibatalkan (confirm false) → tidak ada DELETE', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockUsersRoutes({ onDelete });
    render(<UsersPage />);

    await screen.findByText('Andi');
    await user.click(screen.getAllByRole('button', { name: 'Hapus' })[0]);

    expect(onDelete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('filter peran → GET /users dengan query role', async () => {
    const user = userEvent.setup();
    const fetchMock = mockUsersRoutes();
    render(<UsersPage />);

    await screen.findByText('Andi');
    await user.selectOptions(screen.getByLabelText('Filter peran'), 'dosen');

    await vi.waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('/users?') && u.includes('role=dosen'))).toBe(true);
    });
  });

  it('daftar kosong → pesan tidak ada pengguna', async () => {
    mockUsersRoutes({ items: [], total: 0 });
    render(<UsersPage />);

    expect(await screen.findByText('Tidak ada pengguna yang cocok.')).toBeInTheDocument();
  });

  it('lookup error → tampilkan pesan error di form NIM', async () => {
    const user = userEvent.setup();
    mockUsersRoutes({
      lookupFound: false, // akan trigger 'notfound' status
    });
    render(<UsersPage />);

    await screen.findByText('Andi');
    await user.click(screen.getByRole('button', { name: '+ Buat User' }));

    const dialog = await screen.findByRole('dialog', { name: 'Buat user' });
    await user.type(within(dialog).getByLabelText('NIM'), '9999999');

    expect(
      await within(dialog).findByText(/NIM tidak ditemukan di data mahasiswa/),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Buat User' })).toBeDisabled();
  });

  it('peran admin tanpa NIM/NIK → form manual dengan fullName, email, password', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    mockUsersRoutes({ onCreate });
    render(<UsersPage />);

    await screen.findByText('Andi');
    await user.click(screen.getByRole('button', { name: '+ Buat User' }));

    const dialog = await screen.findByRole('dialog', { name: 'Buat user' });
    await user.selectOptions(within(dialog).getByLabelText('Peran'), 'admin_akademik');

    // NIM/NIK field harus hidden/disabled untuk admin roles
    expect(within(dialog).queryByLabelText('NIM')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('NIK')).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Nama Lengkap'), 'Admin Baru');
    await user.type(within(dialog).getByLabelText('Email'), 'admin.baru@kampus.ac.id');
    await user.type(within(dialog).getByLabelText('Password Awal'), 'rahasia123');
    await user.click(within(dialog).getByRole('button', { name: 'Buat User' }));

    await vi.waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith({
      roleCode: 'admin_akademik',
      email: 'admin.baru@kampus.ac.id',
      password: 'rahasia123',
      fullName: 'Admin Baru',
      isWali: false,
    });
    expect(await screen.findByText('User berhasil dibuat')).toBeInTheDocument();
  });

  it('create gagal duplikat email → error inline di field email', async () => {
    const user = userEvent.setup();
    mockUsersRoutes({ failCreate: true });
    render(<UsersPage />);

    await screen.findByText('Andi');
    await user.click(screen.getByRole('button', { name: '+ Buat User' }));
    const dialog = await screen.findByRole('dialog', { name: 'Buat user' });
    await user.selectOptions(within(dialog).getByLabelText('Peran'), 'admin_akademik');
    await user.type(within(dialog).getByLabelText('Nama Lengkap'), 'User Baru');
    await user.type(within(dialog).getByLabelText('Email'), 'andi@kampus.ac.id');
    await user.type(within(dialog).getByLabelText('Password Awal'), 'rahasia123');
    await user.click(within(dialog).getByRole('button', { name: 'Buat User' }));

    expect(await screen.findByText('Email sudah digunakan')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('ubah peran → modal → PUT /users/:id/role dengan payload → sukses', async () => {
    const user = userEvent.setup();
    const onRole = vi.fn();
    mockUsersRoutes({ onRole });
    render(<UsersPage />);

    await screen.findByText('Bu Rina');
    const editButtons = screen.getAllByRole('button', { name: 'Ubah Peran' });
    await user.click(editButtons[1]); // Bu Rina (dosen)

    const dialog = await screen.findByRole('dialog', { name: 'Ubah peran' });
    expect(within(dialog).getByText('Bu Rina · rina@kampus.ac.id')).toBeInTheDocument();
    const roleSelect = within(dialog).getByLabelText('Peran Baru');
    await user.selectOptions(roleSelect, 'admin_akademik');
    await user.click(within(dialog).getByRole('button', { name: 'Simpan Perubahan' }));

    await vi.waitFor(() => expect(onRole).toHaveBeenCalledTimes(1));
    expect(onRole).toHaveBeenCalledWith({ roleCode: 'admin_akademik', isWali: false });
    expect(
      await screen.findByText('Role rina@kampus.ac.id diperbarui menjadi Admin Akademik.'),
    ).toBeInTheDocument();
  });

  it('ubah peran wali dosen → checkbox isWali muncul dan dikirim', async () => {
    const user = userEvent.setup();
    const onRole = vi.fn();
    mockUsersRoutes({
      items: [
        {
          id: 3,
          email: 'wali@kampus.ac.id',
          full_name: 'Pak Wali',
          is_wali: false,
          role_code: 'dosen',
          role_name: 'Dosen',
          is_active: true,
          last_login_at: null,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      onRole,
    });
    render(<UsersPage />);

    await screen.findByText('Pak Wali');
    const editButtons = screen.getAllByRole('button', { name: 'Ubah Peran' });
    await user.click(editButtons[0]);

    const dialog = await screen.findByRole('dialog', { name: 'Ubah peran' });
    const waliCheckbox = within(dialog).getByLabelText('Dosen Wali');
    await user.click(waliCheckbox);

    await user.click(within(dialog).getByRole('button', { name: 'Simpan Perubahan' }));

    await vi.waitFor(() => expect(onRole).toHaveBeenCalledTimes(1));
    expect(onRole).toHaveBeenCalledWith({ roleCode: 'dosen', isWali: true });
  });

  it('hapus user → confirm → DELETE /users/:id → sukses + reload', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockUsersRoutes({ onDelete });
    render(<UsersPage />);

    await screen.findByText('Andi');
    await user.click(screen.getAllByRole('button', { name: 'Hapus' })[0]); // Andi (mahasiswa)

    await vi.waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(onDelete).toHaveBeenCalledWith(1);
    expect(await screen.findByText('User dinonaktifkan')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });
});
