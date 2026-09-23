import React, { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { Spinner } from '../components/Spinner';
import { FormAlert } from '../components/ErrorInline';

interface ExamPeriod { id: number; name: string; }
interface ClassItem { id: number; class_code: string; course_name: string; }
interface Question { id: number; title: string; course_id: number; }
interface ExamSchedule {
  id: number;
  period_name: string;
  course_name: string;
  class_code: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  room: string;
  question_title: string;
}

export function AdminExamSchedulePage() {
  const [periods, setPeriods] = useState<ExamPeriod[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [periodId, setPeriodId] = useState('');
  const [classId, setClassId] = useState('');
  const [questionId, setQuestionId] = useState('');
  const [examDate, setExamDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [room, setRoom] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [pRes, cRes, qRes, sRes] = await Promise.all([
        apiRequest<{ data: ExamPeriod[] }>('/exam/periods'),
        apiRequest<{ data: ClassItem[] }>('/admin/classes'),
        apiRequest<{ data: Question[] }>('/exam/admin/questions-lookup'),
        apiRequest<{ data: ExamSchedule[] }>('/exam/admin/schedules')
      ]);
      setPeriods(pRes.data);
      setClasses(cRes.data);
      setQuestions(qRes.data);
      setSchedules(sRes.data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data penjadwalan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      await apiRequest('/exam/admin/schedules', {
        method: 'POST',
        body: JSON.stringify({
          exam_period_id: Number(periodId),
          class_id: Number(classId),
          question_id: questionId ? Number(questionId) : null,
          room,
          exam_date: examDate,
          start_time: startTime,
          end_time: endTime,
        }),
      });
      setExamDate('');
      setStartTime('');
      setEndTime('');
      setRoom('');
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Gagal membuat jadwal ujian');
    }
  };

  if (loading) return <div className="p-6"><Spinner /></div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Penjadwalan Ujian (Admin Akademik)</h1>
      
      {error && <FormAlert message={error} />}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Form Create */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-4 text-primary-700">Set Jadwal Baru</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500">Periode Ujian</label>
              <select value={periodId} onChange={e => setPeriodId(e.target.value)} className="mt-1 w-full rounded border p-2 text-sm" required>
                <option value="">-- Pilih Periode --</option>
                {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Kelas / Matkul</label>
              <select value={classId} onChange={e => setClassId(e.target.value)} className="mt-1 w-full rounded border p-2 text-sm" required>
                <option value="">-- Pilih Kelas --</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.class_code} - {c.course_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Paket Soal (Dosen)</label>
              <select value={questionId} onChange={e => setQuestionId(e.target.value)} className="mt-1 w-full rounded border p-2 text-sm">
                <option value="">-- Belum Ditentukan --</option>
                {questions.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Tanggal</label>
              <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} className="mt-1 w-full rounded border p-2 text-sm" required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-500">Mulai</label>
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="mt-1 w-full rounded border p-2 text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Selesai</label>
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="mt-1 w-full rounded border p-2 text-sm" required />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Ruangan</label>
              <input type="text" value={room} onChange={e => setRoom(e.target.value)} placeholder="Mis: Ruang 301 / Virtual" className="mt-1 w-full rounded border p-2 text-sm" required />
            </div>
            <button type="submit" className="w-full bg-primary-600 text-white p-2 rounded hover:bg-primary-700 font-medium">Plotting Jadwal</button>
          </form>
        </div>

        {/* List schedules */}
        <div className="lg:col-span-3 bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-4 text-slate-800">Daftar Jadwal Ujian Ter-plotting</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
                <tr>
                  <th className="p-3">Mata Kuliah / Kelas</th>
                  <th className="p-3">Tanggal & Waktu</th>
                  <th className="p-3">Ruangan</th>
                  <th className="p-3">Periode</th>
                  <th className="p-3">Paket Soal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {schedules.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="p-3">
                      <div className="font-semibold text-slate-900">{s.course_name}</div>
                      <div className="text-slate-500 text-[10px]">Kelas: {s.class_code}</div>
                    </td>
                    <td className="p-3">
                      <div className="text-slate-800">{s.exam_date}</div>
                      <div className="text-slate-500 font-mono text-[10px]">{s.start_time} - {s.end_time}</div>
                    </td>
                    <td className="p-3 font-medium text-primary-700">{s.room}</td>
                    <td className="p-3 text-slate-600">{s.period_name}</td>
                    <td className="p-3">
                      {s.question_title ? (
                        <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100">{s.question_title}</span>
                      ) : (
                        <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 italic">Belum Ada</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
