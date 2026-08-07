import { useState, useEffect } from 'react';
import { getSubstituteRequests, createSubstitute } from '../lib/api';
import type { SubstituteRequest } from '../lib/types';

/**
 * Substitute teaching (T3.7 + T3.8, perm substitute.manage) — ajukan dosen pengganti.
 * Terhubung ke endpoint /substitute.
 */
export function DosenSubstitute() {
  const [type, setType] = useState('');
  const [sessionDate, setSessionDate] = useState('');
  const [originalLecturerId, setOriginalLecturerId] = useState<number | null>(null);
  const [substituteLecturerId, setSubstituteLecturerId] = useState<number | null>(null);
  const [classId, setClassId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [requests, setRequests] = useState<SubstituteRequest[]>([]);

  // Load requests when originalLecturerId changes
  useEffect(() => {
    if (!originalLecturerId) {
      setRequests([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    getSubstituteRequests(originalLecturerId)
      .then((res) => {
        setRequests(res.items);
      })
      .catch(() => {
        setError('Gagal memuat daftar substitute');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [originalLecturerId]);

  const handleSubmit = async () => {
    if (
      !type ||
      !sessionDate ||
      !originalLecturerId ||
      !substituteLecturerId ||
      !classId ||
      !notes.trim()
    ) {
      setError('Lengkapi semua field pengganti');
      return;
    }

    if (originalLecturerId === substituteLecturerId) {
      setError('Dosen pengganti tidak boleh sama dengan dosen asli');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await createSubstitute({
        originalLecturerId,
        substituteLecturerId,
        classId,
        sessionDate,
        type,
        notes,
      });
      setSuccess('Permintaan pengganti berhasil dikirim');
      setType('');
      setSessionDate('');
      setOriginalLecturerId(null);
      setSubstituteLecturerId(null);
      setClassId(null);
      setNotes('');
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      if (apiError.code === 'VALIDATION_ERROR') {
        setError(apiError.message ?? 'Data tidak valid');
      } else if (apiError.code === 'CONFLICT') {
        setError('Jadwal bentrok dengan jadwal dosen pengganti');
      } else {
        setError('Gagal mengirim permintaan pengganti');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Lecturer options - in real app these would come from API
  const lecturerOptions = [
    { id: 1, name: 'Dr. Budi Santoso, M.Kom', nidn: '001' },
    { id: 2, name: 'Prof. Ani Wijaya, Ph.D', nidn: '002' },
    { id: 3, name: 'Dr. Citra Dewi, M.T.', nidn: '003' },
    { id: 4, name: 'Eko Prasetyo, M.Kom', nidn: '004' },
    { id: 5, name: 'Fitriani, M.T.', nidn: '005' },
  ];

  // Class options
  const classOptions = [
    { id: 1, code: 'TI101-A', name: 'Dasar-Dasar Pemrograman (Kelas A)' },
    { id: 2, code: 'SI202-C', name: 'Basis Data (Kelas C)' },
    { id: 3, code: 'MNJ301-B', name: 'Manajemen Strategis (Kelas B)' },
    { id: 4, code: 'HKM401-A', name: 'Hukum Bisnis (Kelas A)' },
    { id: 5, code: 'KN102-D', name: 'Anatomi Tubuh Manusia (Kelas D)' },
  ];

  const typeOptions = [
    { id: 'penjadwalan', name: 'Penjadwalan Ulang' },
    { id: 'pencarian', name: 'Pencarian Dosen Pengganti' },
    { id: 'konfirmasi', name: 'Konfirmasi Penggantian' },
  ];

  const statusColors: Record<string, string> = {
    diajukan: 'bg-blue-100 text-blue-800',
    disetujui: 'bg-green-100 text-green-800',
    ditolak: 'bg-red-100 text-red-800',
    selesai: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Input Substitute Dosen</h2>
        <p className="text-gray-600">
          Input permintaan penggantian dosen untuk mata kuliah tertentu. Ajukan permintaan pengganti
          atau jadwalkan ulang.
        </p>
      </div>

      {/* Form Section */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Form Substitute</h3>
        {error && (
          <p
            role="alert"
            className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800"
          >
            {error}
          </p>
        )}
        {success && (
          <p
            role="status"
            className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800"
          >
            {success}
          </p>
        )}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Jenis Substitute
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Pilih Jenis Substitute</option>
                {typeOptions.map((typeOpt) => (
                  <option key={typeOpt.id} value={typeOpt.id}>
                    {typeOpt.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tanggal Substitute
              </label>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Dosen Asli</label>
              <select
                value={originalLecturerId ?? ''}
                onChange={(e) =>
                  setOriginalLecturerId(e.target.value ? Number(e.target.value) : null)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Pilih Dosen Asli</option>
                {lecturerOptions.map((lec) => (
                  <option key={lec.id} value={lec.id}>
                    {lec.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dosen Pengganti
              </label>
              <select
                value={substituteLecturerId ?? ''}
                onChange={(e) =>
                  setSubstituteLecturerId(e.target.value ? Number(e.target.value) : null)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Pilih Dosen Pengganti</option>
                {lecturerOptions.map((lec) => (
                  <option key={lec.id} value={lec.id}>
                    {lec.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mata Kuliah / Kelas
              </label>
              <select
                value={classId ?? ''}
                onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Pilih Kelas</option>
                {classOptions.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.code} - {cls.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Catatan</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Masukkan detail permintaan pengganti..."
            />
          </div>
        </div>

        {/* Validation Warning */}
        {originalLecturerId === substituteLecturerId && originalLecturerId !== null && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">
              ⚠️ Dosen pengganti tidak boleh sama dengan dosen asli
            </p>
          </div>
        )}

        {/* Submit Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={
              isLoading ||
              !type ||
              !sessionDate ||
              !originalLecturerId ||
              !substituteLecturerId ||
              !classId ||
              !notes.trim() ||
              originalLecturerId === substituteLecturerId
            }
            className="px-6 py-2 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Memproses...' : 'Ajukan Permintaan Substitute'}
          </button>
        </div>
      </div>

      {/* Existing Substitute Requests */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Permintaan Substitute yang Sudah Ada
        </h3>
        {!originalLecturerId ? (
          <p className="text-gray-500">Pilih dosen asli untuk melihat permintaan substitute.</p>
        ) : isLoading ? (
          <p className="text-gray-500">Memuat permintaan substitute...</p>
        ) : requests.length === 0 ? (
          <p className="text-gray-500">Belum ada permintaan substitute.</p>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => (
              <div
                key={req.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold text-gray-900">
                      {req.classCode} - {req.courseCode} - {req.courseName}
                    </h4>
                    <p className="text-sm text-gray-600">
                      {req.sessionDate} | {req.type} | Dosen asli: {req.originalLecturerName} →
                      Pengganti: {req.substituteLecturerName ?? 'Belum ditentukan'}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      statusColors[req.status] ?? 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {req.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
