import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getPayrolls,
  generatePayrollBatch,
  approvePayroll,
  payPayroll,
  listProdis,
} from '../lib/api';
import type { SalarySlip, Prodi } from '../lib/types';
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

type SortKey = 'dosen' | 'periode' | 'gajiPokok' | 'honor' | 'potongan' | 'total' | 'status';
type SortDir = 'asc' | 'desc';

const KOLON: Array<{ key: SortKey; label: string; align: 'left' | 'right' | 'center' }> = [
  { key: 'dosen', label: 'Dosen', align: 'left' },
  { key: 'periode', label: 'Periode', align: 'left' },
  { key: 'gajiPokok', label: 'Gaji Pokok', align: 'right' },
  { key: 'honor', label: 'Honor', align: 'right' },
  { key: 'potongan', label: 'Potongan', align: 'right' },
  { key: 'total', label: 'Total', align: 'right' },
  { key: 'status', label: 'Status', align: 'center' },
];

const PAGE_SIZE = 10;

/**
 * Payroll (admin keuangan) — generate payroll bulanan semua dosen aktif,
 * lalu approve (satuan atau massal) & tandai dibayar per baris.
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

  // Pencarian live di atas list: otomatis aktif setelah >= 3 karakter (debounce)
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [prodiId, setProdiId] = useState<number | ''>('');
  const [prodis, setProdis] = useState<Prodi[]>([]);

  // Mode pilih-multi untuk approve massal
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Sort semua kolom + pagination client-side
  const [sortKey, setSortKey] = useState<SortKey>('dosen');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    listProdis()
      .then((res) => {
        if (!cancelled) setProdis(res.items);
      })
      .catch(() => {}); // dropdown prodi kosong kalau gagal — jangan blok halaman
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounce pencarian: >= 3 huruf/angka → langsung terapkan; kosong → reset
  useEffect(() => {
    const t = setTimeout(() => {
      const v = searchInput.trim();
      setQ(v.length >= 3 ? v : '');
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const lastDay = new Date(tahun, bulan + 1, 0).getDate();
      const start = `${tahun}-${String(bulan + 1).padStart(2, '0')}-01`;
      const end = `${tahun}-${String(bulan + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const res = await getPayrolls({
        periodStart: start,
        periodEnd: end,
        q: q || undefined,
        prodiId: prodiId === '' ? undefined : Number(prodiId),
      });
      setItems(res.items);
    } catch {
      setError('Gagal memuat data payroll');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [bulan, tahun, q, prodiId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Filter berubah → kembali ke halaman 1 dan bersihkan seleksi
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [bulan, tahun, q, prodiId]);

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

  /** Approve massal semua payroll draft yang dicentang. */
  async function handleApproveSelected() {
    const targets = items.filter((i) => i.status === 'draft' && selectedIds.has(i.id));
    if (targets.length === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      for (const t of targets) {
        await approvePayroll(t.id);
      }
      setNotice(`${targets.length} payroll berhasil disetujui`);
      setSelectedIds(new Set());
      setSelectMode(false);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal approve payroll terpilih');
    } finally {
      setBulkBusy(false);
    }
  }

  function toggleSelect(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function toggleSelectAllOnPage() {
    const drafts = sortedPaged.filter((i) => i.status === 'draft');
    const allSelected = drafts.every((i) => selectedIds.has(i.id));
    const next = new Set(selectedIds);
    for (const d of drafts) {
      if (allSelected) next.delete(d.id);
      else next.add(d.id);
    }
    setSelectedIds(next);
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir('asc');
    }
  }

  const honorOf = (p: SalarySlip) =>
    p.totalHonor > 0 ? p.totalHonor : p.honorPerMeeting * p.totalMeetings;

  const sortedPaged = useMemo(() => {
    const statusRank = (s: string) => (s === 'draft' ? 0 : s === 'approved' ? 1 : 2);
    const val = (p: SalarySlip): string | number => {
      switch (sortKey) {
        case 'dosen':
          return (p.lecturerName ?? `#${p.lecturerId}`).toLowerCase();
        case 'periode':
          return p.periodStart;
        case 'gajiPokok':
          return p.baseSalary;
        case 'honor':
          return honorOf(p);
        case 'potongan':
          return p.deductions;
        case 'total':
          return p.netAmount;
        case 'status':
          return statusRank(p.status);
        default:
          return '';
      }
    };
    const arr = [...items].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), 'id');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sortKey, sortDir, page]);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  const totalNet = items.reduce((sum, i) => sum + i.netAmount, 0);
  const draftTersedia = items.some((i) => i.status === 'draft');
  const selectedDraftCount = items.filter(
    (i) => i.status === 'draft' && selectedIds.has(i.id),
  ).length;

  return (
    <div className="space-y-4">
      {/* Filter periode + Prodi + Generate */}
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
          <div>
            <label
              htmlFor="payroll-prodi"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Prodi
            </label>
            <select
              id="payroll-prodi"
              value={prodiId}
              onChange={(e) => setProdiId(e.target.value === '' ? '' : Number(e.target.value))}
              className="px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm max-w-[180px]"
            >
              <option value="">Semua Prodi</option>
              {prodis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="px-4 py-2 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60 transition ml-auto"
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

      {/* Pencarian live — di atas list, tanpa tombol; aktif otomatis >= 3 karakter */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <label htmlFor="payroll-cari" className="block text-sm font-medium text-slate-700 mb-1">
          Cari Dosen
        </label>
        <input
          id="payroll-cari"
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Ketik minimal 3 huruf nama / angka NIDN…"
          className="w-full sm:w-80 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
        />
        {q && (
          <p className="mt-2 text-xs text-slate-500">
            Mencari “{q}” — {items.length} hasil
          </p>
        )}
      </div>

      {/* Toolbar mode pilih — tombol rata kanan */}
      {!loading && items.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!selectMode ? (
            <button
              type="button"
              onClick={() => setSelectMode(true)}
              disabled={!draftTersedia}
              title={
                draftTersedia
                  ? 'Pilih beberapa payroll draft untuk approve massal'
                  : 'Tidak ada payroll draft'
              }
              className="px-3 py-1.5 border border-primary-600 text-primary-700 rounded-md text-xs font-medium hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50 transition"
            >
              ☑ Pilih
            </button>
          ) : (
            <>
              <span className="text-sm font-medium text-slate-700">
                {selectedDraftCount} dipilih
              </span>
              <button
                type="button"
                onClick={() => void handleApproveSelected()}
                disabled={bulkBusy || selectedDraftCount === 0}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 transition"
              >
                {bulkBusy ? 'Memproses…' : `Approve Semua (${selectedDraftCount})`}
              </button>
              <button
                type="button"
                onClick={exitSelectMode}
                disabled={bulkBusy}
                className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-md text-xs font-medium hover:bg-slate-50 disabled:opacity-60 transition"
              >
                Batal
              </button>
            </>
          )}
        </div>
      )}

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
                {KOLON.map((c) => {
                  const aktif = c.key === sortKey;
                  return (
                    <th
                      key={c.key}
                      className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}
                      aria-sort={aktif ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        aria-label={`Urutkan ${c.label}`}
                        className={`inline-flex items-center gap-1 font-medium ${aktif ? 'text-primary-700' : 'text-slate-700'} hover:text-primary-700 transition`}
                      >
                        {c.label}
                        <span className="text-[10px]" aria-hidden="true">
                          {aktif ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </th>
                  );
                })}
                <th className="px-4 py-3 text-center font-medium text-slate-700">Aksi</th>
                {selectMode && (
                  <th className="px-4 py-3 text-center font-medium text-slate-700">
                    <input
                      type="checkbox"
                      aria-label="Pilih semua draft di halaman ini"
                      checked={
                        sortedPaged.some((i) => i.status === 'draft') &&
                        sortedPaged.every((i) => i.status !== 'draft' || selectedIds.has(i.id))
                      }
                      onChange={toggleSelectAllOnPage}
                      className="h-4 w-4 accent-primary-600 cursor-pointer"
                    />
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedPaged.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {p.lecturerName ?? `Lecturer #${p.lecturerId}`}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{periodeLabel(p.periodStart)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {formatRupiah(p.baseSalary)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {formatRupiah(honorOf(p))}
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
                        disabled={busyId === p.id || bulkBusy}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 disabled:opacity-60 transition"
                      >
                        {busyId === p.id ? '…' : 'Approve'}
                      </button>
                    )}
                    {p.status === 'approved' && (
                      <button
                        type="button"
                        onClick={() => void handlePay(p.id)}
                        disabled={busyId === p.id || bulkBusy}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-md text-xs font-medium hover:bg-green-700 disabled:opacity-60 transition"
                      >
                        {busyId === p.id ? '…' : 'Tandai Dibayar'}
                      </button>
                    )}
                    {p.status === 'paid' && (
                      <span className="text-xs text-slate-400">Selesai ✓</span>
                    )}
                  </td>
                  {selectMode && (
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Pilih payroll ${p.lecturerName ?? p.lecturerId}`}
                        disabled={p.status !== 'draft'}
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        className="h-4 w-4 accent-primary-600 cursor-pointer disabled:opacity-30"
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={5} className="px-4 py-3 font-medium text-slate-700">
                  Total {items.length} dosen — halaman {Math.min(page, totalPages)} dari{' '}
                  {totalPages}
                </td>
                <td className="px-4 py-3 text-right font-bold text-primary-700">
                  {formatRupiah(totalNet)}
                </td>
                <td colSpan={selectMode ? 3 : 2} />
              </tr>
            </tfoot>
          </table>

          {/* Pagination 10/baris */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-white">
              <span className="text-xs text-slate-500">
                Menampilkan {(Math.min(page, totalPages) - 1) * PAGE_SIZE + 1}–
                {Math.min(Math.min(page, totalPages) * PAGE_SIZE, items.length)} dari {items.length}{' '}
                data
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((n) => Math.max(1, n - 1))}
                  disabled={Math.min(page, totalPages) <= 1}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  ‹ Sebelumnya
                </button>
                <button
                  type="button"
                  onClick={() => setPage((n) => Math.min(totalPages, n + 1))}
                  disabled={Math.min(page, totalPages) >= totalPages}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Berikutnya ›
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
