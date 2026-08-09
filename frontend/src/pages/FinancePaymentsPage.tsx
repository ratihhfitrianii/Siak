import { useEffect, useState, useCallback } from 'react';
import {
  getFinancePayments,
  updateFinancePayment,
  generateFinancePayments,
  ApiError,
} from '../lib/api';
import type { Payment, PaymentStatus } from '../lib/types';

/** Halaman Kelola Tagihan — Admin Keuangan (T2.6)
 * List tagihan semua mhs + filter + pagination + update status bayar (partial/lunas).
 */
export function FinancePaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<Set<number>>(new Set());
  const [generating, setGenerating] = useState(false);

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
            {/* Options populated from data or hardcoded */}
            <option value="3">Ganjil 2024/2025 (2024/2025-1)</option>
            <option value="2">Genap 2023/2024 (2023/2024-2)</option>
            <option value="1">Ganjil 2023/2024 (2023/2024-1)</option>
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
    </div>
  );
}
