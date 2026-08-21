import { useEffect, useState, useCallback, useRef } from 'react';
import { getMyPayments, getKrsAccess, getKrsPeriod, ApiError } from '../lib/api';
import type { MyPayment, KrsAccessResult, KrsPeriod } from '../lib/types';

/** Halaman Pembayaran Mahasiswa — T2.6
 * Menampilkan semua tagihan setiap semester + status + detail items.
 */
export function MyPaymentPage() {
  const [payments, setPayments] = useState<MyPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [krsAccess, setKrsAccess] = useState<KrsAccessResult | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<MyPayment | null>(null);

  const krsPeriodRef = useRef<KrsPeriod | null>(null);

  const checkKrsAccess = useCallback(async (semesterId: number) => {
    try {
      const access = await getKrsAccess(semesterId);
      setKrsAccess(access);
    } catch {
      setKrsAccess(null);
    }
  }, []);

  const loadKrsPeriod = useCallback(async () => {
    try {
      const period = await getKrsPeriod();
      if (period.status === 'open') {
        krsPeriodRef.current = period;
      }
    } catch {
      // ignore - period not open
    }
  }, []);

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getMyPayments();
      setPayments(data);

      await loadKrsPeriod();

      if (data.length > 0) {
        const krsSemesterId = krsPeriodRef.current?.semesterId ?? data[0].semesterId;
        await checkKrsAccess(krsSemesterId);
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Gagal memuat tagihan';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [checkKrsAccess, loadKrsPeriod]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  function formatRupiah(n: number): string {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(n);
  }

  function getStatusBadge(status: MyPayment['status']) {
    const map: Record<string, { label: string; cls: string }> = {
      lunas: { label: 'Lunas', cls: 'bg-green-100 text-green-800' },
      partial: { label: 'Cicil', cls: 'bg-yellow-100 text-yellow-800' },
      belum_lunas: { label: 'Belum Lunas', cls: 'bg-red-100 text-red-800' },
    };
    const m = map[status] || { label: status, cls: 'bg-slate-100 text-slate-800' };
    return <span className={`px-2 py-1 text-xs font-medium rounded-full ${m.cls}`}>{m.label}</span>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KRS Access Indicator */}
      {krsAccess && (
        <div
          className={`p-3 rounded-lg border ${krsAccess.canAccess ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}
        >
          <div className="flex items-center gap-2">
            <span className={krsAccess.canAccess ? 'text-green-600' : 'text-red-600'}>
              {krsAccess.canAccess ? '✓' : '✕'}
            </span>
            <span className="font-medium text-slate-800">
              {krsAccess.canAccess
                ? 'Anda dapat mengisi KRS (pembayaran lunas)'
                : 'KRS DIBLOKIR — Silakan lunasi tagihan terlebih dahulu'}
            </span>
          </div>
        </div>
      )}

      {/* All Payments Table */}
      {payments.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="font-semibold text-slate-900">Semua Tagihan</h3>
          </div>
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Semester
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Tagihan
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Terbayar
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Bukti
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {payments.map((payment) => (
                <tr key={payment.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                    {payment.semesterName} ({payment.semesterCode})
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-900">
                    {formatRupiah(payment.totalAmount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-900">
                    {formatRupiah(payment.paidAmount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {getStatusBadge(payment.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                    {payment.status === 'lunas' && payment.proofUrl ? (
                      <a
                        href={payment.proofUrl}
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
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <button
                      type="button"
                      onClick={() => setSelectedPayment(payment)}
                      className="px-3 py-1 text-sm font-medium text-primary-600 hover:text-primary-800 underline"
                    >
                      Detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-2 text-lg font-medium text-slate-900">Belum ada tagihan</h3>
          <p className="mt-1 text-slate-500">
            Tagihan akan muncul setelah admin generate untuk semester aktif.
          </p>
        </div>
      )}

      {/* Info */}
      <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
        <h4 className="font-medium text-primary-800 mb-2">Informasi Pembayaran</h4>
        <ul className="text-sm text-primary-700 space-y-1">
          <li>• Pembayaran dilakukan manual di bagian keuangan kampus</li>
          <li>• Simpan bukti pembayaran untuk verifikasi admin keuangan</li>
          <li>• Status akan diperbarui maksimal 1×24 jam setelah verifikasi</li>
          <li>
            • KRS hanya bisa diisi setelah status <strong>Lunas</strong>
          </li>
        </ul>
      </div>

      {/* Detail Modal */}
      {selectedPayment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedPayment(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Rincian Tagihan</h3>
                <p className="text-sm text-slate-500">{selectedPayment.semesterName}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPayment(null)}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
                aria-label="Tutup"
              >
                ×
              </button>
            </div>

            {/* Summary */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-sm text-slate-500">Total Tagihan</p>
                  <p className="text-xl font-bold text-slate-900">
                    {formatRupiah(selectedPayment.totalAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Terbayar</p>
                  <p className="text-xl font-bold text-green-600">
                    {formatRupiah(selectedPayment.paidAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Status</p>
                  <div className="mt-1">{getStatusBadge(selectedPayment.status)}</div>
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="p-6">
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
                  {selectedPayment.items.map((item, idx) => (
                    <tr key={item.id ?? idx} className="hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-900">
                        {item.type.toUpperCase()}
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
                      {formatRupiah(selectedPayment.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-center"></td>
                  </tr>
                </tbody>
              </table>

              {/* Progress bar untuk partial */}
              {selectedPayment.status === 'partial' && selectedPayment.paidAmount > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-500">
                      Terbayar: {formatRupiah(selectedPayment.paidAmount)}
                    </span>
                    <span className="text-slate-500">
                      Sisa: {formatRupiah(selectedPayment.totalAmount - selectedPayment.paidAmount)}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-500 transition-all duration-300"
                      style={{
                        width: `${(selectedPayment.paidAmount / selectedPayment.totalAmount) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Bukti Pembayaran */}
              {selectedPayment.status === 'lunas' && selectedPayment.proofUrl && (
                <div className="mt-4 p-3 rounded-lg bg-green-50 border border-green-200">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-green-600">✓</span>
                    <span className="font-medium text-slate-800">Bukti Pembayaran</span>
                  </div>
                  <a
                    href={selectedPayment.proofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary-600 hover:underline text-sm"
                  >
                    Lihat Bukti Pembayaran →
                  </a>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedPayment(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
