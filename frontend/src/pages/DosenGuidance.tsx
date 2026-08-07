import { useState, useEffect } from 'react';
import { getGuidanceSessions, createGuidance } from '../lib/api';
import type { GuidanceSession } from '../lib/types';

/**
 * Bimbingan akademik (T3.7 + T3.8, perm guidance.manage untuk dosen Wali).
 * Terhubung ke endpoint /guidance.
 */
export function DosenGuidance() {
  const [classId, setClassId] = useState<number | null>(null);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [type, setType] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sessions, setSessions] = useState<GuidanceSession[]>([]);

  // Load sessions when classId changes
  useEffect(() => {
    if (!classId) {
      setSessions([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    getGuidanceSessions(classId)
      .then((res) => {
        setSessions(res.items);
      })
      .catch(() => {
        setError('Gagal memuat catatan bimbingan');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [classId]);

  const handleSubmit = async () => {
    if (!classId || !studentId || !type || !date || !description.trim()) {
      setError('Lengkapi semua field bimbingan');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await createGuidance({
        studentId,
        type,
        date,
        description,
      });
      setSuccess('Catatan bimbingan berhasil disimpan');
      setStudentId(null);
      setType('');
      setDate('');
      setDescription('');
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string };
      if (apiError.code === 'VALIDATION_ERROR') {
        setError(apiError.message ?? 'Data tidak valid');
      } else if (apiError.code === 'FORBIDDEN') {
        setError('Anda tidak memiliki izin untuk bimbingan mahasiswa ini (hanya dosen Wali)');
      } else {
        setError('Gagal menyimpan catatan bimbingan');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Class options - in real app these would come from API
  const classOptions = [
    { id: 1, code: 'TI101-A', name: 'Dasar-Dasar Pemrograman (Kelas A)' },
    { id: 2, code: 'SI202-C', name: 'Basis Data (Kelas C)' },
    { id: 3, code: 'MNJ301-B', name: 'Manajemen Strategis (Kelas B)' },
    { id: 4, code: 'HKM401-A', name: 'Hukum Bisnis (Kelas A)' },
    { id: 5, code: 'KN102-D', name: 'Anatomi Tubuh Manusia (Kelas D)' },
  ];

  // Student options - in real app these would come from API (mahasiswa di kelas yg dipilih)
  const studentOptions = [
    { id: 1, nim: '2023110001', name: 'Budi Santoso' },
    { id: 2, nim: '2023110002', name: 'Ani Wijaya' },
    { id: 3, nim: '2023110003', name: 'Citra Dewi' },
    { id: 4, nim: '2023110004', name: 'Eko Prasetyo' },
    { id: 5, nim: '2023110005', name: 'Fitriani' },
  ];

  const typeOptions = [
    { id: 'konsultasi', name: 'Konsultasi Akademik' },
    { id: 'tugas', name: 'Bimbingan Tugas Akhir' },
    { id: 'skripsi', name: 'Pembimbing Skripsi' },
    { id: 'proposal', name: 'Bimbingan Proposal' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Input Bimbingan</h2>
        <p className="text-gray-600">
          Input catatan bimbingan akademik untuk mahasiswa binaan. Catat tanggal, jenis bimbingan,
          dan deskripsi. Hanya dosen Wali yang dapat mengakses.
        </p>
      </div>

      {/* Class Selection */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Pilih Kelas Binaan</h3>
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
        <select
          value={classId ?? ''}
          onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)}
          className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Pilih Kelas</option>
          {classOptions.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.code} - {cls.name}
            </option>
          ))}
        </select>
      </div>

      {/* Form Section */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Form Bimbingan</h3>
        {!classId ? (
          <p className="text-gray-500">Pilih kelas terlebih dahulu.</p>
        ) : (
          <>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Mahasiswa</label>
                  <select
                    value={studentId ?? ''}
                    onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Pilih Mahasiswa</option>
                    {studentOptions.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.nim} - {student.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tanggal Bimbingan
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Jenis Bimbingan
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Pilih Jenis Bimbingan</option>
                  {typeOptions.map((typeOpt) => (
                    <option key={typeOpt.id} value={typeOpt.id}>
                      {typeOpt.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Deskripsi</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Masukkan detail bimbingan..."
                />
              </div>
            </div>

            {/* Preview */}
            {studentId && date && type && description.trim() && (
              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Pratinjau Bimbingan:</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>
                    <strong>Mahasiswa:</strong>{' '}
                    {studentOptions.find((s) => s.id === studentId)?.name}
                  </p>
                  <p>
                    <strong>Tanggal:</strong> {date}
                  </p>
                  <p>
                    <strong>Jenis:</strong> {typeOptions.find((t) => t.id === type)?.name}
                  </p>
                  <p>
                    <strong>Deskripsi:</strong> {description}
                  </p>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={isLoading || !studentId || !date || !type || !description.trim()}
                className="px-6 py-2 bg-purple-500 text-white font-medium rounded-lg hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Memproses...' : 'Simpan Bimbingan'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Existing Guidance Sessions */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Catatan Bimbingan yang Sudah Ada</h3>
        {!classId ? (
          <p className="text-gray-500">Pilih kelas untuk melihat catatan bimbingan.</p>
        ) : isLoading ? (
          <p className="text-gray-500">Memuat catatan bimbingan...</p>
        ) : sessions.length === 0 ? (
          <p className="text-gray-500">Belum ada catatan bimbingan untuk kelas ini.</p>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold text-gray-900">
                      {session.studentName} ({session.nim})
                    </h4>
                    <p className="text-sm text-gray-600">
                      {session.date} | {session.type} | {session.description}
                    </p>
                  </div>
                  <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                    Tersimpan
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
