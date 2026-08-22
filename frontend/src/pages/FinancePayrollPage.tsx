import { useState, useEffect, useCallback } from 'react';
import { getPayrolls, generatePayrollBatch, approvePayroll, payPayroll } from '../lib/api';
import type { SalarySlip } from '../lib/types';
import { FormAlert } from '../components/ErrorInline';
import { Spinner } from '../components/Spinner';

const BULAN = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function formatRupiah(n: number): string {
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}

/** "2026-08-01" → "Agustus 2026" */
function periodeLabel(periodStart: string): string {
  const d = new Date(periodStart);
  if (isNaN(d.getTime())) return periodStart;
  return `${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  approved: 'Disetujui',
  paid: 'Dibayar',
};

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
};

/**
 * Payroll (admin keuangan) — generate payroll bulanan semua dosen aktif,
 * lalu approve & tandai dibayar per baris.
 */
export function FinancePayrollPage() {
  const [items, setItems] = useState<SalarySlip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);

  // Periode target untuk generate + filter list (default: bulan berjalan)
  const now = new Date();
  const [bulan, setBulan] = useState(now.getMonth()); // 0-based
  const [tahun, setTahun] = useState(now.getFullYear());
  const TAHUN_OPTIONS = Array.from({ length: 3 }, (_, i) => now.getFullYear() + 1 - i);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const lastDay = new Date(tahun, bulan + 1, 0).getDate();
      const start = `${tahun}-${String(bulan + 1).padStart(2, '0')}-01`;
      const end = `${tahun}-${String(bulan + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const res = await getPayrolls({ periodStart: start, periodEnd: end });
      setItems(res.items);
    } catch {
      setError('Gagal memuat data payroll');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [bulan, tahun]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const lastDay = new Date(tahun, bulan + 1, 0).getDate();
      const start = `${tahun}-${String(bulan + 1).padStart(2, '0')}-01`;
      const end = `${tahun}-${String(bulan + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const message = await generatePayrollBatch(start, end);
      setNotice(`${message} — ${BULAN[bulan]} ${tahun}`);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal generate payroll');
    } finally {
      setGenerating(false);
    }
  }

  async function handleApprove(id: number) {
    setBusyId(id);
    setError(null);
    try {
      await approvePayroll(id);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal approve payroll');
    } finally {
      setBusyId(null);
    }
  }

  async function handlePay(id: number) {
    setBusyId(id);
    setError(null);
    try {
      await payPayroll(id);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menandai dibayar');
    } finally {
      setBusyId(null);
    }
  }

  const totalNet = items.reduce((sum, i) => sum + i.netAmount, 0);

  return (
    <div className="space-y-6">
      {/* Filter periode + Generate */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label
              htmlFor="payroll-bulan"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Bulan
            </label>
            <select
              id="payroll-bulan"
              value={bulan}
              onChange={(e) => setBulan(Number(e.target.value))}
              className="px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            >
              {BULAN.map((b, i) => (
                <option key={b} value={i}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="payroll-tahun"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Tahun
            </label>
            <select
              id="payroll-tahun"
              value={tahun}
              onChange={(e) => setTahun(Number(e.target.value))}
              className="px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            >
              {TAHUN_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="px-4 py-2 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60 transition"
          >
            {generating ? 'Memproses…' : '⚡ Generate Payroll'}
          </button>
        </div>
        {notice && (
          <div
            role="status"
            className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
          >
            {notice}
          </div>
        )}
        {error && (
          <div className="mt-3">
            <FormAlert>{error}</FormAlert>
          </div>
        )}
      </div>

      {/* Tabel payroll */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Spinner className="h-8 w-8" label="Memuat payroll..." />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-slate-500">
          Belum ada payroll untuk {BULAN[bulan]} {tahun}. Klik "Generate Payroll" untuk membuat.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Dosen</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Periode</th>
                <th className="px-4 py-3 text-right font-medium text-slate-700">Gaji Pokok</th>
                <th className="px-4 py-3 text-right font-medium text-slate-700">Honor</th>
                <th className="px-4 py-3 text-right font-medium text-slate-700">Potongan</th>
                <th className="px-4 py-3 text-right font-medium text-slate-700">Total</th>
                <th className="px-4 py-3 text-center font-medium text-slate-700">Status</th>
                <th className="px-4 py-3 text-center font-medium text-slate-700">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {p.lecturerName ?? `Lecturer #${p.lecturerId}`}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{periodeLabel(p.periodStart)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {formatRupiah(p.baseSalary)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {formatRupiah(
                      p.totalHonor > 0 ? p.totalHonor : p.honorPerMeeting * p.totalMeetings,
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-red-700">
                    {formatRupiah(p.deductions)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatRupiah(p.netAmount)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[p.status] ?? 'bg-slate-100 text-slate-700'}`}
                    >
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    {p.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => void handleApprove(p.id)}
                        disabled={busyId === p.id}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 disabled:opacity-60 transition"
                      >
                        {busyId === p.id ? '…' : 'Approve'}
                      </button>
                    )}
                    {p.status === 'approved' && (
                      <button
                        type="button"
                        onClick={() => void handlePay(p.id)}
                        disabled={busyId === p.id}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-md text-xs font-medium hover:bg-green-700 disabled:opacity-60 transition"
                      >
                        {busyId === p.id ? '…' : 'Tandai Dibayar'}
                      </button>
                    )}
                    {p.status === 'paid' && (
                      <span className="text-xs text-slate-400">Selesai ✓</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={5} className="px-4 py-3 font-medium text-slate-700">
                  Total {items.length} dosen
                </td>
                <td className="px-4 py-3 text-right font-bold text-primary-700">
                  {formatRupiah(totalNet)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
