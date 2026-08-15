import { useCallback, useEffect, useState } from 'react';
import {
  listFaculties,
  createFaculty,
  updateFaculty,
  deleteFaculty,
  listProdis,
  createProdi,
  updateProdi,
  deleteProdi,
} from '../lib/api';
import type { Faculty, Prodi, CreateFacultyInput, CreateProdiInput } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';

/** Halaman Master Data (Admin Sistem) — Fakultas & Prodi. */
export function AdminMasterPage() {
  const [activeTab, setActiveTab] = useState<'faculties' | 'prodis'>('faculties');
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [prodis, setProdis] = useState<Prodi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form Faculty
  const [facultyForm, setFacultyForm] = useState<CreateFacultyInput>({ code: '', name: '', isActive: true });
  const [editingFacultyId, setEditingFacultyId] = useState<number | null>(null);

  // Form Prodi
  const [prodiForm, setProdiForm] = useState<CreateProdiInput>({
    code: '',
    name: '',
    facultyCode: '',
    degree: 'S1',
    accreditation: '',
    isActive: true,
  });
  const [editingProdiId, setEditingProdiId] = useState<number | null>(null);

  const loadFaculties = useCallback(async () => {
    try {
      const data = await listFaculties();
      setFaculties(data);
    } catch {
      setError('Gagal memuat data fakultas');
    }
  }, []);

  const loadProdis = useCallback(async () => {
    try {
      const data = await listProdis();
      setProdis(data);
    } catch {
      setError('Gagal memuat data prodi');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([loadFaculties(), loadProdis()]).finally(() => setLoading(false));
  }, [loadFaculties, loadProdis]);

  // Faculty handlers
  const handleFacultySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      if (editingFacultyId) {
        await updateFaculty(editingFacultyId, facultyForm);
        setSuccess('Fakultas berhasil diupdate');
      } else {
        await createFaculty(facultyForm);
        setSuccess('Fakultas berhasil dibuat');
      }
      setFacultyForm({ code: '', name: '', isActive: true });
      setEditingFacultyId(null);
      await loadFaculties();
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      setError(apiError.message ?? 'Gagal menyimpan fakultas');
    }
  };

  const handleFacultyEdit = (f: Faculty) => {
    setFacultyForm({ code: f.code, name: f.name, isActive: f.isActive });
    setEditingFacultyId(f.id);
  };

  const handleFacultyDelete = async (id: number) => {
    if (!window.confirm('Nonaktifkan fakultas ini?')) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteFaculty(id);
      setSuccess('Fakultas dinonaktifkan');
      await loadFaculties();
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      setError(apiError.message ?? 'Gagal menonaktifkan fakultas');
    }
  };

  const handleFacultyCancel = () => {
    setFacultyForm({ code: '', name: '', isActive: true });
    setEditingFacultyId(null);
  };

  // Prodi handlers
  const handleProdiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const payload = { ...prodiForm, accreditation: prodiForm.accreditation || undefined };
      if (editingProdiId) {
        await updateProdi(editingProdiId, payload);
        setSuccess('Prodi berhasil diupdate');
      } else {
        await createProdi(payload);
        setSuccess('Prodi berhasil dibuat');
      }
      setProdiForm({ code: '', name: '', facultyCode: '', degree: 'S1', accreditation: '', isActive: true });
      setEditingProdiId(null);
      await loadProdis();
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      setError(apiError.message ?? 'Gagal menyimpan prodi');
    }
  };

  const handleProdiEdit = (p: Prodi) => {
    setProdiForm({
      code: p.code,
      name: p.name,
      facultyCode: p.facultyCode,
      degree: p.degree as CreateProdiInput['degree'],
      accreditation: p.accreditation ?? '',
      isActive: p.isActive,
    });
    setEditingProdiId(p.id);
  };

  const handleProdiDelete = async (id: number) => {
    if (!window.confirm('Nonaktifkan prodi ini?')) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteProdi(id);
      setSuccess('Prodi dinonaktifkan');
      await loadProdis();
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      setError(apiError.message ?? 'Gagal menonaktifkan prodi');
    }
  };

  const handleProdiCancel = () => {
    setProdiForm({ code: '', name: '', facultyCode: '', degree: 'S1', accreditation: '', isActive: true });
    setEditingProdiId(null);
  };

  if (loading) return <div className="p-6 text-center text-slate-500">Memuat data master...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Master Data</h2>
        <p className="text-slate-600">
          Kelola data master Fakultas dan Program Studi. Hanya Admin Sistem yang dapat mengakses halaman ini.
        </p>
      </div>

      {/* Tab navigation */}
      <div className="bg-white rounded-lg shadow-sm border-b">
        <nav className="flex -mb-px" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'faculties'}
            onClick={() => setActiveTab('faculties')}
            className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'faculties'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Fakultas
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'prodis'}
            onClick={() => setActiveTab('prodis')}
            className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'prodis'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Program Studi
          </button>
        </nav>
      </div>

      {error && <FormAlert>{error}</FormAlert>}
      {success && (
        <p role="status" className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          {success}
        </p>
      )}

      {/* Fakultas Tab */}
      {activeTab === 'faculties' && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-medium text-slate-900">Daftar Fakultas</h3>
            <button
              onClick={handleFacultyCancel}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
            >
              {editingFacultyId ? 'Batal Edit' : 'Tambah Fakultas'}
            </button>
          </div>

          {/* Form Fakultas */}
          <form onSubmit={handleFacultySubmit} className="mb-6 p-4 bg-slate-50 rounded-lg space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="faculty-code" className="block text-sm font-medium text-slate-700 mb-1">
                  Kode Fakultas *
                </label>
                <input
                  id="faculty-code"
                  type="text"
                  value={facultyForm.code}
                  onChange={(e) => setFacultyForm({ ...facultyForm, code: e.target.value.toUpperCase() })}
                  placeholder="Contoh: FT, FE, FH"
                  maxLength={10}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                  disabled={!!editingFacultyId}
                />
                {editingFacultyId && <p className="mt-1 text-xs text-slate-500">Kode tidak bisa diubah saat edit</p>}
              </div>
              <div>
                <label htmlFor="faculty-name" className="block text-sm font-medium text-slate-700 mb-1">
                  Nama Fakultas *
                </label>
                <input
                  id="faculty-name"
                  type="text"
                  value={facultyForm.name}
                  onChange={(e) => setFacultyForm({ ...facultyForm, name: e.target.value })}
                  placeholder="Contoh: Fakultas Teknik"
                  maxLength={100}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div className="flex items-end">
                <label htmlFor="faculty-active" className="flex items-center gap-2 cursor-pointer">
                  <input
                    id="faculty-active"
                    type="checkbox"
                    checked={facultyForm.isActive}
                    onChange={(e) => setFacultyForm({ ...facultyForm, isActive: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">Aktif</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
              >
                {editingFacultyId ? 'Update Fakultas' : 'Simpan Fakultas'}
              </button>
            </div>
          </form>

          {/* Table Fakultas */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="pb-2 font-medium">Kode</th>
                  <th className="pb-2 font-medium">Nama</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Dibuat</th>
                  <th className="pb-2 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {faculties.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      Belum ada data fakultas.
                    </td>
                  </tr>
                ) : (
                  faculties.map((f) => (
                    <tr key={f.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 font-mono text-slate-900">{f.code}</td>
                      <td className="py-3 text-slate-900">{f.name}</td>
                      <td className="py-3">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            f.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {f.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="py-3 text-slate-500">{f.createdAt.split('T')[0]}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleFacultyEdit(f)}
                            className="px-2 py-1 text-xs text-primary-600 hover:text-primary-700 underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleFacultyDelete(f.id)}
                            className="px-2 py-1 text-xs text-red-600 hover:text-red-700 underline"
                          >
                            Nonaktifkan
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Prodi Tab */}
      {activeTab === 'prodis' && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-medium text-slate-900">Daftar Program Studi</h3>
            <button
              onClick={handleProdiCancel}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
            >
              {editingProdiId ? 'Batal Edit' : 'Tambah Prodi'}
            </button>
          </div>

          {/* Form Prodi */}
          <form onSubmit={handleProdiSubmit} className="mb-6 p-4 bg-slate-50 rounded-lg space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label htmlFor="prodi-code" className="block text-sm font-medium text-slate-700 mb-1">
                  Kode Prodi *
                </label>
                <input
                  id="prodi-code"
                  type="text"
                  value={prodiForm.code}
                  onChange={(e) => setProdiForm({ ...prodiForm, code: e.target.value.toUpperCase() })}
                  placeholder="Contoh: TI, SI, TK"
                  maxLength={10}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                  disabled={!!editingProdiId}
                />
                {editingProdiId && <p className="mt-1 text-xs text-slate-500">Kode tidak bisa diubah saat edit</p>}
              </div>
              <div>
                <label htmlFor="prodi-name" className="block text-sm font-medium text-slate-700 mb-1">
                  Nama Prodi *
                </label>
                <input
                  id="prodi-name"
                  type="text"
                  value={prodiForm.name}
                  onChange={(e) => setProdiForm({ ...prodiForm, name: e.target.value })}
                  placeholder="Contoh: Teknik Informatika"
                  maxLength={100}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="prodi-faculty" className="block text-sm font-medium text-slate-700 mb-1">
                  Fakultas *
                </label>
                <select
                  id="prodi-faculty"
                  value={prodiForm.facultyCode}
                  onChange={(e) => setProdiForm({ ...prodiForm, facultyCode: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                >
                  <option value="">Pilih Fakultas</option>
                  {faculties.filter((f) => f.isActive).map((f) => (
                    <option key={f.code} value={f.code}>
                      {f.code} - {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="prodi-degree" className="block text-sm font-medium text-slate-700 mb-1">
                  Jenjang *
                </label>
                <select
                  id="prodi-degree"
                  value={prodiForm.degree}
                  onChange={(e) => setProdiForm({ ...prodiForm, degree: e.target.value as CreateProdiInput['degree'] })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                >
                  <option value="S1">S1</option>
                  <option value="S2">S2</option>
                  <option value="S3">S3</option>
                  <option value="D3">D3</option>
                  <option value="D4">D4</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label htmlFor="prodi-accreditation" className="block text-sm font-medium text-slate-700 mb-1">
                  Akrreditasi
                </label>
                <input
                  id="prodi-accreditation"
                  type="text"
                  value={prodiForm.accreditation}
                  onChange={(e) => setProdiForm({ ...prodiForm, accreditation: e.target.value })}
                  placeholder="Contoh: A, B, Unggul"
                  maxLength={20}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="flex items-end">
                <label htmlFor="prodi-active" className="flex items-center gap-2 cursor-pointer">
                  <input
                    id="prodi-active"
                    type="checkbox"
                    checked={prodiForm.isActive}
                    onChange={(e) => setProdiForm({ ...prodiForm, isActive: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">Aktif</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
              >
                {editingProdiId ? 'Update Prodi' : 'Simpan Prodi'}
              </button>
            </div>
          </form>

          {/* Table Prodi */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="pb-2 font-medium">Kode</th>
                  <th className="pb-2 font-medium">Nama</th>
                  <th className="pb-2 font-medium">Fakultas</th>
                  <th className="pb-2 font-medium">Jenjang</th>
                  <th className="pb-2 font-medium">Akr.</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {prodis.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Belum ada data program studi.
                    </td>
                  </tr>
                ) : (
                  prodis.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 font-mono text-slate-900">{p.code}</td>
                      <td className="py-3 text-slate-900">{p.name}</td>
                      <td className="py-3 text-slate-700">{p.facultyCode} - {p.facultyName}</td>
                      <td className="py-3">
                        <span className="inline-flex px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded">
                          {p.degree}
                        </span>
                      </td>
                      <td className="py-3 text-slate-600">{p.accreditation ?? '-'}</td>
                      <td className="py-3">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            p.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {p.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleProdiEdit(p)}
                            className="px-2 py-1 text-xs text-primary-600 hover:text-primary-700 underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleProdiDelete(p.id)}
                            className="px-2 py-1 text-xs text-red-600 hover:text-red-700 underline"
                          >
                            Nonaktifkan
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}