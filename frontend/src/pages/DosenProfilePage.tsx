import { useCallback, useEffect, useRef, useState } from 'react';
import { getMyLecturerProfile, updateLecturerProfile, ApiError } from '../lib/api';
import type { LecturerProfile } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';
import { Spinner } from '../components/Spinner';

export function DosenProfilePage() {
  const [profile, setProfile] = useState<LecturerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Kontak edit state
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Foto upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getMyLecturerProfile();
      setProfile(data);
      setPhone(data.phone ?? '');
      setPersonalEmail(data.personalEmail ?? '');
      setPhotoPreview(data.photoUrl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat profil dosen. Coba lagi.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleEdit = () => {
    if (!profile) return;
    setPhone(profile.phone ?? '');
    setPersonalEmail(profile.personalEmail ?? '');
    setSaveError(null);
    setSaveSuccess(null);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      // PENTING: jangan JSON.stringify — apiRequest sudah stringify.
      await updateLecturerProfile({
        phone: phone.trim() || null,
        personalEmail: personalEmail.trim() || null,
      });
      setSaveSuccess('Kontak berhasil disimpan');
      setEditing(false);
      await load();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Gagal menyimpan kontak. Coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('File harus berupa gambar');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setUploadError(null);
      setUploading(true);
      try {
        await updateLecturerProfile({ photoUrl: dataUrl });
        setPhotoPreview(dataUrl);
        setSaveSuccess('Foto profil berhasil diubah');
      } catch (err) {
        setUploadError(err instanceof ApiError ? err.message : 'Gagal mengunggah foto. Coba lagi.');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      setUploadError('Gagal membaca file gambar');
    };
    reader.readAsDataURL(file);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Memuat profil dosen..." />
      </div>
    );
  }

  if (error) {
    return <FormAlert>{error}</FormAlert>;
  }

  if (!profile) {
    return <FormAlert>Tidak ada data profil.</FormAlert>;
  }

  const nikOrNidn = profile.nik || profile.nidn || '';

  const detailRows: Array<[string, string]> = [
    ['Nama', profile.fullName],
    ['NIK / NIDN', nikOrNidn],
    ['Fakultas', profile.facultyName],
    ['Program Studi', `${profile.prodiCode} - ${profile.prodiName}`],
    ['No. HP', profile.phone || '-'],
    ['Email Pribadi', profile.personalEmail || '-'],
    ['Email Kampus', profile.email],
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Kartu foto + identitas */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="shrink-0">
            <div className="relative">
              <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-4xl font-bold text-slate-400">
                {photoPreview && photoPreview.startsWith('data:image') ? (
                  <img
                    src={photoPreview}
                    alt="Foto profil"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  profile.fullName.charAt(0).toUpperCase()
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-white shadow-md transition hover:bg-primary-700 disabled:opacity-50"
                aria-label="Ubah foto profil"
                title="Ubah foto profil"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              id="dosen-photo-input"
              onChange={handleFileChange}
            />
            {uploading && <p className="mt-2 text-center text-xs text-slate-500">Mengunggah...</p>}
            {uploadError && <p className="mt-2 text-center text-xs text-red-600">{uploadError}</p>}
          </div>

          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-xl font-bold text-slate-900">{profile.fullName}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {profile.prodiCode} - {profile.prodiName} · {profile.facultyName}
            </p>
            <p className="mt-1 text-sm text-slate-400">NIK {nikOrNidn}</p>
            <p className="mt-1 text-sm text-slate-400">{profile.email}</p>
          </div>
        </div>
      </div>

      {/* Detail dosen */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Detail Dosen</h2>
          {!editing ? (
            <button
              onClick={handleEdit}
              className="px-3 py-1.5 text-sm font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 transition"
            >
              Edit
            </button>
          ) : null}
        </div>

        {!editing ? (
          <dl className="space-y-3 text-sm">
            {detailRows.map(([label, val]) => (
              <div key={label} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-medium text-slate-900 text-right break-words max-w-[60%]">
                  {val}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="space-y-3 text-sm">
            {saveError && <FormAlert>{saveError}</FormAlert>}
            {saveSuccess && (
              <div
                role="status"
                className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
              >
                {saveSuccess}
              </div>
            )}
            <div>
              <label htmlFor="dosen-phone" className="mb-1 block font-medium text-slate-700">
                No. HP
              </label>
              <input
                id="dosen-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label
                htmlFor="dosen-personal-email"
                className="mb-1 block font-medium text-slate-700"
              >
                Email Pribadi
              </label>
              <input
                id="dosen-personal-email"
                type="email"
                value={personalEmail}
                onChange={(e) => setPersonalEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition disabled:opacity-50"
              >
                Batal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
