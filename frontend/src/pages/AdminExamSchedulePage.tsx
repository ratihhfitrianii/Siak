import React, { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

export const AdminExamSchedulePage: React.FC = () => {
  const [schedules, setSchedules] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const res = await apiRequest<{ data: Array<Record<string, unknown>> }>('/exam/schedules');
      setSchedules(res.data || []);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Kelola Jadwal Ujian (Admin Akademik)</h1>
      {error && <div className="bg-red-100 text-red-700 p-3 mb-4 rounded">{error}</div>}

      <div className="bg-white rounded shadow overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b">
              <th className="p-3">ID</th>
              <th className="p-3">Periode</th>
              <th className="p-3">Kelas</th>
              <th className="p-3">Ruangan</th>
              <th className="p-3">Tanggal</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-4 text-center">
                  Loading...
                </td>
              </tr>
            ) : schedules.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center">
                  Tidak ada jadwal ujian.
                </td>
              </tr>
            ) : (
              schedules.map((s) => (
                <tr key={String(s.id)} className="border-b">
                  <td className="p-3">{String(s.id)}</td>
                  <td className="p-3">{String(s.exam_period_id)}</td>
                  <td className="p-3">{String(s.class_id)}</td>
                  <td className="p-3">{String(s.room || '-')}</td>
                  <td className="p-3">{String(s.exam_date)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
