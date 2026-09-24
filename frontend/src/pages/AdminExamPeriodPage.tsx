import React, { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

export const AdminExamPeriodPage: React.FC = () => {
  const [periods, setPeriods] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchPeriods = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/exam/periods');
      setPeriods(res.data || []);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPeriods();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      await apiRequest('/exam/periods', {
        method: 'POST',
        body: JSON.stringify({ name, semesterId, startDate, endDate }),
      });
      setName('');
      setSemesterId('');
      setStartDate('');
      setEndDate('');
      fetchPeriods();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Kelola Periode Ujian (Admin Sistem)</h1>
      {error && <div className="bg-red-100 text-red-700 p-3 mb-4 rounded">{error}</div>}

      <form onSubmit={handleCreate} className="mb-6 bg-white p-4 rounded shadow">
        <h2 className="text-lg font-semibold mb-2">Tambah Periode Ujian</h2>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <input
            type="text"
            placeholder="Nama Periode"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border p-2 rounded"
            required
          />
          <input
            type="text"
            placeholder="Semester ID (e.g. 20261)"
            value={semesterId}
            onChange={(e) => setSemesterId(e.target.value)}
            className="border p-2 rounded"
            required
          />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border p-2 rounded"
            required
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border p-2 rounded"
            required
          />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
          Simpan
        </button>
      </form>

      <div className="bg-white rounded shadow overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b">
              <th className="p-3">ID</th>
              <th className="p-3">Nama</th>
              <th className="p-3">Semester</th>
              <th className="p-3">Mulai</th>
              <th className="p-3">Selesai</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-4 text-center">
                  Loading...
                </td>
              </tr>
            ) : periods.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center">
                  Tidak ada periode ujian.
                </td>
              </tr>
            ) : (
              periods.map((p) => (
                <tr key={String(p.id)} className="border-b">
                  <td className="p-3">{String(p.id)}</td>
                  <td className="p-3">{String(p.name)}</td>
                  <td className="p-3">{String(p.semester_id)}</td>
                  <td className="p-3">{String(p.start_date)}</td>
                  <td className="p-3">{String(p.end_date)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
