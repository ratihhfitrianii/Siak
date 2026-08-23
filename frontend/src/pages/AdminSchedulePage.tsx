import { useState, useEffect, useCallback } from 'react';
import {
  getAcademicCurricula,
  getAcademicClasses,
  getScheduleClass,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  ApiError,
} from '../lib/api';
import type { ClassSchedule } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';

interface CurriculumOption {
  id: number;
  course_code: string;
  course_name: string;
  credits: number;
  semester_number: number;
  prodi_name: string;
  semester_id: number;
}

interface ClassOption {
  id: number;
  class_code: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string;
  capacity: number;
  current_enrolled: number;
  is_active: boolean;
}

const dayNames = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

/**
 * Halaman Kelola Jadwal (Admin Sistem / Admin Akademik) — T3.2 (F-21, F-22)
 * - CRUD jadwal pertemuan per kelas
 * - permission: schedule.manage
 */
export function AdminSchedulePage() {
  const [curricula, setCurricula] = useState<CurriculumOption[]>([]);
  const [selectedCurriculumId, setSelectedCurriculumId] = useState<string>('');
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ClassSchedule | null>(null);
  const [formData, setFormData] = useState({
    meetingNumber: 1,
    scheduledDate: '',
    topic: '',
    isCompleted: false,
  });

  // Load curricula on mount
  useEffect(() => {
    getAcademicCurricula()
      .then((res) => setCurricula(res.items))
      .catch(() => setError('Gagal memuat kurikulum'));
  }, []);

  // Load classes for selected curriculum
  const loadClasses = useCallback(async (curriculumId: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAcademicClasses(curriculumId);
      setClasses(res.items);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Gagal memuat kelas';
      setError(msg);
      setClasses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCurriculumId) {
      loadClasses(Number(selectedCurriculumId));
    } else {
      setClasses([]);
      setSelectedClassId('');
    }
  }, [selectedCurriculumId, loadClasses]);

  // Load schedules when class changes
  useEffect(() => {
    if (!selectedClassId) {
      setSchedules([]);
      return;
    }
    setLoading(true);
    setError(null);
    getScheduleClass(Number(selectedClassId))
      .then((res) => setSchedules(res.schedules))
      .catch(() => {
        setError('Gagal memuat jadwal');
        setSchedules([]);
      })
      .finally(() => setLoading(false));
  }, [selectedClassId]);

  const handleCurriculumChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCurriculumId(e.target.value);
    setSelectedClassId('');
    setSchedules([]);
  };

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedClassId(e.target.value);
  };

  const reloadSchedules = useCallback(async () => {
    if (!selectedClassId) return;
    const res = await getScheduleClass(Number(selectedClassId));
    setSchedules(res.schedules);
  }, [selectedClassId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setLoading(true);
    try {
      if (editingSchedule) {
        await updateSchedule(editingSchedule.id, {
          meetingNumber: formData.meetingNumber,
          scheduledDate: formData.scheduledDate || undefined,
          topic: formData.topic || undefined,
          isCompleted: formData.isCompleted,
        });
      } else {
        await createSchedule({
          classId: Number(selectedClassId),
          meetingNumber: formData.meetingNumber,
          scheduledDate: formData.scheduledDate,
          topic: formData.topic || undefined,
        });
      }
      setShowForm(false);
      setEditingSchedule(null);
      await reloadSchedules();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Gagal menyimpan jadwal';
      setFormError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (schedule: ClassSchedule) => {
    setEditingSchedule(schedule);
    setFormData({
      meetingNumber: schedule.meetingNumber,
      scheduledDate: schedule.scheduledDate,
      topic: schedule.topic || '',
      isCompleted: schedule.isCompleted,
    });
    setShowForm(true);
    setFormError(null);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Hapus jadwal ini?')) return;
    setLoading(true);
    try {
      await deleteSchedule(id);
      await reloadSchedules();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Gagal menghapus jadwal';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleNew = () => {
    setEditingSchedule(null);
    setFormData({
      meetingNumber: schedules.length + 1,
      scheduledDate: '',
      topic: '',
      isCompleted: false,
    });
    setShowForm(true);
    setFormError(null);
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Kurikulum</label>
            <select
              value={selectedCurriculumId}
              onChange={handleCurriculumChange}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              disabled={loading}
            >
              <option value="">Pilih Kurikulum</option>
              {curricula.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.prodi_name} — {c.course_code} ({c.course_name}) Sem {c.semester_number}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Kelas</label>
            <select
              value={selectedClassId}
              onChange={handleClassChange}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              disabled={loading || classes.length === 0}
            >
              <option value="">Pilih Kelas</option>
              {classes.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.class_code} — {dayNames[c.day_of_week]} {c.start_time}–{c.end_time} ({c.room})
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && <FormAlert>{error}</FormAlert>}
      </div>

      {/* Schedule Table / Form */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {showForm ? (
          <div className="p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              {editingSchedule ? 'Edit Jadwal' : 'Tambah Jadwal'}
            </h2>
            {formError && <FormAlert>{formError}</FormAlert>}
            <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Tanggal (YYYY-MM-DD)
                </label>
                <input
                  type="date"
                  value={formData.scheduledDate}
                  onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Topik (opsional)
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={formData.topic}
                  onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              {editingSchedule && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isCompleted"
                    checked={formData.isCompleted}
                    onChange={(e) => setFormData({ ...formData, isCompleted: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label htmlFor="isCompleted" className="text-sm text-slate-700">
                    Tandai selesai
                  </label>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Menyimpan...' : editingSchedule ? 'Update' : 'Tambah'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingSchedule(null);
                  }}
                  className="px-4 py-2 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300 transition-colors"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        ) : (
          <>
            <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {selectedClassId
                  ? `Jadwal Kelas: ${
                      classes.find((c) => c.id === Number(selectedClassId))?.class_code ?? ''
                    }`
                  : 'Pilih kurikulum dan kelas untuk melihat jadwal'}
              </h2>
              {selectedClassId && !loading && (
                <button
                  onClick={handleNew}
                  className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
                >
                  Tambah Jadwal
                </button>
              )}
            </div>

            {loading && <div className="h-4 bg-slate-100 animate-pulse" />}

            {!loading && selectedClassId && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Tanggal
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Topik
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {schedules.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                          Belum ada jadwal untuk kelas ini
                        </td>
                      </tr>
                    ) : (
                      schedules.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                            {new Date(s.scheduledDate).toLocaleDateString('id-ID', {
                              weekday: 'short',
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{s.topic || '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                            <span
                              className={`px-2 py-1 text-xs font-medium rounded-full ${
                                s.isCompleted
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-primary-100 text-primary-800'
                              }`}
                            >
                              {s.isCompleted ? 'Selesai' : 'Terjadwal'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() => handleEdit(s)}
                              className="text-primary-600 hover:text-primary-900 mr-3"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(s.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Hapus
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
