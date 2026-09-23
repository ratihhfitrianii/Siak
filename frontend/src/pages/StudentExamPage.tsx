import React, { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { Spinner } from '../components/Spinner';
import { FormAlert } from '../components/ErrorInline';

interface ExamItem {
  id: number;
  period_name: string;
  course_name: string;
  class_code: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  room: string;
}

export function StudentExamPage() {
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'daftar' | 'nilai'>('daftar');

  useEffect(() => {
    const fetchExams = async () => {
      try {
        setLoading(true);
        const res = await apiRequest<{ success: boolean; data: ExamItem[] }>('/exam/student/my-exams');
        setExams(res.data);
      } catch (err: any) {
        setError(err.message || 'Gagal memuat jadwal ujian');
      } finally {
        setLoading(false);
      }
    };
    fetchExams();
  }, []);

  const handleStartExam = (exam: ExamItem) => {
    // SSO to Pessay: pass token via localStorage or URL params
    const token = localStorage.getItem('token') || '';
    const pessayUrl = `http://localhost:5173/exam/take?token=${encodeURIComponent(token)}&examId=${exam.id}`;
    window.open(pessayUrl, '_blank');
  };

  if (loading) return <div className="p-6"><Spinner /></div>;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Ujian & Penilaian Esai (Pessay)</h1>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button 
            onClick={() => setActiveTab('daftar')} 
            className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'daftar' ? 'bg-white shadow text-primary-700' : 'text-slate-600'}`}
          >
            Daftar Ujian
          </button>
          <button 
            onClick={() => setActiveTab('nilai')} 
            className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'nilai' ? 'bg-white shadow text-primary-700' : 'text-slate-600'}`}
          >
            Nilai & Umpan Balik AI
          </button>
        </div>
      </div>

      {error && <FormAlert message={error} />}

      {activeTab === 'daftar' ? (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-lg font-semibold text-slate-800">Jadwal Ujian Aktif</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {exams.map(exam => (
              <div key={exam.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50 flex flex-col justify-between space-y-3">
                <div>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-primary-100 text-primary-800 rounded">{exam.period_name}</span>
                  <h3 className="font-bold text-slate-900 mt-2 text-base">{exam.course_name}</h3>
                  <p className="text-xs text-slate-500">Kelas: {exam.class_code} | Ruangan: {exam.room}</p>
                </div>
                <div className="text-xs text-slate-700 border-t pt-2 border-slate-200 flex justify-between items-center">
                  <div>
                    <p>📅 {exam.exam_date}</p>
                    <p>⏰ {exam.start_time} - {exam.end_time}</p>
                  </div>
                  <button 
                    onClick={() => handleStartExam(exam)}
                    className="px-4 py-2 bg-primary-600 text-white rounded-md text-xs font-semibold hover:bg-primary-700 shadow-sm"
                  >
                    Mulai Ujian (Pessay)
                  </button>
                </div>
              </div>
            ))}
            {exams.length === 0 && (
              <p className="text-slate-500 text-sm col-span-2 text-center py-6">Tidak ada jadwal ujian aktif saat ini.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-lg font-semibold text-slate-800">Hasil Penilaian AI Pessay</h2>
          <p className="text-sm text-slate-500">Nilai esai yang telah dinilai secara otomatis oleh Google Gemini Flash akan muncul di sini setelah ujian selesai.</p>
          <div className="p-8 text-center bg-slate-50 rounded border border-dashed border-slate-300 text-slate-500 text-sm">
            Belum ada nilai ujian yang diterbitkan.
          </div>
        </div>
      )}
    </div>
  );
}
