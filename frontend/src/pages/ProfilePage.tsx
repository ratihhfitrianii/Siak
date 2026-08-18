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

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<StudentProfile>('/students/me');
      setProfile(data);
      if (data.photoUrl) setPhotoPreview(data.photoUrl);
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
      // IPS data is optional, don't show error
    }
  }, []);

  useEffect(() => {
    loadProfile();
    loadIPS();
  }, [loadProfile, loadIPS]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      console.error('File harus berupa gambar');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      console.error('Ukuran file maksimal 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      const formData = new FormData(e.currentTarget as HTMLFormElement);
      // Remove photo from formData if not changed
      if (!formData.get('photoUrl')) {
        formData.delete('photoUrl');
      }

      // Convert FormData to JSON
      const body: Record<string, string | null> = {};
      formData.forEach((value, key) => {
        body[key] = value as string;
      });

      const res = await apiRequest<StudentProfile>('/students/me', {
        method: 'PUT',
        body: JSON.stringify({
          phone: body.phone || null,
          personalEmail: body.personalEmail || null,
          photoUrl: photoPreview !== profile.photoUrl ? photoPreview : undefined,
        }),
      });

      setProfile(res);
      // Use console.log instead of alert for test compatibility
      console.log('Profil berhasil diperbarui');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan profil';
      console.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    loadProfile();
    setPhotoPreview(profile?.photoUrl ?? null);
  };

  const calculateIPK = (): number => {
    if (!ipsData || !Array.isArray(ipsData)) return 0;
    let totalBobot = 0;
    let totalSks = 0;
    for (const sem of ipsData) {
      totalBobot += sem.ips * sem.sksLulus;
      totalSks += sem.sksLulus;
    }
    return totalSks > 0 ? Math.round((totalBobot / totalSks) * 100) / 100 : 0;
  };

  const ipk = calculateIPK();

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
        {/* Left: Photo & Basic Info */}
        <div className="lg:col-span-1 space-y-6">
          {/* Photo Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center">
            <div className="relative inline-block mb-4">
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
            <p className="text-sm text-slate-500 mb-4">Foto ini akan digunakan untuk Ijazah</p>
            <div className="space-y-2 text-left">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">NIM</span>
                <span className="font-medium text-slate-900">{profile.nim}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Status</span>
                <span className="font-medium text-slate-900 capitalize">{profile.status}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Jalur Masuk</span>
                <span className="font-medium text-slate-900">{profile.entryType}</span>
              </div>
            </div>
          </div>

          {/* IPK Summary Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Ringkasan IP</h3>
            <div className="text-center mb-4">
              <div className="text-4xl font-bold text-primary-600">{ipk.toFixed(2)}</div>
              <div className="text-sm text-slate-500">IP Kumulatif (IPK)</div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-slate-500">Total SKS Lulus</div>
                <div className="font-semibold text-slate-900">
                  {(Array.isArray(ipsData) ? ipsData : []).reduce((a, b) => a + b.sksLulus, 0)}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-slate-500">Semester Aktif</div>
                <div className="font-semibold text-slate-900">{ipsData.length}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Form & Chart */}
        <div className="lg:col-span-2 space-y-6">
          {/* Detail Form */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Detail Mahasiswa</h3>
            <form onSubmit={handleSave} className="space-y-4">
              {/* Read-only fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nama Lengkap
                  </label>
                  <input
                    type="text"
                    value={profile.fullName}
                    readOnly
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Email Kampus
                  </label>
                  <input
                    type="email"
                    value={profile.email}
                    readOnly
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">NIM</label>
                  <input
                    type="text"
                    value={profile.nim}
                    readOnly
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fakultas</label>
                  <input
                    type="text"
                    value={`${profile.facultyCode} - ${profile.facultyName}`}
                    readOnly
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Program Studi
                  </label>
                  <input
                    type="text"
                    value={`${profile.prodiCode} - ${profile.prodiName}`}
                    readOnly
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Tahun Akademik Masuk
                  </label>
                  <input
                    type="text"
                    value={profile.academicYearCode}
                    readOnly
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
              </div>

              {/* Editable fields */}
              <div className="border-t border-slate-200 pt-4">
                <h4 className="font-medium text-slate-900 mb-3">Informasi Kontak (Dapat Diubah)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="phone"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      No. HP
                    </label>
                    <input
                      type="text"
                      id="phone"
                      name="phone"
                      value={profile.phone || ''}
                      onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="08xxxxxxxxxx"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="personalEmail"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Email Pribadi
                    </label>
                    <input
                      type="email"
                      id="personalEmail"
                      name="personalEmail"
                      value={profile.personalEmail || ''}
                      onChange={(e) => setProfile({ ...profile, personalEmail: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="nama@email.com"
                    />
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>

          {/* IP Chart */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Grafik IP per Semester</h3>
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
              <div className="h-80 relative" data-testid="ips-chart">
                {/* Y-axis labels */}
                <div className="absolute left-0 top-4 bottom-8 flex flex-col justify-between text-[10px] text-slate-400 pr-2 w-8">
                  {(() => {
                    const ipsValues = ipsData.map((s) => s.ips).filter((v) => v > 0);
                    if (ipsValues.length === 0) return null;
                    const dataMax = Math.max(...ipsValues);
                    const dataMin = Math.min(...ipsValues);
                    const yMax = Math.min(4.0, Math.ceil(dataMax * 10) / 10 + 0.1);
                    const yMin = Math.max(0, Math.floor(dataMin * 10) / 10 - 0.1);
                    return [yMax, ((yMax + yMin) / 2).toFixed(1), yMin.toFixed(1)].map((v, i) => (
                      <span key={i}>{v}</span>
                    ));
                  })()}
                </div>
                <div className="flex items-end justify-around h-full pt-4 pb-8 px-4 ml-8">
                  {(() => {
                    const ipsValues = ipsData.map((s) => s.ips).filter((v) => v > 0);
                    const dataMax = ipsValues.length > 0 ? Math.max(...ipsValues) : 4;
                    const dataMin = ipsValues.length > 0 ? Math.min(...ipsValues) : 0;
                    const yMax = Math.min(4.0, Math.ceil(dataMax * 10) / 10 + 0.1);
                    const yMin = Math.max(0, Math.floor(dataMin * 10) / 10 - 0.1);
                    const range = yMax - yMin || 1;
                    return ipsData.map((sem, idx) => {
                      const barHeight = sem.ips > 0 ? ((sem.ips - yMin) / range) * 100 : 0;
                      const isAboveIPK = sem.ips >= ipk;
                      return (
                        <div
                          key={idx}
                          className="flex flex-col items-center gap-1 flex-1 max-w-[80px]"
                        >
                          <span className="text-xs font-medium text-slate-700">
                            {sem.ips > 0 ? sem.ips.toFixed(2) : '-'}
                          </span>
                          <div
                            className={`w-full rounded-t-md transition-all ${isAboveIPK ? 'bg-primary-500' : 'bg-red-400'}`}
                            style={{
                              height: `${barHeight}%`,
                              minHeight: sem.ips > 0 ? '4px' : '0px',
                            }}
                          />
                          <span className="text-[10px] text-slate-500 text-center leading-tight mt-1">
                            {sem.semesterName}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
                {/* IPK reference line */}
                {ipsData.length > 0 &&
                  (() => {
                    const ipsValues = ipsData.map((s) => s.ips).filter((v) => v > 0);
                    if (ipsValues.length === 0) return null;
                    const dataMax = Math.max(...ipsValues);
                    const dataMin = Math.min(...ipsValues);
                    const yMax = Math.min(4.0, Math.ceil(dataMax * 10) / 10 + 0.1);
                    const yMin = Math.max(0, Math.floor(dataMin * 10) / 10 - 0.1);
                    const range = yMax - yMin || 1;
                    const ipkPercent = ((ipk - yMin) / range) * 100;
                    return (
                      <div
                        className="absolute left-8 right-4 border-t-2 border-dashed border-amber-400"
                        style={{ bottom: `calc(${ipkPercent}% + 2rem)` }}
                      >
                        <span className="absolute right-0 -top-5 text-xs font-bold text-amber-500">
                          IPK: {ipk.toFixed(2)}
                        </span>
                      </div>
                    );
                  })()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
