import { useEffect, useState, useCallback } from 'react';
import {
  getFinancePaymentsGrouped,
  getStudentPayments,
  updateFinancePayment,
  generateFinancePayments,
  getFinanceSemesters,
  listProdis,
  ApiError,
} from '../lib/api';
import type {
  Payment,
  PaymentStatus,
  SemesterOption,
  StudentPaymentGroup,
  Prodi,
} from '../lib/types';

/** Halaman Kelola Tagihan — Admin Keuangan
 * Tabel grouped by NIM, detail per-semester + update.
 */
export function FinancePaymentsPage() {
  const [groups, setGroups] = useState<StudentPaymentGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<Set<number>>(new Set());
  const [payingAll, setPayingAll] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [semesters, setSemesters] = useState<SemesterOption[]>([]);
  const [prodis, setProdis] = useState<Prodi[]>([]);

  const [filters, setFilters] = useState({
    search: '',
    prodi_id: '' as string,
    page: 1,
    limit: 20,
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });

  // Detail state
  const [detailStudent, setDetailStudent] = useState<StudentPaymentGroup | null>(null);
  const [detailPayments, setDetailPayments] = useState<Payment[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Update modal state
  const [updateModal, setUpdateModal] = useState<{
    paymentId: number;
    currentPaid: number;
    totalAmount: number;
    existingProof: string | null;
  } | null>(null);
  const [updatePaidAmount, setUpdatePaidAmount] = useState('');
  const [updateProofFile, setUpdateProofFile] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getFinancePaymentsGrouped({
        search: filters.search || undefined,
        prodi_id: filters.prodi_id ? parseInt(filters.prodi_id) : undefined,
        page: filters.page,
        limit: filters.limit,
      });
      setGroups(data.items);
      setPagination(data.pagination);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Gagal memuat daftar tagihan';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [filters.search, filters.prodi_id, filters.page, filters.limit]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    let cancelled = false;
    getFinanceSemesters()
      .then((list) => {
        if (!cancelled) setSemesters(list);
      })
      .catch(() => {});
    listProdis()
      .then((res) => {
        if (!cancelled) setProdis(res.items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function openDetail(student: StudentPaymentGroup) {
    setDetailStudent(student);
    setDetailLoading(true);
    try {
      const payments = await getStudentPayments(student.studentId);
      setDetailPayments(payments);
    } catch {
      alert('Gagal memuat detail tagihan');
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleUpdateStatus(
    paymentId: number,
    paidAmount: number,
    proofUrl?: string | null,
  ) {
    setUpdating((prev) => new Set(prev).add(paymentId));
    try {
      await updateFinancePayment(paymentId, { paidAmount, proofUrl: proofUrl ?? null });
      // Refresh detail + list
      if (detailStudent) {
        const payments = await getStudentPayments(detailStudent.studentId);
        setDetailPayments(payments);
      }
      await loadGroups();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Gagal mengupdate status';
      alert(msg);
    } finally {
      setUpdating((prev) => {
        const next = new Set(prev);
        next.delete(paymentId);
        return next;
      });
    }
  }

  async function handleGeneratePayments() {
    setGenerating(true);
    try {
      // Generate for all semesters that have no payments yet
      for (const sem of semesters) {
        try {
          await generateFinancePayments(sem.id);
        } catch {
          // Skip semesters that already have payments
        }
      }
      alert('Tagihan berhasil di-generate');
      await loadGroups();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Gagal generate tagihan';
      alert(msg);
    } finally {
      setGenerating(false);
    }
  }

  async function handlePayAll() {
    if (!detailStudent) return;
    setPayingAll(true);
    try {
      const unpaidPayments = detailPayments.filter((p) => p.status !== 'lunas');
      for (const p of unpaidPayments) {
        await updateFinancePayment(p.id, { paidAmount: p.totalAmount, proofUrl: null });
      }
      alert('Semua tagihan berhasil dilunasi');
      // Refresh detail + list
      const payments = await getStudentPayments(detailStudent.studentId);
      setDetailPayments(payments);
      await loadGroups();
      setDetailStudent(null);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Gagal melunasi semua tagihan';
      alert(msg);
    } finally {
      setPayingAll(false);
    }
  }

  function formatRupiah(n: number): string {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(n);
  }

  function getStatusBadge(status: PaymentStatus) {
    const map: Record<string, { label: string; cls: string }> = {
      lunas: { label: 'Lunas', cls: 'bg-green-100 text-green-800' },
      partial: { label: 'Cicil', cls: 'bg-yellow-100 text-yellow-800' },
      belum_lunas: { label: 'Belum Lunas', cls: 'bg-red-100 text-red-800' },
    };
    const m = map[status] || { label: status, cls: 'bg-slate-100 text-slate-800' };
    return <span className={`px-2 py-1 text-xs font-medium rounded-full ${m.cls}`}>{m.label}</span>;
  }

  function getOverallBadge(allLunas: boolean) {
    return allLunas ? (
      <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
        Semua Lunas
      </span>
    ) : (
      <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
        Ada Tagihan
      </span>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filters.prodi_id}
          onChange={(e) => setFilters((f) => ({ ...f, prodi_id: e.target.value, page: 1 }))}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">Semua Prodi</option>
          {prodis.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Cari NIM/Nama..."
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-48 sm:w-64"
        />
        <button
          type="button"
          onClick={handleGeneratePayments}
          disabled={generating}
          className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {generating ? 'Generating...' : 'Generate Tagihan'}
        </button>
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
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Semester
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Tagihan
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Dibayar
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {groups.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    Tidak ada data tagihan
                  </td>
                </tr>
              )}
              {groups.map((g) => (
                <tr key={g.studentId} className="hover:bg-slate-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                    {g.nim}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-900">{g.fullName}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{g.prodiName}</td>
                  <td className="px-6 py-4 text-center text-sm text-slate-600">
                    {g.totalSemesters}
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-slate-900">
                    {formatRupiah(g.totalTagihan)}
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-slate-900">
                    {formatRupiah(g.totalPaid)}
                  </td>
                  <td className="px-6 py-4 text-center">{getOverallBadge(g.allLunas)}</td>
                  <td className="px-6 py-4 text-center">
                    <button
                      type="button"
                      onClick={() => openDetail(g)}
                      className="px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      Detail
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
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                disabled={filters.page === 1}
                className="px-3 py-1 border border-slate-300 rounded-lg text-sm disabled:opacity-50 hover:bg-slate-50"
              >
                Sebelumnya
              </button>
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                disabled={filters.page === pagination.totalPages}
                className="px-3 py-1 border border-slate-300 rounded-lg text-sm disabled:opacity-50 hover:bg-slate-50"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal — All payments per student */}
      {detailStudent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDetailStudent(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Tagihan: {detailStudent.nim}
                </h3>
                <p className="text-sm text-slate-500">
                  {detailStudent.fullName} — {detailStudent.prodiName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailStudent(null)}
                className="text-slate-500 hover:text-slate-700 text-2xl leading-none"
                aria-label="Tutup"
              >
                ×
              </button>
            </div>

            <div className="p-6">
              {detailLoading ? (
                <div className="text-center py-8 text-slate-500">Memuat data...</div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="bg-slate-50 rounded-lg p-4 mb-6">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-sm text-slate-500">Total Semester</p>
                        <p className="text-xl font-bold text-slate-900">
                          {detailStudent.totalSemesters}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Total Dibayar</p>
                        <p className="text-xl font-bold text-green-600">
                          {formatRupiah(detailStudent.totalPaid)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Sisa Tagihan</p>
                        <p className="text-xl font-bold text-red-600">
                          {formatRupiah(detailStudent.totalTagihan - detailStudent.totalPaid)}
                        </p>
                      </div>
                    </div>
                    {detailStudent.totalTagihan > detailStudent.totalPaid && (
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={handlePayAll}
                          disabled={payingAll}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {payingAll ? 'Memproses...' : 'Bayar Semua'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Payments Table */}
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                            Semester
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                            Total
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                            Dibayar
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                            Bukti
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                            Aksi
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {detailPayments.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-sm font-medium text-slate-900">
                              {p.semesterName}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-slate-900">
                              {formatRupiah(p.totalAmount)}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-slate-900">
                              {formatRupiah(p.paidAmount)}
                            </td>
                            <td className="px-4 py-3 text-center">{getStatusBadge(p.status)}</td>
                            <td className="px-4 py-3 text-center text-sm">
                              {p.proofUrl ? (
                                <a
                                  href={p.proofUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary-600 hover:underline"
                                >
                                  Lihat
                                </a>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {p.status === 'lunas' ? (
                                <span className="text-sm text-green-600">✓ Lunas</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUpdateModal({
                                      paymentId: p.id,
                                      currentPaid: p.paidAmount,
                                      totalAmount: p.totalAmount,
                                      existingProof: p.proofUrl,
                                    });
                                    setUpdatePaidAmount(String(p.paidAmount));
                                    setUpdateProofFile(null);
                                  }}
                                  disabled={updating.has(p.id)}
                                  className="px-3 py-1 text-sm font-medium text-primary-600 hover:text-primary-800 disabled:opacity-50 transition-colors"
                                >
                                  {updating.has(p.id) ? 'Menyimpan...' : 'Update'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setDetailStudent(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Update Payment Modal */}
      {updateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Update Pembayaran</h3>
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="text-sm text-slate-600">
                  Total:{' '}
                  <span className="font-medium">{formatRupiah(updateModal.totalAmount)}</span>
                </div>
                <div className="text-sm text-slate-600">
                  Sudah dibayar:{' '}
                  <span className="font-medium">{formatRupiah(updateModal.currentPaid)}</span>
                </div>
                <div className="text-sm text-slate-600">
                  Sisa:{' '}
                  <span className="font-medium">
                    {formatRupiah(updateModal.totalAmount - updateModal.currentPaid)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Jumlah yang dibayarkan (Rp)
                </label>
                <input
                  type="number"
                  value={updatePaidAmount}
                  onChange={(e) => setUpdatePaidAmount(e.target.value)}
                  min={0}
                  max={updateModal.totalAmount}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Masukkan jumlah"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Bukti Pembayaran (opsional)
                </label>
                {updateModal.existingProof && !updateProofFile && (
                  <div className="text-sm text-green-600 mb-2">
                    ✓ Bukti sudah ada —{' '}
                    <a
                      href={updateModal.existingProof}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      Lihat
                    </a>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setUpdateProofFile(reader.result as string);
                    reader.readAsDataURL(file);
                  }}
                  className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setUpdateModal(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const val = parseFloat(updatePaidAmount);
                    if (isNaN(val) || val < 0 || val > updateModal.totalAmount) {
                      alert('Jumlah tidak valid');
                      return;
                    }
                    handleUpdateStatus(updateModal.paymentId, val, updateProofFile);
                    setUpdateModal(null);
                  }}
                  disabled={updating.has(updateModal.paymentId)}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  {updating.has(updateModal.paymentId) ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
