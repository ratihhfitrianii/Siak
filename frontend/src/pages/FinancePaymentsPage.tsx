import { useEffect, useState, useCallback } from 'react';
import {
  getFinancePayments,
  getFinanceSemesters,
  updateFinancePayment,
  generateFinancePayments,
  getFinancePayment,
  ApiError,
} from '../lib/api';
import type { Payment, PaymentStatus, SemesterOption } from '../lib/types';

/** Halaman Kelola Tagihan — Admin Keuangan (T2.6)
 * List tagihan semua mhs + filter + pagination + update status bayar (partial/lunas).
 */
export function FinancePaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<Set<number>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [semesters, setSemesters] = useState<SemesterOption[]>([]);

  // Filters
  const [filters, setFilters] = useState({
    semester_id: '' as string,
    status: '' as string,
    prodi_id: '' as string,
    page: 1,
    limit: 20,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // Detail modal state
  const [detailPayment, setDetailPayment] = useState<Payment | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Load payments when filters change
  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {
        semester_id: filters.semester_id ? parseInt(filters.semester_id) : undefined,
        status: filters.status || undefined,
        prodi_id: filters.prodi_id ? parseInt(filters.prodi_id) : undefined,
        page: filters.page,
        limit: filters.limit,
      };
      const data = await getFinancePayments(params);
      setPayments(data.data);
      setPagination(data.pagination);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Gagal memuat daftar tagihan';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [filters.page, filters.limit, filters.semester_id, filters.status, filters.prodi_id]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  // Muat daftar semester utk dropdown filter (keluhan #15/#16 — sebelumnya hardcoded id 1,2,3
  // yang tidak cocok dgn data produksi → filter tak pernah cocok → halaman tampak kosong).
  useEffect(() => {
    let cancelled = false;
    getFinanceSemesters()
      .then((list) => {
        if (!cancelled) setSemesters(list);
      })
      .catch(() => {
        // Non-blocking: dropdown tetap punya "Semua Semester" bila gagal.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUpdateStatus(paymentId: number, paidAmount: number) {
    const newUpdating = new Set(updating);
    newUpdating.add(paymentId);
    setUpdating(newUpdating);

    try {
      await updateFinancePayment(paymentId, { paidAmount });
      // Refresh list
      await loadPayments();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Gagal mengupdate status';
      alert(msg);
    } finally {
      const newUpdating2 = new Set(updating);
      newUpdating2.delete(paymentId);
      setUpdating(newUpdating2);
    }
  }

  async function handleGeneratePayments() {
    if (!filters.semester_id) {
      alert('Pilih semester terlebih dahulu');
      return;
    }
    setGenerating(true);
    try {
      await generateFinancePayments(parseInt(filters.semester_id));
      alert('Tagihan berhasil di-generate untuk semester ini');
      await loadPayments();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Gagal generate tagihan';
      alert(msg);
    } finally {
      setGenerating(false);
    }
  }

  function formatRupiah(n: number): string {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(n);
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function getStatusBadge(status: PaymentStatus) {
    const map: Record<string, { label: string; class: string }> = {
      lunas: { label: 'Lunas', class: 'bg-green-100 text-green-800' },
      partial: { label: 'Cicil', class: 'bg-yellow-100 text-yellow-800' },
      belum_lunas: { label: 'Belum Lunas', class: 'bg-red-100 text-red-800' },
    };
    const m = map[status] || { label: status, class: 'bg-slate-100 text-slate-800' };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${m.class}`}>{m.label}</span>
    );
  }

  function handlePageChange(page: number) {
    setFilters((f) => ({ ...f, page }));
  }

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kelola Tagihan</h1>
          <p className="text-slate-600 mt-1">Daftar tagihan mahasiswa per semester</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filters.semester_id}
            onChange={(e) => setFilters((f) => ({ ...f, semester_id: e.target.value, page: 1 }))}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            disabled={generating}
          >
            <option value="">Semua Semester</option>
            {semesters.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">Semua Status</option>
            <option value="belum_lunas">Belum Lunas</option>
            <option value="partial">Cicil</option>
            <option value="lunas">Lunas</option>
          </select>
          <button
            type="button"
            onClick={handleGeneratePayments}
            disabled={generating || !filters.semester_id}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? 'Generating...' : 'Generate Tagihan'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading && <div className="h-4 bg-slate-100 animate-pulse" />}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  NIM
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Nama
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Prodi
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Semester
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Dibayar
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Jatuh Tempo
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {payments.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                    Tidak ada data tagihan untuk filter ini
                  </td>
                </tr>
              )}
              {payments.map((payment) => (
                <tr key={payment.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                    {payment.nim}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-900">{payment.fullName}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{payment.prodiName}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{payment.semesterName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-900">
                    {formatRupiah(payment.totalAmount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-900">
                    {formatRupiah(payment.paidAmount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {getStatusBadge(payment.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-slate-500">
                    {formatDate(payment.dueDate)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDetailLoading(true);
                          getFinancePayment(payment.id)
                            .then(setDetailPayment)
                            .catch(() => alert('Gagal memuat detail'))
                            .finally(() => setDetailLoading(false));
                        }}
                        disabled={detailLoading}
                        className="px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50 transition-colors"
                      >
                        {detailLoading ? 'Memuat...' : 'Detail'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const current = payment.paidAmount;
                          const total = payment.totalAmount;
                          const remaining = total - current;
                          if (remaining <= 0) {
                            alert('Tagihan sudah lunas');
                            return;
                          }
                          const input = prompt(
                            `Update pembayaran untuk ${payment.nim} - ${payment.fullName}\n` +
                              `Total: ${formatRupiah(total)}\n` +
                              `Sudah dibayar: ${formatRupiah(current)}\n` +
                              `Sisa: ${formatRupiah(remaining)}\n\n` +
                              `Masukkan jumlah yang sudah dibayar (0-${total}):`,
                            String(current),
                          );
                          if (input !== null) {
                            const val = parseFloat(input);
                            if (!isNaN(val) && val >= 0 && val <= total) {
                              handleUpdateStatus(payment.id, val);
                            } else {
                              alert('Jumlah tidak valid');
                            }
                          }
                        }}
                        disabled={updating.has(payment.id) || payment.status === 'lunas'}
                        className="px-3 py-1 text-sm font-medium text-primary-600 hover:text-primary-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {updating.has(payment.id) ? 'Mengupdate...' : 'Update'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Menampilkan {(filters.page - 1) * filters.limit + 1} -{' '}
              {Math.min(filters.page * filters.limit, pagination.total)} dari {pagination.total}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handlePageChange(filters.page - 1)}
                disabled={filters.page === 1}
                className="px-3 py-1 border border-slate-300 rounded-lg text-sm disabled:opacity-50 hover:bg-slate-50"
              >
                Sebelumnya
              </button>
              <button
                type="button"
                onClick={() => handlePageChange(filters.page + 1)}
                disabled={filters.page === pagination.totalPages}
                className="px-3 py-1 border border-slate-300 rounded-lg text-sm disabled:opacity-50 hover:bg-slate-50"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        )}
      </div>
      {/* Detail Modal */}
      {detailPayment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDetailPayment(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-title"
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 id="detail-title" className="text-lg font-semibold text-slate-900">
                Rincian Tagihan: {detailPayment.nim} - {detailPayment.fullName}
              </h3>
              <button
                type="button"
                onClick={() => setDetailPayment(null)}
                className="text-slate-500 hover:text-slate-700 text-2xl leading-none"
                aria-label="Tutup"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Summary */}
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2">
                    <h4 className="font-medium text-slate-900">{detailPayment.semesterName}</h4>
                    <p className="text-sm text-slate-500 mt-1">
                      {detailPayment.prodiName} · Jatuh tempo: {formatDate(detailPayment.dueDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-500">Total Tagihan</p>
                    <p className="text-xl font-bold text-slate-900">
                      {formatRupiah(detailPayment.totalAmount)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-500">Status</p>
                    <div className="mt-1">{getStatusBadge(detailPayment.status)}</div>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Jenis
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Keterangan
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Jumlah
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Wajib
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {detailPayment.items.map((item, idx) => (
                      <tr key={item.id ?? idx} className="hover:bg-slate-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-900">
                          {item.type}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{item.description}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-slate-900">
                          {formatRupiah(item.amount)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center text-sm text-slate-500">
                          {item.isMandatory ? '✓' : '—'}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-semibold">
                      <td colSpan={2} className="px-4 py-3 text-right text-sm text-slate-900">
                        TOTAL
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-900">
                        {formatRupiah(detailPayment.totalAmount)}
                      </td>
                      <td className="px-4 py-3 text-center"></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setDetailPayment(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
