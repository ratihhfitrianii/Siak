import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../lib/api';

interface StudentProfile {
  id: number;
  nim: string;
  fullName: string;
  email: string;
  phone: string | null;
  personalEmail: string | null;
  photoUrl: string | null;
  domicileAddress: string | null;
  prodiCode: string;
  prodiName: string;
  facultyCode: string;
  facultyName: string;
  academicYearCode: string;
  entryType: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface SemesterIPS {
  semesterId: number;
  semesterCode: string;
  semesterName: string;
  ips: number;
  sksLulus: number;
  sksDiambil: number;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [ipsData, setIpsData] = useState<SemesterIPS[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({
    phone: '',
    personalEmail: '',
    domicileAddress: '',
  });

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<StudentProfile>('/students/me');
      setProfile(data);
      if (data.photoUrl) setPhotoPreview(data.photoUrl);
      setEditData({
        phone: data.phone || '',
        personalEmail: data.personalEmail || '',
        domicileAddress: data.domicileAddress || '',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Gagal memuat profil';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadIPS = useCallback(async () => {
    try {
      const data = await apiRequest<SemesterIPS[]>('/students/me/ips');
      setIpsData(data);
    } catch {
      // IPS data is optional
    }
  }, []);

  useEffect(() => {
    loadProfile();
    loadIPS();
  }, [loadProfile, loadIPS]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const res = await apiRequest<StudentProfile>('/students/me', {
        method: 'PUT',
        body: JSON.stringify({
          phone: editData.phone || null,
          personalEmail: editData.personalEmail || null,
          domicileAddress: editData.domicileAddress || null,
          photoUrl: photoPreview !== profile.photoUrl ? photoPreview : undefined,
        }),
      });
      setProfile({ ...profile, ...res });
      setEditing(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan';
      console.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (profile) {
      setEditData({
        phone: profile.phone || '',
        personalEmail: profile.personalEmail || '',
        domicileAddress: profile.domicileAddress || '',
      });
      setPhotoPreview(profile.photoUrl ?? null);
    }
    setEditing(false);
  };

  if (loading && !profile) {
    return (
      <div className="p-8 text-center text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4" />
        Memuat profil...
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="p-8 text-center text-red-600">
        <p className="font-medium mb-2">Gagal memuat profil</p>
        <p className="text-sm">{error}</p>
        <button
          onClick={loadProfile}
          className="mt-4 px-4 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Profil Mahasiswa</h1>
          <p className="text-slate-500 mt-1">
            Kelola informasi profil dan lihat riwayat IP per semester
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Photo & Info Card */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            {/* Photo */}
            <div className="text-center mb-4">
              <div className="relative inline-block">
                <img
                  src={
                    photoPreview ||
                    'https://ui-avatars.com/api/?name=' +
                      encodeURIComponent(profile.fullName) +
                      '&background=random&size=150'
                  }
                  alt="Foto Profil"
                  className="w-32 h-32 rounded-full object-cover border-4 border-slate-200"
                />
                <label
                  htmlFor="photo-upload"
                  className="absolute bottom-0 right-0 bg-primary-600 text-white p-2 rounded-full cursor-pointer hover:bg-primary-700 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="sr-only"
                  id="photo-upload"
                />
              </div>
            </div>

            {/* Name */}
            <h2 className="text-lg font-semibold text-slate-900 text-center mb-4">
              {profile.fullName}
            </h2>

            {/* Info list below photo */}
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">NIM</span>
                <span className="font-medium text-slate-900">{profile.nim}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Program Studi</span>
                <span className="font-medium text-slate-900 text-right">{profile.prodiName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Fakultas</span>
                <span className="font-medium text-slate-900 text-right">{profile.facultyName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Angkatan</span>
                <span className="font-medium text-slate-900">{profile.academicYearCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Jalur Masuk</span>
                <span className="font-medium text-slate-900">{profile.entryType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full capitalize">
                  {profile.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Email Kampus</span>
                <span className="font-medium text-slate-900 text-right text-xs break-all">
                  {profile.email}
                </span>
              </div>

              {/* Editable fields */}
              <div className="border-t border-slate-200 pt-3 mt-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-slate-700">Kontak & Domisili</span>
                  {!editing ? (
                    <button
                      onClick={() => setEditing(true)}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                      Edit
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={handleCancel}
                        className="text-xs text-slate-500 hover:text-slate-700"
                      >
                        Batal
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="text-xs bg-primary-600 text-white px-3 py-1 rounded hover:bg-primary-700 disabled:opacity-50"
                      >
                        {saving ? '...' : 'Simpan'}
                      </button>
                    </div>
                  )}
                </div>

                {editing ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">No. HP</label>
                      <input
                        type="text"
                        value={editData.phone}
                        onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                        className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        placeholder="08xxxxxxxxxx"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Email Pribadi</label>
                      <input
                        type="email"
                        value={editData.personalEmail}
                        onChange={(e) =>
                          setEditData({ ...editData, personalEmail: e.target.value })
                        }
                        className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        placeholder="nama@email.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Alamat Domisili</label>
                      <textarea
                        value={editData.domicileAddress}
                        onChange={(e) =>
                          setEditData({ ...editData, domicileAddress: e.target.value })
                        }
                        className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                        rows={2}
                        placeholder="Alamat lengkap domisili"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">No. HP</span>
                      <span className="font-medium text-slate-900">{profile.phone || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Email Pribadi</span>
                      <span className="font-medium text-slate-900 text-right text-xs">
                        {profile.personalEmail || '-'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Alamat Domisili</span>
                      <span className="font-medium text-slate-900 text-right text-xs max-w-[180px]">
                        {profile.domicileAddress || '-'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Chart */}
        <div className="lg:col-span-2 space-y-6">
          {/* IP Chart */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Indek Prestasi (IP)</h3>
            {ipsData.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <svg
                  className="w-12 h-12 mx-auto mb-3 opacity-50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                <p>Belum ada data IP semester</p>
                <p className="text-sm mt-1">Data akan muncul setelah ada nilai yang lulus</p>
              </div>
            ) : (
              (() => {
                const yTicks = [4, 3, 2, 1, 0];
                return (
                  <div className="relative" data-testid="ips-chart">
                    <div className="flex" style={{ height: '280px' }}>
                      <div className="w-10 flex flex-col justify-between text-right pr-3 text-[11px] text-slate-400 font-medium pt-1 pb-6">
                        {yTicks.map((tick) => (
                          <span key={tick}>{tick.toFixed(1)}</span>
                        ))}
                      </div>
                      <div className="flex-1 relative border-l border-b border-slate-200">
                        {yTicks.map((tick) => (
                          <div
                            key={`grid-${tick}`}
                            className="absolute left-0 right-0 border-t border-slate-100"
                            style={{ bottom: `${(tick / 4) * 100}%` }}
                          />
                        ))}
                        <div className="absolute inset-0 flex justify-around px-4 pb-6">
                          {ipsData.map((sem, idx) => {
                            const barPct = (sem.ips / 4) * 100;
                            return (
                              <div key={idx} className="relative flex-1 max-w-[64px] mx-1 h-full">
                                <div
                                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 rounded-t-lg transition-all"
                                  style={{
                                    height: `${barPct}%`,
                                    backgroundColor: sem.ips === 0 ? '#e2e8f0' : '#3b82f6',
                                  }}
                                >
                                  {sem.ips > 0 && (
                                    <span className="absolute inset-x-0 top-2 text-center text-[11px] font-bold text-white">
                                      {sem.ips.toFixed(2)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-around ml-10 mt-2">
                      {ipsData.map((sem, idx) => (
                        <div key={idx} className="flex-1 max-w-[64px] mx-1 text-center">
                          <span className="text-[10px] text-slate-500 leading-tight block">
                            {sem.semesterCode}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
