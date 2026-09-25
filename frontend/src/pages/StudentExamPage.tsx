import React, { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

export const StudentExamPage: React.FC = () => {
  const [exams, setExams] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExams = async () => {
    try {
      setLoading(true);
      const res = await apiRequest<{ data: Array<Record<string, unknown>> }>(
        '/exam/student/my-exams',
      );
      setExams(res.data || []);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Daftar Ujian Mahasiswa (Pessay AES)</h1>
      {error && <div className="bg-red-100 text-red-700 p-3 mb-4 rounded">{error}</div>}

      <div className="bg-white rounded shadow overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b">
              <th className="p-3">Mata Kuliah</th>
              <th className="p-3">Tanggal</th>
              <th className="p-3">Jam</th>
              <th className="p-3">Ruangan</th>
              <th className="p-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-4 text-center">
                  Loading...
                </td>
              </tr>
            ) : exams.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center">
                  Tidak ada jadwal ujian aktif.
                </td>
              </tr>
            ) : (
              exams.map((ex) => (
                <tr key={String(ex.id)} className="border-b">
                  <td className="p-3">{String(ex.course_name || 'Ujian')}</td>
                  <td className="p-3">{String(ex.exam_date)}</td>
                  <td className="p-3">
                    {String(ex.start_time)} - {String(ex.end_time)}
                  </td>
                  <td className="p-3">{String(ex.room || '-')}</td>
                  <td className="p-3">
                    <a
                      href="https://pessay.ai"
                      target="_blank"
                      rel="noreferrer"
                      className="bg-green-600 text-white px-3 py-1 rounded text-sm"
                    >
                      Mulai Ujian (Pessay)
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
