import React, { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { Spinner } from '../components/Spinner';
import { FormAlert } from '../components/ErrorInline';

interface ExamPeriod {
  id: number;
  name: string;
  semester_id: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  can_input_questions: boolean;
}

export function AdminExamPeriodPage() {
  const [periods, setPeriods] = useState<ExamPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [semesterId, setSemesterId] = useState('2026/2027-1');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchPeriods = async () => {
    try {
      setLoading(true);
      const res = await apiRequest<{ success: boolean; data: ExamPeriod[] }>('/exam/periods');
      setPeriods(res.data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat periode ujian');
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
        body: JSON.stringify({
          name,
          semester_id: semesterId,
          start_date: startDate,
          end_date: endDate,
        }),
      });
      setName('');
      setStartDate('');
      setEndDate('');
      fetchPeriods();
    } catch (err: any) {
      setError(err.message || 'Gagal membuat periode ujian');
    }
  };

  if (loading) return <div className="p-6"><Spinner /></div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Kelola Periode Ujian (Admin Sistem)</h1>
      
      {error && <FormAlert message={error} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Create */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-4">Tambah Periode Ujian</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Nama Periode</label>
              <input 
                type="text" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="Mis: UTS Ganjil 2026/2027" 
                className="mt-1 block w-full rounded-md border border-slate-300 p-2 text-sm" 
                required 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Semester ID</label>
              <input 
                type="text" 
                value={semesterId} 
                onChange={e => setSemesterId(e.target.value)} 
                className="mt-1 block w-full rounded-md border border-slate-300 p-2 text-sm" 
                required 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Tanggal Mulai</label>
              <input 
                type="date" 
                value={startDate} 
                onChange={e => setStartDate(e.target.value)} 
                className="mt-1 block w-full rounded-md border border-slate-300 p-2 text-sm" 
                required 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Tanggal Selesai</label>
              <input 
                type="date" 
                value={endDate} 
                onChange={e => setEndDate(e.target.value)} 
                className="mt-1 block w-full rounded-md border border-slate-300 p-2 text-sm" 
                required 
              />
            </div>
            <button type="submit" className="w-full bg-primary-600 text-white p-2 rounded-md hover:bg-primary-700 font-medium">
              Simpan Periode
            </button>
          </form>
        </div>

        {/* List Periods */}
        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-4">Daftar Periode Ujian</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-3">Nama</th>
                  <th className="p-3">Semester</th>
                  <th className="p-3">Mulai</th>
                  <th className="p-3">Selesai</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {periods.map(p => (
                  <tr key={p.id}>
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3">{p.semester_id}</td>
                    <td className="p-3">{p.start_date}</td>
                    <td className="p-3">{p.end_date}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs ${p.is_active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                        {p.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                  </tr>
                ))}
                {periods.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-slate-500">Belum ada periode ujian.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
