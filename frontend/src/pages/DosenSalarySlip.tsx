import { useState, useEffect, useCallback } from 'react';
import { getMySalarySlips, downloadSalarySlipPdf } from '../lib/api';
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

const TAHUN_SEKARANG = new Date().getFullYear();
const TAHUN_OPTIONS = Array.from({ length: 6 }, (_, i) => TAHUN_SEKARANG - i);

function formatRupiah(n: number): string {
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}

/** Label periode dari periodStart: "2026-08-01" → "Agustus 2026" */
function periodeLabel(periodStart: string): string {
  const d = new Date(periodStart);
  if (isNaN(d.getTime())) return periodStart;
  return `${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

const STATUS_LABEL: Record<string, string> = {
  paid: 'Dibayar',
};

/**
 * Slip Gaji (dosen) — lihat & download slip gaji sendiri.
 * Filter bulan/tahun; download PDF sesuai hasil filter.
 */
export function DosenSalarySlip() {
  const [slips, setSlips] = useState<SalarySlip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Filter bulan ('' = semua) + tahun
  const [bulanFilter, setBulanFilter] = useState('');
  const [tahunFilter, setTahunFilter] = useState(String(TAHUN_SEKARANG));

  const loadSlips = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Bangun rentang periode dari filter: period_start <= akhir-bulan && period_end >= awal-bulan
      let qsStart: string | undefined;
      let qsEnd: string | undefined;
      if (bulanFilter) {
        const monthIdx = BULAN.indexOf(bulanFilter); // 0-based
        const year = parseInt(tahunFilter, 10) || TAHUN_SEKARANG;
        const lastDay = new Date(year, monthIdx + 1, 0).getDate();
        qsStart = `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;
        qsEnd = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      } else if (tahunFilter) {
        const year = parseInt(tahunFilter, 10);
        qsStart = `${year}-01-01`;
        qsEnd = `${year}-12-31`;
      }
      const res = await getMySalarySlips(qsStart, qsEnd);
      setSlips(res.items);
    } catch {
      setError('Belum Ada Data');
      setSlips([]);
    } finally {
      setLoading(false);
    }
  }, [bulanFilter, tahunFilter]);

  useEffect(() => {
    loadSlips();
  }, [loadSlips]);

  async function handleDownload() {
    setDownloadError(null);
    setDownloading(true);
    try {
      let qsStart: string | undefined;
      let qsEnd: string | undefined;
      if (bulanFilter) {
        const monthIdx = BULAN.indexOf(bulanFilter);
        const year = parseInt(tahunFilter, 10) || TAHUN_SEKARANG;
        const lastDay = new Date(year, monthIdx + 1, 0).getDate();
        qsStart = `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;
        qsEnd = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      } else if (tahunFilter) {
        const year = parseInt(tahunFilter, 10);
        qsStart = `${year}-01-01`;
        qsEnd = `${year}-12-31`;
      }
      await downloadSalarySlipPdf(qsStart, qsEnd);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Gagal mengunduh slip gaji');
    } finally {
      setDownloading(false);
    }
  }

  const totalNet = slips.reduce((sum, s) => sum + s.netAmount, 0);

  return (
    <div className="space-y-6">
      {/* Filter + tombol download */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="filter-tahun" className="block text-sm font-medium text-slate-700 mb-1">
              Tahun
            </label>
            <select
              id="filter-tahun"
              value={tahunFilter}
              onChange={(e) => setTahunFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            >
              {TAHUN_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-bulan" className="block text-sm font-medium text-slate-700 mb-1">
              Bulan
            </label>
            <select
              id="filter-bulan"
              value={bulanFilter}
              onChange={(e) => setBulanFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            >
              <option value="">Semua Bulan</option>
              {BULAN.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={downloading || slips.length === 0}
            className="px-4 py-2 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60 transition"
          >
            {downloading ? 'Mengunduh…' : '⬇ Download PDF'}
          </button>
        </div>
        {downloadError && (
          <div className="mt-3">
            <FormAlert>{downloadError}</FormAlert>
          </div>
        )}
      </div>

      {/* Daftar slip */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Spinner className="h-8 w-8" label="Memuat slip gaji..." />
        </div>
      ) : error ? (
        <FormAlert>{error}</FormAlert>
      ) : slips.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-slate-500">
          Belum Ada Data
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Periode</th>
                <th className="px-4 py-3 text-right font-medium text-slate-700">Gaji Pokok</th>
                <th className="px-4 py-3 text-right font-medium text-slate-700">Honor Mengajar</th>
                <th className="px-4 py-3 text-right font-medium text-slate-700">Potongan</th>
                <th className="px-4 py-3 text-right font-medium text-slate-700">Total Diterima</th>
                <th className="px-4 py-3 text-center font-medium text-slate-700">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {slips.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {periodeLabel(s.periodStart)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {formatRupiah(s.baseSalary)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {formatRupiah(
                      s.totalHonor > 0 ? s.totalHonor : s.honorPerMeeting * s.totalMeetings,
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-red-700">
                    {formatRupiah(s.deductions)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatRupiah(s.netAmount)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50">
              <tr>
                <td className="px-4 py-3 font-medium text-slate-700">Total</td>
                <td colSpan={3} />
                <td className="px-4 py-3 text-right font-bold text-primary-700">
                  {formatRupiah(totalNet)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
