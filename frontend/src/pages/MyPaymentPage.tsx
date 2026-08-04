import { useEffect, useState, useCallback } from 'react';
import { getMyPayments, getKrsAccess, ApiError } from '../lib/api';
import type { MyPayment, KrsAccessResult } from '../lib/types';

/** Halaman Pembayaran Mahasiswa — T2.6
 * Menampilkan tagihan per semester (SPP, Gedung, Tes) + status + detail items.
 */
export function MyPaymentPage() {
  const [payments, setPayments] = useState<MyPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSemesterId, setActiveSemesterId] = useState<number | null>(null);
  const [krsAccess, setKrsAccess] = useState<KrsAccessResult | null>(null);

  const checkKrsAccess = useCallback(async (semesterId: number) => {
    try {
      const access = await getKrsAccess(semesterId);
      setKrsAccess(access);
    } catch {
      setKrsAccess(null);
    }
  }, []);

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getMyPayments();
      setPayments(data);
      if (data.length > 0) {
        const latest = data[0];
        setActiveSemesterId(latest.semesterId);
        await checkKrsAccess(latest.semesterId);
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Gagal memuat tagihan';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [checkKrsAccess]);

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

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  function getStatusBadge(status: MyPayment['status']) {
    const map: Record<string, { label: string; class: string }> = {
      lunas: { label: 'Lunas', class: 'bg-green-100 text-green-800' },
      partial: { label: 'Cicil', class: 'bg-yellow-100 text-yellow-800' },
      belum_lunas: { label: 'Belum Lunas', class: 'bg-red-100 text-red-800' },
    };
    const m = map[status] || { label: status, class: 'bg-gray-100 text-gray-800' };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${m.class}`}>{m.label}</span>
    );
  }

  const payment = activeSemesterId ? payments.find((p) => p.semesterId === activeSemesterId) : null;

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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tagihan Saya</h1>
        <p className="text-gray-600 mt-1">Lihat detail pembayaran per semester</p>
      </div>

      {/* Semester Tabs */}
      {payments.length > 0 && (
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8" aria-label="Semester tabs">
            {payments.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setActiveSemesterId(p.semesterId);
                  checkKrsAccess(p.semesterId);
                }}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeSemesterId === p.semesterId
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {p.semesterName} ({p.semesterCode})
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* Payment Detail */}
      {payment && (
        <div className="space-y-6">
          {/* Summary Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <h2 className="text-lg font-semibold text-gray-900">{payment.semesterName}</h2>
                <p className="text-gray-500 text-sm mt-1">
                  {payment.prodiName} · Jatuh tempo: {formatDate(payment.dueDate)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Total Tagihan</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatRupiah(payment.totalAmount)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Status</p>
                <div className="mt-1">{getStatusBadge(payment.status)}</div>
              </div>
            </div>

            {/* Progress bar untuk partial */}
            {payment.status === 'partial' && payment.paidAmount > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">
                    Terbayar: {formatRupiah(payment.paidAmount)}
                  </span>
                  <span className="text-gray-500">
                    Sisa: {formatRupiah(payment.totalAmount - payment.paidAmount)}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-500 transition-all duration-300"
                    style={{ width: `${(payment.paidAmount / payment.totalAmount) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* KRS Access Indicator */}
            {krsAccess && (
              <div
                className={`mt-4 p-3 rounded-lg ${krsAccess.canAccess ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} border`}
              >
                <div className="flex items-center gap-2">
                  <span className={krsAccess.canAccess ? 'text-green-600' : 'text-red-600'}>
                    {krsAccess.canAccess ? '✓' : '✕'}
                  </span>
                  <span className="font-medium text-gray-800">
                    {krsAccess.canAccess
                      ? 'Anda dapat mengisi KRS (pembayaran lunas)'
                      : 'KRS DIBLOKIR — Silakan lunasi tagihan terlebih dahulu'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Items Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Rincian Tagihan</h3>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Jenis
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Keterangan
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Jumlah
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Wajib
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {payment.items.map((item, idx) => (
                  <tr key={item.id ?? idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.type}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{item.description}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {formatRupiah(item.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                      {item.isMandatory ? '✓' : '—'}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={2} className="px-6 py-4 text-right text-sm text-gray-900">
                    TOTAL
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-gray-900">
                    {formatRupiah(payment.totalAmount)}
                  </td>
                  <td className="px-6 py-4 text-center"></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-800 mb-2">Informasi Pembayaran</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Pembayaran dilakukan manual di bagian keuangan kampus</li>
              <li>• Simpan bukti pembayaran untuk verifikasi admin keuangan</li>
              <li>• Status akan diperbarui maksimal 1×24 jam setelah verifikasi</li>
              <li>
                • KRS hanya bisa diisi setelah status <strong>Lunas</strong>
              </li>
            </ul>
          </div>
        </div>
      )}

      {payments.length === 0 && (
        <div className="text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
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
          <h3 className="mt-2 text-lg font-medium text-gray-900">Belum ada tagihan</h3>
          <p className="mt-1 text-gray-500">
            Tagihan akan muncul setelah admin generate untuk semester aktif.
          </p>
        </div>
      )}
    </div>
  );
}
